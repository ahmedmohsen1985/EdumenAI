import { Prisma, type PrismaClient, type User } from '@prisma/client';
import {
  ChangePasswordRequestSchema,
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  UpdateProfileRequestSchema,
  type AuthUserView,
  type PublicInstructorView
} from '@edumenai/shared';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { sendPasswordResetEmail } from '../lib/mailer.js';
import { generateOpaqueToken, hashPassword, sha256Hex, verifyPassword } from '../lib/password.js';
import { prisma, TX_OPTIONS } from '../lib/prisma.js';
import { HttpError } from './exercise.service.js';

export const SESSION_COOKIE_NAME = 'edumenai_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
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
}

function normalizeOptionalField(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Strict allowlist projection — never exposes passwordHash or internal tokens. */
export function toAuthUserView(user: User): AuthUserView {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    accountStatus: user.accountStatus,
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

export async function registerUser(
  rawInput: unknown,
  meta?: RequestClientMeta
): Promise<{ user: AuthUserView; sessionToken: string }> {
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
  const rawToken = generateOpaqueToken(32);
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const createdUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        role,
        accountStatus,
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
            studentId: user.id,
            instructorId: inst.id,
            status: 'PENDING'
          }
        });
        await tx.notification.create({
          data: {
            userId: inst.id,
            type: 'ENROLLMENT_REQUEST',
            title: 'New Student Enrollment Request',
            body: `${user.name || user.email || 'A student'} requested to join your roster.`,
            link: '/profile',
            metadata: { studentId: user.id }
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
            body: `${user.name || user.email || 'A new instructor'} registered and is awaiting approval.`,
            link: '/admin/users',
            metadata: { instructorId: user.id }
          }
        });
      }
    }

    await tx.session.create({
      data: {
        userId: user.id,
        tokenHash,
        userAgent: meta?.userAgent ? meta.userAgent.slice(0, 500) : null,
        ipAddress: meta?.ipAddress ? meta.ipAddress.slice(0, 100) : null,
        expiresAt
      }
    });

    return user;
  }, TX_OPTIONS);

  return {
    user: toAuthUserView(createdUser),
    sessionToken: rawToken
  };
}

export async function loginUser(
  rawInput: unknown,
  meta?: RequestClientMeta
): Promise<{ user: AuthUserView; sessionToken: string }> {
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

  const rawToken = generateOpaqueToken(32);
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      userAgent: meta?.userAgent ? meta.userAgent.slice(0, 500) : null,
      ipAddress: meta?.ipAddress ? meta.ipAddress.slice(0, 100) : null,
      expiresAt
    }
  });

  return {
    user: toAuthUserView(user),
    sessionToken: rawToken
  };
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
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user || user.accountStatus === 'SUSPENDED') {
    return {
      user: null,
      approvedInstructors: [],
      pendingInstructorCount: 0,
      unreadNotificationCount: 0
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
    unreadNotificationCount
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
      passwordHash: true
    }
  });

  if (
    existing &&
    existing.role === 'ADMIN' &&
    existing.accountStatus === 'ACTIVE' &&
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
      passwordHash
    },
    update: {
      name,
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
      ...(existing?.passwordHash ? {} : { passwordHash })
    }
  });

  logger.info({ email: rawEmail }, 'Bootstrap admin account ensured');
}
