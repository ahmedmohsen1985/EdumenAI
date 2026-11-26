import crypto from 'node:crypto';
import {
  Prisma,
  type OtpPurpose,
  type PrismaClient,
  type TwoFactorMethod,
  type User
} from '@prisma/client';
import {
  ChangePasswordRequestSchema,
  DisableTotpSchema,
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  ResendOtpRequestSchema,
  ResetPasswordRequestSchema,
  UpdateProfileRequestSchema,
  VerifyOtpRequestSchema,
  VerifyTotpSetupSchema,
  type AuthUserView,
  type PublicInstructorView,
  type TwoFactorChallengeView
} from '@edumenai/shared';
import { env } from '../config/env.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import {
  isDevConsoleMailMode,
  sendPasswordResetEmail,
  sendVerificationOtpEmail
} from '../lib/mailer.js';
import {
  generateOpaqueToken,
  hashPassword,
  sha256Hex,
  verifyPassword
} from '../lib/password.js';
import { prisma, TX_OPTIONS } from '../lib/prisma.js';
import {
  buildOtpAuthUri,
  generateBase32Secret,
  verifyTotpCode
} from '../lib/totp.js';
import { getBillingConfig, grantWelcomeBonusTx } from './credits.service.js';
import { HttpError } from './exercise.service.js';

export const SESSION_COOKIE_NAME = 'edumenai_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const OTP_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 45 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const DUMMY_SCRYPT_HASH = `scrypt$00000000000000000000000000000000$${'0'.repeat(128)}`;

export interface RequestClientMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface SessionContext {
  user: User;
  sessionId: string;
}

export interface MePayload {
  user: AuthUserView | null;
  approvedInstructors: PublicInstructorView[];
  pendingInstructorCount: number;
  unreadNotificationCount: number;
  lowCreditThreshold: number;
  enforceCredits: boolean;
  isLowCredit: boolean;
}

export type LoginServiceResult =
  | { requiresTwoFactor: true; challenge: TwoFactorChallengeView }
  | { requiresTwoFactor: false; user: AuthUserView; sessionToken: string };

export interface VerifyOtpServiceResult {
  user: AuthUserView;
  sessionToken: string;
  trustedDeviceToken?: string;
}

