import { Prisma, type PlatformBillingConfig, type User } from '@prisma/client';
import {
  AdminAdjustCreditsSchema,
  UpdateBillingConfigSchema,
  type CreditTransactionView,
  type MyCreditsPayload,
  type PlatformBillingConfigView
} from '@edumenai/shared';
import { appCache } from '../lib/cache.js';
import { prisma, TX_OPTIONS } from '../lib/prisma.js';
import { HttpError } from './exercise.service.js';

const DEFAULT_BILLING_CONFIG: PlatformBillingConfigView = {
  tokensPerCredit: 1000,
  welcomeBonusCredits: 50,
  lowCreditThreshold: 10,
  enforceCredits: false,
  updatedAt: null
};

function toBillingConfigView(row: PlatformBillingConfig | null): PlatformBillingConfigView {
  if (!row) {
    return { ...DEFAULT_BILLING_CONFIG };
  }
  return {
    tokensPerCredit: row.tokensPerCredit,
    welcomeBonusCredits: row.welcomeBonusCredits,
    lowCreditThreshold: row.lowCreditThreshold,
    enforceCredits: row.enforceCredits,
    updatedAt: row.updatedAt.toISOString()
  };
}

function toTransactionView(row: {
  id: string;
  userId: string;
  actorUserId: string | null;
  submissionId: string | null;
  type: CreditTransactionView['type'];
  amount: number;
  balanceAfter: number;
  tokensUsed: number | null;
  operation: string | null;
  note: string | null;
  createdAt: Date;
}): CreditTransactionView {
  return {
    id: row.id,
    userId: row.userId,
    actorUserId: row.actorUserId,
    submissionId: row.submissionId,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    tokensUsed: row.tokensUsed,
    operation: row.operation,
    note: row.note,
    createdAt: row.createdAt.toISOString()
  };
}

export async function getBillingConfig(): Promise<PlatformBillingConfigView> {
  return appCache.getOrSet('billing:config', async () => {
    const row = await prisma.platformBillingConfig.findUnique({
      where: { key: 'default' }
    });
    return toBillingConfigView(row);
  });
}

export async function updateBillingConfig(
  rawInput: unknown
): Promise<PlatformBillingConfigView> {
  const input = UpdateBillingConfigSchema.parse(rawInput);

  const row = await prisma.platformBillingConfig.upsert({
    where: { key: 'default' },
    create: {
      key: 'default',
      tokensPerCredit: input.tokensPerCredit ?? DEFAULT_BILLING_CONFIG.tokensPerCredit,
      welcomeBonusCredits: input.welcomeBonusCredits ?? DEFAULT_BILLING_CONFIG.welcomeBonusCredits,
      lowCreditThreshold: input.lowCreditThreshold ?? DEFAULT_BILLING_CONFIG.lowCreditThreshold,
      enforceCredits: input.enforceCredits ?? DEFAULT_BILLING_CONFIG.enforceCredits
    },
    update: {
      ...(input.tokensPerCredit !== undefined ? { tokensPerCredit: input.tokensPerCredit } : {}),
      ...(input.welcomeBonusCredits !== undefined
        ? { welcomeBonusCredits: input.welcomeBonusCredits }
        : {}),
      ...(input.lowCreditThreshold !== undefined
        ? { lowCreditThreshold: input.lowCreditThreshold }
        : {}),
      ...(input.enforceCredits !== undefined ? { enforceCredits: input.enforceCredits } : {})
    }
  });

  appCache.delPrefix('billing:');
  return toBillingConfigView(row);
}

export async function resolveBillableUser(
  studentUser: User,
  instructorId?: string | null
): Promise<User> {
  const trimmedInstructorId = instructorId?.trim();
  if (trimmedInstructorId) {
    const sponsoredEnrollment = await prisma.studentInstructor.findFirst({
      where: {
        studentId: studentUser.id,
        instructorId: trimmedInstructorId,
        status: 'APPROVED',
        instructor: {
          role: 'INSTRUCTOR',
          accountStatus: 'ACTIVE',
          sponsorStudentCredits: true
        }
      },
      include: {
        instructor: true
      }
    });

    if (sponsoredEnrollment) {
      return sponsoredEnrollment.instructor;
    }
  }

  const freshStudent = await prisma.user.findUnique({
    where: { id: studentUser.id }
  });
  return freshStudent ?? studentUser;
}

export async function checkCreditEligibility(
  studentUser: User,
  instructorId?: string | null
): Promise<void> {
  const [config, billableUser] = await Promise.all([
    getBillingConfig(),
    resolveBillableUser(studentUser, instructorId)
  ]);

  if (config.enforceCredits && billableUser.creditBalance <= 0) {
    throw new HttpError(
      402,
      'Insufficient credits remaining to run this AI assessment. Please top up your credits.',
      'INSUFFICIENT_CREDITS'
    );
  }
}