function normalizeOptionalField(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0) return '***';
  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);
  if (!domain) return '***';
  if (local.length <= 2) {
    return `${local[0] ?? '*'}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function verifySixDigitDigest(candidate: string, expectedHex: string | null): boolean {
  if (!expectedHex || !/^\d{6}$/.test(candidate)) return false;
  try {
    const candidateBuf = Buffer.from(sha256Hex(candidate), 'hex');
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (candidateBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(candidateBuf, expectedBuf);
  } catch {
    return false;
  }
}

/** Strict allowlist projection — never exposes passwordHash, TOTP secrets, or internal tokens. */
export function toAuthUserView(user: User): AuthUserView {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorMethod: user.twoFactorMethod,
    school: user.school,
    className: user.className,
    telegramId: user.telegramId,
    parentPhone: user.parentPhone,
    parentTelegramId: user.parentTelegramId,
    bio: user.bio,
    creditBalance: user.creditBalance,
    sponsorStudentCredits: user.sponsorStudentCredits,
    createdAt: user.createdAt.toISOString()
  };
}

async function createChallengeTx(params: {
  tx: Prisma.TransactionClient;
  user: Pick<User, 'id' | 'email' | 'name'>;
  purpose: OtpPurpose;
  method: TwoFactorMethod;
}): Promise<{ challenge: TwoFactorChallengeView; otpCode: string | null }> {
  const { tx, user, purpose, method } = params;
  const rawChallengeToken = generateOpaqueToken(32);
  const challengeHash = sha256Hex(rawChallengeToken);
  const otpCode = method === 'EMAIL_OTP' ? String(crypto.randomInt(100000, 1000000)) : null;
  const codeHash = otpCode ? sha256Hex(otpCode) : null;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_CHALLENGE_TTL_MS);

  await tx.authChallenge.updateMany({
    where: {
      userId: user.id,
      purpose,
      consumedAt: null
    },
    data: {
      consumedAt: now
    }
  });

  await tx.authChallenge.create({
    data: {
      userId: user.id,
      purpose,
      method,
      challengeHash,
      codeHash,
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      lastSentAt: now,
      expiresAt
    }
  });

  const challenge: TwoFactorChallengeView = {
    challengeToken: rawChallengeToken,
    purpose,
    method,
    maskedEmail: maskEmail(user.email || ''),
    expiresAt: expiresAt.toISOString(),
    ...(method === 'EMAIL_OTP' && otpCode && isDevConsoleMailMode()
      ? { devOtpHint: otpCode }
      : {})
  };

  return { challenge, otpCode };
}

async function issueSessionAndOptionalTrustedDeviceTx(params: {
  tx: Prisma.TransactionClient;
  userId: string;
  trustDevice?: boolean;
  meta?: RequestClientMeta;
}): Promise<{ sessionToken: string; trustedDeviceToken?: string }> {
  const sessionToken = generateOpaqueToken(32);
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await params.tx.session.create({
    data: {
      userId: params.userId,
      tokenHash: sha256Hex(sessionToken),
      userAgent: params.meta?.userAgent ? params.meta.userAgent.slice(0, 500) : null,
      ipAddress: params.meta?.ipAddress ? params.meta.ipAddress.slice(0, 100) : null,
      expiresAt: sessionExpiresAt
    }
  });

  if (!params.trustDevice) {
    return { sessionToken };
  }

  const trustedDeviceToken = generateOpaqueToken(32);
  await params.tx.trustedDevice.create({
    data: {
      userId: params.userId,
      tokenHash: sha256Hex(trustedDeviceToken),
      userAgent: params.meta?.userAgent ? params.meta.userAgent.slice(0, 500) : null,
      expiresAt: new Date(Date.now() + TRUSTED_DEVICE_TTL_MS)
    }
  });

  return { sessionToken, trustedDeviceToken };
}

export async function registerUser(
  rawInput: unknown
): Promise<{ requiresVerification: true; challenge: TwoFactorChallengeView }> {
  const input = RegisterRequestSchema.parse(rawInput);

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true }
  });
  if (existing) {
    throw new HttpError(409, 'An account with this email already exists.', 'EMAIL_IN_USE');
  }

  const role: 'STUDENT' | 'INSTRUCTOR' = input.role === 'INSTRUCTOR' ? 'INSTRUCTOR' : 'STUDENT';
  const accountStatus = role === 'INSTRUCTOR' ? 'PENDING_APPROVAL' : 'ACTIVE';
  const passwordHash = await hashPassword(input.password);

  const { user, challenge, otpCode } = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        role,
        accountStatus,
        emailVerified: false,
        twoFactorEnabled: true,
        twoFactorMethod: 'EMAIL_OTP',
        school: normalizeOptionalField(input.school) ?? null,
        className: normalizeOptionalField(input.className) ?? null,
        telegramId: normalizeOptionalField(input.telegramId) ?? null,
        parentPhone: normalizeOptionalField(input.parentPhone) ?? null,
        parentTelegramId: normalizeOptionalField(input.parentTelegramId) ?? null,
        bio: normalizeOptionalField(input.bio) ?? null
      }
    });

    if (role === 'STUDENT' && input.instructorIds && input.instructorIds.length > 0) {
      const requestedIds = Array.from(new Set(input.instructorIds));
      const validInstructors = await tx.user.findMany({
        where: {
          id: { in: requestedIds },
          role: 'INSTRUCTOR',
          accountStatus: 'ACTIVE'
        },
        select: { id: true }
      });

      for (const inst of validInstructors) {
        await tx.studentInstructor.create({
          data: {
            studentId: created.id,
            instructorId: inst.id,
            status: 'PENDING'
          }
        });
        await tx.notification.create({
          data: {
            userId: inst.id,
            type: 'ENROLLMENT_REQUEST',
            title: 'New Student Enrollment Request',
            body: `${created.name || created.email || 'A student'} requested to join your roster.`,
            link: '/profile',
            metadata: { studentId: created.id }
          }
        });
      }
    }

    if (role === 'INSTRUCTOR') {
      const admins = await tx.user.findMany({
        where: { role: 'ADMIN', accountStatus: 'ACTIVE' },
        select: { id: true }
      });

      for (const admin of admins) {
        await tx.notification.create({
          data: {
            userId: admin.id,
            type: 'INSTRUCTOR_PENDING_APPROVAL',
            title: 'Instructor Pending Approval',
            body: `${created.name || created.email || 'A new instructor'} registered and is awaiting approval.`,
            link: '/admin/users',
            metadata: { instructorId: created.id }
          }
        });
      }
    }

    if (role === 'STUDENT') {
      await grantWelcomeBonusTx(tx, created.id);
    }

    const challengePayload = await createChallengeTx({
      tx,
      user: created,
      purpose: 'REGISTER_VERIFY',
      method: 'EMAIL_OTP'
    });

    return {
      user: created,
      challenge: challengePayload.challenge,
      otpCode: challengePayload.otpCode
    };
  }, TX_OPTIONS);

  if (user.email && otpCode) {
    await sendVerificationOtpEmail({
      to: user.email,
      name: user.name || 'User',
      code: otpCode,
      purpose: 'REGISTER_VERIFY'
    });
  }

  return {
    requiresVerification: true,
    challenge
  };
}

export async function verifyRegistrationOtp(
  rawInput: unknown,
  meta?: RequestClientMeta
): Promise<VerifyOtpServiceResult> {
  const input = VerifyOtpRequestSchema.parse(rawInput);
  const challengeHash = sha256Hex(input.challengeToken);

  const challenge = await prisma.authChallenge.findUnique({
    where: { challengeHash },
    include: { user: true }
  });

  if (
    !challenge ||
    challenge.purpose !== 'REGISTER_VERIFY' ||
    challenge.consumedAt !== null ||
    challenge.expiresAt.getTime() <= Date.now() ||
    challenge.attempts >= challenge.maxAttempts ||
    challenge.user.accountStatus === 'SUSPENDED'
  ) {
    throw new HttpError(
      400,
      'Verification challenge is invalid or has expired.',
      'INVALID_OR_EXPIRED_CHALLENGE'
    );
  }

  const valid = verifySixDigitDigest(input.code, challenge.codeHash);
  if (!valid) {
    await prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } }
    });
    throw new HttpError(400, 'Invalid verification code.', 'INVALID_OTP_CODE');
  }

  const now = new Date();
  const { updatedUser, sessionToken, trustedDeviceToken } = await prisma.$transaction(
    async (tx) => {
      await tx.authChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now }
      });

      const userRow = await tx.user.update({
        where: { id: challenge.userId },
        data: { emailVerified: true }
      });

      const tokens = await issueSessionAndOptionalTrustedDeviceTx({
        tx,
        userId: userRow.id,
        trustDevice: input.trustDevice,
        meta
      });

      return {
        updatedUser: userRow,
        ...tokens
      };
    },
    TX_OPTIONS
  );

  return {
    user: toAuthUserView(updatedUser),
    sessionToken,
    ...(trustedDeviceToken ? { trustedDeviceToken } : {})
  };
}

export async function loginUser(
  rawInput: unknown,
  meta?: RequestClientMeta & { trustedDeviceToken?: string }
): Promise<LoginServiceResult> {
  const input = LoginRequestSchema.parse(rawInput);

  const user = await prisma.user.findUnique({
    where: { email: input.email }
  });

  const passwordValid = await verifyPassword(
    input.password,
    user?.passwordHash ?? DUMMY_SCRYPT_HASH
  );

  if (!user || !user.passwordHash || !passwordValid) {
    throw new HttpError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
  }

  if (user.accountStatus === 'SUSPENDED') {
    throw new HttpError(
      403,
      'Your account has been suspended. Please contact an administrator.',
      'ACCOUNT_SUSPENDED'
    );
  }

  if (!user.emailVerified) {
    const { challenge, otpCode } = await prisma.$transaction(
      (tx) =>
        createChallengeTx({
          tx,
          user,
          purpose: 'REGISTER_VERIFY',
          method: 'EMAIL_OTP'
        }),
      TX_OPTIONS
    );

    if (user.email && otpCode) {
      await sendVerificationOtpEmail({
        to: user.email,
        name: user.name || 'User',
        code: otpCode,
        purpose: 'REGISTER_VERIFY'
      });
    }

    return {
      requiresTwoFactor: true,
      challenge
    };
  }

  if (user.twoFactorEnabled) {
    const presentedDeviceToken = meta?.trustedDeviceToken?.trim();
    if (presentedDeviceToken) {
      const trustedDevice = await prisma.trustedDevice.findUnique({
        where: { tokenHash: sha256Hex(presentedDeviceToken) }
      });
      if (
        trustedDevice &&
        trustedDevice.userId === user.id &&
        trustedDevice.expiresAt.getTime() > Date.now()
      ) {
        const sessionToken = generateOpaqueToken(32);
        await prisma.session.create({
          data: {
            userId: user.id,
            tokenHash: sha256Hex(sessionToken),
            userAgent: meta?.userAgent ? meta.userAgent.slice(0, 500) : null,
            ipAddress: meta?.ipAddress ? meta.ipAddress.slice(0, 100) : null,
            expiresAt: new Date(Date.now() + SESSION_TTL_MS)
          }
        });

        return {
          requiresTwoFactor: false,
          user: toAuthUserView(user),
          sessionToken
        };
      }
    }

    const effectiveMethod: TwoFactorMethod =
      user.twoFactorMethod === 'TOTP' && user.totpSecretEncrypted ? 'TOTP' : 'EMAIL_OTP';

    const { challenge, otpCode } = await prisma.$transaction(
      (tx) =>
        createChallengeTx({
          tx,
          user,
          purpose: 'LOGIN_2FA',
          method: effectiveMethod
        }),
      TX_OPTIONS
    );

    if (effectiveMethod === 'EMAIL_OTP' && user.email && otpCode) {
      await sendVerificationOtpEmail({
        to: user.email,
        name: user.name || 'User',
        code: otpCode,
        purpose: 'LOGIN_2FA'
      });
    }

    return {
      requiresTwoFactor: true,
      challenge
    };
  }

  const sessionToken = generateOpaqueToken(32);
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256Hex(sessionToken),
      userAgent: meta?.userAgent ? meta.userAgent.slice(0, 500) : null,
      ipAddress: meta?.ipAddress ? meta.ipAddress.slice(0, 100) : null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS)
    }
  });

  return {
    requiresTwoFactor: false,
    user: toAuthUserView(user),
    sessionToken
  };
}

export async function verifyLogin2fa(
  rawInput: unknown,
  meta?: RequestClientMeta
): Promise<VerifyOtpServiceResult> {
  const input = VerifyOtpRequestSchema.parse(rawInput);
  const challengeHash = sha256Hex(input.challengeToken);

  const challenge = await prisma.authChallenge.findUnique({
    where: { challengeHash },
    include: { user: true }
  });

  if (
    !challenge ||
    challenge.purpose !== 'LOGIN_2FA' ||
    challenge.consumedAt !== null ||
    challenge.expiresAt.getTime() <= Date.now() ||
    challenge.attempts >= challenge.maxAttempts ||
    challenge.user.accountStatus === 'SUSPENDED'
  ) {
    throw new HttpError(
      400,
      'Verification challenge is invalid or has expired.',
      'INVALID_OR_EXPIRED_CHALLENGE'
    );
  }

  let codeValid = false;
  if (challenge.method === 'TOTP') {
    if (challenge.user.totpSecretEncrypted) {
      try {
        const secret = decryptSecret(challenge.user.totpSecretEncrypted);
        codeValid = verifyTotpCode(secret, input.code);
      } catch {
        codeValid = false;
      }
    }
  } else {
    codeValid = verifySixDigitDigest(input.code, challenge.codeHash);
  }

  if (!codeValid) {
    await prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } }
    });
    throw new HttpError(400, 'Invalid verification code.', 'INVALID_OTP_CODE');
  }

  const now = new Date();
  const { sessionToken, trustedDeviceToken } = await prisma.$transaction(async (tx) => {
    await tx.authChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: now }
    });

    return issueSessionAndOptionalTrustedDeviceTx({
      tx,
      userId: challenge.userId,
      trustDevice: input.trustDevice,
      meta
    });
  }, TX_OPTIONS);

  return {
    user: toAuthUserView(challenge.user),
    sessionToken,
    ...(trustedDeviceToken ? { trustedDeviceToken } : {})
  };
}

export async function resendAuthOtp(
  rawInput: unknown
): Promise<{ challenge: TwoFactorChallengeView }> {
  const input = ResendOtpRequestSchema.parse(rawInput);
  const challengeHash = sha256Hex(input.challengeToken);

  const challenge = await prisma.authChallenge.findUnique({
    where: { challengeHash },
    include: { user: true }
  });

  if (
    !challenge ||
    challenge.consumedAt !== null ||
    challenge.user.accountStatus === 'SUSPENDED'
  ) {
    throw new HttpError(
      400,
      'Verification challenge is invalid or has expired.',
      'INVALID_OR_EXPIRED_CHALLENGE'
    );
  }

  if (challenge.method === 'TOTP') {
    throw new HttpError(
      400,
      'Authenticator app codes refresh automatically every 30 seconds.',
      'RESEND_NOT_SUPPORTED'
    );
  }

  const elapsedMs = Date.now() - challenge.lastSentAt.getTime();
  if (elapsedMs < OTP_RESEND_COOLDOWN_MS) {
    const waitSeconds = Math.max(1, Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsedMs) / 1000));
    throw new HttpError(
      429,
      `Please wait ${waitSeconds} seconds before requesting another code.`,
      'OTP_COOLDOWN'
    );
  }

  const otpCode = String(crypto.randomInt(100000, 1000000));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_CHALLENGE_TTL_MS);

  await prisma.authChallenge.update({
    where: { id: challenge.id },
    data: {
      codeHash: sha256Hex(otpCode),
      attempts: 0,
      lastSentAt: now,
      expiresAt
    }
  });

  if (challenge.user.email) {
    await sendVerificationOtpEmail({
      to: challenge.user.email,
      name: challenge.user.name || 'User',
      code: otpCode,
      purpose: challenge.purpose
    });
  }

  return {
    challenge: {
      challengeToken: input.challengeToken,
      purpose: challenge.purpose,
      method: challenge.method,
      maskedEmail: maskEmail(challenge.user.email || ''),
      expiresAt: expiresAt.toISOString(),
      ...(isDevConsoleMailMode() ? { devOtpHint: otpCode } : {})
    }
  };
}

export async function beginTotpSetup(
  userId: string
): Promise<{ secret: string; otpauthUri: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true }
  });

  if (!user) {
    throw new HttpError(404, 'User not found.', 'USER_NOT_FOUND');
  }

  const secret = generateBase32Secret(20);
  const encrypted = encryptSecret(secret);

  await prisma.user.update({
    where: { id: user.id },
    data: { totpPendingSecretEncrypted: encrypted }
  });

  return {
    secret,
    otpauthUri: buildOtpAuthUri({
      secret,
      email: user.email || user.id,
      issuer: env.twoFactorIssuer
    })
  };
}

export async function confirmTotpSetup(
  userId: string,
  rawInput: unknown
): Promise<{ user: AuthUserView }> {
  const input = VerifyTotpSetupSchema.parse(rawInput);

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  if (!user) {
    throw new HttpError(404, 'User not found.', 'USER_NOT_FOUND');
  }

  if (!user.totpPendingSecretEncrypted) {
    throw new HttpError(
      400,
      'No pending authenticator setup found. Please start setup again.',
      'NO_PENDING_TOTP'
    );
  }

  let secret = '';
  try {
    secret = decryptSecret(user.totpPendingSecretEncrypted);
  } catch {
    throw new HttpError(
      400,
      'Pending authenticator setup is corrupted. Please start setup again.',
      'INVALID_TOTP_SETUP'
    );
  }

  if (!verifyTotpCode(secret, input.code)) {
    throw new HttpError(400, 'Invalid authenticator code.', 'INVALID_TOTP_CODE');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      totpSecretEncrypted: encryptSecret(secret),
      totpPendingSecretEncrypted: null,
      twoFactorMethod: 'TOTP',
      twoFactorEnabled: true
    }
  });

  return { user: toAuthUserView(updated) };
}

export async function disableTotp(
  userId: string,
  rawInput: unknown
): Promise<{ user: AuthUserView }> {
  const input = DisableTotpSchema.parse(rawInput);

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  if (!user) {
    throw new HttpError(404, 'User not found.', 'USER_NOT_FOUND');
  }

  const validPassword = user.passwordHash
    ? await verifyPassword(input.currentPassword, user.passwordHash)
    : false;
  if (!validPassword) {
    throw new HttpError(401, 'Current password is incorrect.', 'INVALID_CURRENT_PASSWORD');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      totpSecretEncrypted: null,
      totpPendingSecretEncrypted: null,
      twoFactorMethod: 'EMAIL_OTP'
    }
  });

  return { user: toAuthUserView(updated) };
}

export async function revokeTrustedDevices(
  userId: string
): Promise<{ revokedCount: number }> {
  const res = await prisma.trustedDevice.deleteMany({
    where: { userId }
  });
  return { revokedCount: res.count };
}

export async function logoutByToken(rawToken: string): Promise<void> {
  const trimmed = rawToken.trim();
  if (!trimmed) return;
  await prisma.session.deleteMany({
    where: { tokenHash: sha256Hex(trimmed) }
  });
}

export async function getSessionContext(rawToken: string): Promise<SessionContext | null> {
  const trimmed = rawToken.trim();
  if (!trimmed) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256Hex(trimmed) },
    include: { user: true }
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return {
    user: session.user,
    sessionId: session.id
  };
}

export async function getMePayload(userId: string): Promise<MePayload> {
  const [user, billingConfig] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId }
    }),
    getBillingConfig()
  ]);

  if (!user || user.accountStatus === 'SUSPENDED') {
    return {
      user: null,
      approvedInstructors: [],
      pendingInstructorCount: 0,
      unreadNotificationCount: 0,
      lowCreditThreshold: billingConfig.lowCreditThreshold,
      enforceCredits: billingConfig.enforceCredits,
      isLowCredit: false
    };
  }

  const [enrollments, pendingInstructorCount, unreadNotificationCount] = await Promise.all([
    user.role === 'STUDENT'
      ? prisma.studentInstructor.findMany({
          where: {
            studentId: user.id,
            status: 'APPROVED',
            instructor: {
              role: 'INSTRUCTOR',
              accountStatus: 'ACTIVE'
            }
          },
          select: {
            instructor: {
              select: {
                id: true,
                name: true,
                school: true,
                bio: true
              }
            }
          },
          orderBy: {
            instructor: {
              name: 'asc'
            }
          }
        })
      : Promise.resolve([]),
    user.role === 'ADMIN'
      ? prisma.user.count({
          where: {
            role: 'INSTRUCTOR',
            accountStatus: 'PENDING_APPROVAL'
          }
        })
      : Promise.resolve(0),
    prisma.notification.count({
      where: {
        userId: user.id,
        isRead: false
      }
    })
  ]);

  return {
    user: toAuthUserView(user),
    approvedInstructors: enrollments.map((e) => e.instructor),
    pendingInstructorCount,
    unreadNotificationCount,
    lowCreditThreshold: billingConfig.lowCreditThreshold,
    enforceCredits: billingConfig.enforceCredits,
    isLowCredit:
      user.role !== 'ADMIN' && user.creditBalance <= billingConfig.lowCreditThreshold
  };
}

export async function updateMyProfile(
  userId: string,
  rawInput: unknown
): Promise<AuthUserView> {
  const input = UpdateProfileRequestSchema.parse(rawInput);

  const existing = await prisma.user.findUnique({
    where: { id: userId }
  });
  if (!existing) {
    throw new HttpError(404, 'User not found.', 'USER_NOT_FOUND');
  }

  const data: Prisma.UserUpdateInput = {};

  if (input.name !== undefined) {
    data.name = normalizeOptionalField(input.name) ?? null;
  }
  if (input.school !== undefined) {
    data.school = normalizeOptionalField(input.school) ?? null;
  }
  if (input.className !== undefined) {
    data.className = normalizeOptionalField(input.className) ?? null;
  }
  if (input.telegramId !== undefined) {
    data.telegramId = normalizeOptionalField(input.telegramId) ?? null;
  }
  if (input.parentPhone !== undefined) {
    data.parentPhone = normalizeOptionalField(input.parentPhone) ?? null;
  }
  if (input.parentTelegramId !== undefined) {
    data.parentTelegramId = normalizeOptionalField(input.parentTelegramId) ?? null;
  }
  if (input.bio !== undefined) {
    data.bio = normalizeOptionalField(input.bio) ?? null;
  }
  if (
    input.sponsorStudentCredits !== undefined &&
    (existing.role === 'INSTRUCTOR' || existing.role === 'ADMIN')
  ) {
    data.sponsorStudentCredits = input.sponsorStudentCredits;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data
  });

  return toAuthUserView(updated);
}

export async function changeMyPassword(
  userId: string,
  rawInput: unknown,
  currentSessionId?: string
): Promise<void> {
  const input = ChangePasswordRequestSchema.parse(rawInput);

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  if (!user) {
    throw new HttpError(404, 'User not found.', 'USER_NOT_FOUND');
  }

  const validCurrent = user.passwordHash
    ? await verifyPassword(input.currentPassword, user.passwordHash)
    : false;
  if (!validCurrent) {
    throw new HttpError(401, 'Current password is incorrect.', 'INVALID_CURRENT_PASSWORD');
  }

  const nextHash = await hashPassword(input.newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash: nextHash }
    });

    await tx.session.deleteMany({
      where: currentSessionId
        ? { userId, NOT: { id: currentSessionId } }
        : { userId }
    });

    await tx.trustedDevice.deleteMany({
      where: { userId }
    });
  }, TX_OPTIONS);
}

export async function requestPasswordReset(
  rawInput: unknown
): Promise<{ message: string }> {
  const input = ForgotPasswordRequestSchema.parse(rawInput);

  const user = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (user && user.accountStatus !== 'SUSPENDED') {
    const rawToken = generateOpaqueToken(32);
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() }
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt
        }
      });
    }, TX_OPTIONS);

    const resetUrl = `${env.appBaseUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail({
      to: input.email,
      name: user.name || 'User',
      resetUrl
    });

    if (env.nodeEnv !== 'production') {
      logger.info({ email: input.email, resetUrl }, 'Password reset link generated (non-prod)');
    }
  }

  return {
    message: 'If an account exists for that email, a password reset link has been sent.'
  };
}