export async function deductCreditsForAiUsage(params: {
  studentUser: User;
  instructorId?: string | null;
  submissionId?: string | null;
  tokensUsed?: number | null;
  operation: 'ocr' | 'evaluation';
}): Promise<{
  creditsDeducted: number;
  balanceAfter: number;
  isLowCredit: boolean;
  billedUserId: string;
}> {
  const [config, billableUser] = await Promise.all([
    getBillingConfig(),
    resolveBillableUser(params.studentUser, params.instructorId)
  ]);

  const safeTokens = Math.max(0, params.tokensUsed ?? 0);
  const cost = Math.max(1, Math.ceil(safeTokens / config.tokensPerCredit));

  const result = await prisma.$transaction(async (tx) => {
    const freshUser = await tx.user.findUniqueOrThrow({
      where: { id: billableUser.id },
      select: { id: true, creditBalance: true }
    });

    const current = freshUser.creditBalance;
    const nextBalance = Math.max(0, current - cost);

    await tx.user.update({
      where: { id: billableUser.id },
      data: { creditBalance: nextBalance }
    });

    await tx.creditTransaction.create({
      data: {
        userId: billableUser.id,
        submissionId: params.submissionId ?? null,
        type: 'DEDUCTION',
        amount: -cost,
        balanceAfter: nextBalance,
        tokensUsed: params.tokensUsed ?? null,
        operation: params.operation,
        note: params.operation === 'ocr' ? 'AI Handwriting OCR' : 'AI Assessment Evaluation'
      }
    });

    if (
      config.lowCreditThreshold > 0 &&
      current > config.lowCreditThreshold &&
      nextBalance <= config.lowCreditThreshold
    ) {
      await tx.notification.create({
        data: {
          userId: billableUser.id,
          type: 'SYSTEM',
          title: 'Low Credit Balance Warning',
          body: `Your credit balance has dropped to ${nextBalance} credit${
            nextBalance === 1 ? '' : 's'
          } (threshold: ${config.lowCreditThreshold}). Please top up to avoid interruptions.`,
          link: '/profile',
          metadata: {
            balanceAfter: nextBalance,
            lowCreditThreshold: config.lowCreditThreshold
          }
        }
      });
    }

    return {
      creditsDeducted: cost,
      balanceAfter: nextBalance,
      isLowCredit: nextBalance <= config.lowCreditThreshold,
      billedUserId: billableUser.id
    };
  }, TX_OPTIONS);

  appCache.delPrefix('metrics:');
  return result;
}

export async function grantWelcomeBonusTx(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  const cfg = await tx.platformBillingConfig.findUnique({
    where: { key: 'default' }
  });
  const welcomeBonus = cfg?.welcomeBonusCredits ?? DEFAULT_BILLING_CONFIG.welcomeBonusCredits;
  if (welcomeBonus <= 0) {
    return;
  }

  const updated = await tx.user.update({
    where: { id: userId },
    data: {
      creditBalance: { increment: welcomeBonus }
    },
    select: { creditBalance: true }
  });

  await tx.creditTransaction.create({
    data: {
      userId,
      type: 'WELCOME_BONUS',
      amount: welcomeBonus,
      balanceAfter: updated.creditBalance,
      note: 'Welcome bonus credits'
    }
  });
}

export async function adjustUserCreditsAdmin(
  targetUserId: string,
  actorUserId: string | null,
  rawInput: unknown
): Promise<{
  userId: string;
  creditBalance: number;
  transaction: CreditTransactionView;
}> {
  const parsed = AdminAdjustCreditsSchema.parse(rawInput);

  const result = await prisma.$transaction(async (tx) => {
    const targetUser = await tx.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, creditBalance: true }
    });

    if (!targetUser) {
      throw new HttpError(404, 'User not found.', 'USER_NOT_FOUND');
    }

    const nextBalance = targetUser.creditBalance + parsed.amount;
    if (nextBalance < 0) {
      throw new HttpError(
        400,
        'Credit balance cannot become negative.',
        'INSUFFICIENT_BALANCE'
      );
    }

    await tx.user.update({
      where: { id: targetUserId },
      data: { creditBalance: nextBalance }
    });

    const txRow = await tx.creditTransaction.create({
      data: {
        userId: targetUserId,
        actorUserId,
        type: parsed.type,
        amount: parsed.amount,
        balanceAfter: nextBalance,
        note: parsed.note
      }
    });

    return {
      userId: targetUserId,
      creditBalance: nextBalance,
      transaction: toTransactionView(txRow)
    };
  }, TX_OPTIONS);

  appCache.delPrefix('metrics:');
  return result;
}

export async function getMyCreditsPayload(
  userId: string,
  limit = 30
): Promise<MyCreditsPayload> {
  const take = Math.min(Math.max(Math.trunc(limit), 1), 100);

  const [user, config, rows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        creditBalance: true,
        sponsorStudentCredits: true
      }
    }),
    getBillingConfig(),
    prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take
    })
  ]);

  if (!user) {
    throw new HttpError(404, 'User not found.', 'USER_NOT_FOUND');
  }

  return {
    creditBalance: user.creditBalance,
    lowCreditThreshold: config.lowCreditThreshold,
    isLowCredit: user.role !== 'ADMIN' && user.creditBalance <= config.lowCreditThreshold,
    enforceCredits: config.enforceCredits,
    sponsorStudentCredits: user.sponsorStudentCredits,
    transactions: rows.map(toTransactionView)
  };
}