export async function resetPasswordWithToken(
  rawInput: unknown
): Promise<{ message: string }> {
  const input = ResetPasswordRequestSchema.parse(rawInput);
  const tokenHash = sha256Hex(input.token);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (
    !record ||
    record.usedAt !== null ||
    record.expiresAt.getTime() <= Date.now() ||
    record.user.accountStatus === 'SUSPENDED'
  ) {
    throw new HttpError(400, 'Reset link is invalid or has expired.', 'INVALID_OR_EXPIRED_TOKEN');
  }

  const nextHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash: nextHash }
    });

    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() }
    });

    await tx.session.deleteMany({
      where: { userId: record.userId }
    });

    await tx.trustedDevice.deleteMany({
      where: { userId: record.userId }
    });
  }, TX_OPTIONS);

  return {
    message: 'Your password has been reset. You can now sign in.'
  };
}

export async function listPublicInstructors(): Promise<PublicInstructorView[]> {
  return prisma.user.findMany({
    where: {
      role: 'INSTRUCTOR',
      accountStatus: 'ACTIVE'
    },
    select: {
      id: true,
      name: true,
      school: true,
      bio: true
    },
    orderBy: {
      name: 'asc'
    }
  });
}

export async function bootstrapAdminIfConfigured(db: PrismaClient = prisma): Promise<void> {
  const rawEmail = env.adminBootstrapEmail.trim().toLowerCase();
  const rawPassword = env.adminBootstrapPassword.trim();
  if (!rawEmail || !rawPassword) {
    return;
  }

  const name = env.adminBootstrapName.trim() || 'Platform Admin';
  const existing = await db.user.findUnique({
    where: { email: rawEmail },
    select: {
      id: true,
      role: true,
      accountStatus: true,
      emailVerified: true,
      passwordHash: true
    }
  });

  if (
    existing &&
    existing.role === 'ADMIN' &&
    existing.accountStatus === 'ACTIVE' &&
    existing.emailVerified &&
    Boolean(existing.passwordHash)
  ) {
    logger.info({ email: rawEmail }, 'Bootstrap admin account already configured');
    return;
  }

  const passwordHash = await hashPassword(rawPassword);

  await db.user.upsert({
    where: { email: rawEmail },
    create: {
      email: rawEmail,
      name,
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
      emailVerified: true,
      passwordHash
    },
    update: {
      name,
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
      emailVerified: true,
      ...(existing?.passwordHash ? {} : { passwordHash })
    }
  });

  logger.info({ email: rawEmail }, 'Bootstrap admin account ensured');
}
