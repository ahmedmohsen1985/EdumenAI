import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  AccountStatusSchema,
  CreateUserAdminSchema,
  UpdateUserAdminSchema,
  UserRoleSchema,
  type AccountStatus,
  type AdminUserView,
  type UserRole
} from '@edumenai/shared';
import { env } from '../config/env.js';
import { hashPassword } from '../lib/password.js';
import { prisma, TX_OPTIONS } from '../lib/prisma.js';
import { HttpError } from './exercise.service.js';
import { createNotification } from './notification.service.js';

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  accountStatus: true,
  school: true,
  className: true,
  telegramId: true,
  parentPhone: true,
  parentTelegramId: true,
  bio: true,
  creditBalance: true,
  sponsorStudentCredits: true,
  createdAt: true,
  _count: {
    select: {
      studentEnrollments: true,
      instructorEnrollments: true,
      submissions: true
    }
  }
} as const;

type SelectedAdminUser = Prisma.UserGetPayload<{
  select: typeof ADMIN_USER_SELECT;
}>;

function mapAdminUser(row: SelectedAdminUser): AdminUserView {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    accountStatus: row.accountStatus,
    school: row.school,
    className: row.className,
    telegramId: row.telegramId,
    parentPhone: row.parentPhone,
    parentTelegramId: row.parentTelegramId,
    bio: row.bio,
    creditBalance: row.creditBalance,
    sponsorStudentCredits: row.sponsorStudentCredits,
    createdAt: row.createdAt.toISOString(),
    studentEnrollmentCount: row._count.studentEnrollments,
    instructorStudentCount: row._count.instructorEnrollments,
    submissionCount: row._count.submissions
  };
}

export interface ListUsersAdminParams {
  role?: string;
  accountStatus?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listUsersAdmin(
  params: ListUsersAdminParams = {}
): Promise<{ items: AdminUserView[]; total: number }> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  let roleFilter: UserRole | undefined;
  if (params.role && params.role !== 'ALL') {
    roleFilter = UserRoleSchema.parse(params.role);
  }

  let statusFilter: AccountStatus | undefined;
  if (params.accountStatus && params.accountStatus !== 'ALL') {
    statusFilter = AccountStatusSchema.parse(params.accountStatus);
  }

  const trimmedSearch = params.search?.trim();

  const where: Prisma.UserWhereInput = {
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(statusFilter ? { accountStatus: statusFilter } : {}),
    ...(trimmedSearch
      ? {
          OR: [
            { name: { contains: trimmedSearch, mode: 'insensitive' } },
            { email: { contains: trimmedSearch, mode: 'insensitive' } },
            { school: { contains: trimmedSearch, mode: 'insensitive' } }
          ]
        }
      : {})
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: ADMIN_USER_SELECT,
      orderBy: [{ accountStatus: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset
    }),
    prisma.user.count({ where })
  ]);

  return {
    items: rows.map(mapAdminUser),
    total
  };
}

export async function createUserAdmin(rawInput: unknown): Promise<AdminUserView> {
  const input = CreateUserAdminSchema.parse(rawInput);

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true }
  });

  if (existing) {
    throw new HttpError(409, 'An account with this email already exists.', 'EMAIL_IN_USE');
  }

  const passwordHash = await hashPassword(input.password);

  const created = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role,
      accountStatus: input.accountStatus,
      school: input.school ?? null,
      className: input.className ?? null,
      telegramId: input.telegramId ?? null,
      parentPhone: input.parentPhone ?? null,
      parentTelegramId: input.parentTelegramId ?? null,
      bio: input.bio ?? null
    },
    select: ADMIN_USER_SELECT
  });

  return mapAdminUser(created);
}

export async function updateUserAdmin(
  id: string,
  rawInput: unknown,
  actorUserId?: string
): Promise<AdminUserView> {
  const input = UpdateUserAdminSchema.parse(rawInput);

  const existing = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      accountStatus: true
    }
  });

  if (!existing) {
    throw new HttpError(404, `User "${id}" not found.`, 'USER_NOT_FOUND');
  }

  if (actorUserId && actorUserId === id) {
    const isSuspendingSelf =
      input.accountStatus !== undefined && input.accountStatus !== 'ACTIVE';
    const isDemotingSelf = input.role !== undefined && input.role !== 'ADMIN';
    if (isSuspendingSelf || isDemotingSelf) {
      throw new HttpError(
        400,
        'You cannot suspend or demote your own administrator account.',
        'CANNOT_MODIFY_OWN_ACCESS'
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.accountStatus !== undefined ? { accountStatus: input.accountStatus } : {}),
        ...(input.school !== undefined ? { school: input.school } : {}),
        ...(input.className !== undefined ? { className: input.className } : {}),
        ...(input.telegramId !== undefined ? { telegramId: input.telegramId } : {}),
        ...(input.parentPhone !== undefined ? { parentPhone: input.parentPhone } : {}),
        ...(input.parentTelegramId !== undefined
          ? { parentTelegramId: input.parentTelegramId }
          : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.sponsorStudentCredits !== undefined
          ? { sponsorStudentCredits: input.sponsorStudentCredits }
          : {})
      },
      select: ADMIN_USER_SELECT
    });

    if (
      existing.accountStatus === 'PENDING_APPROVAL' &&
      row.accountStatus === 'ACTIVE' &&
      row.role === 'INSTRUCTOR'
    ) {
      await createNotification(tx, {
        userId: row.id,
        type: 'INSTRUCTOR_APPROVED',
        title: 'Instructor Account Approved',
        body: 'Your instructor account has been approved by an administrator. You can now accept students.',
        link: '/profile'
      });
    }

    return row;
  }, TX_OPTIONS);

  return mapAdminUser(updated);
}

export async function createAdminPasswordResetLink(
  userId: string
): Promise<{ resetUrl: string; expiresAt: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }
  });

  if (!user) {
    throw new HttpError(404, `User "${userId}" not found.`, 'USER_NOT_FOUND');
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null
      },
      data: {
        usedAt: new Date()
      }
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
  return {
    resetUrl,
    expiresAt: expiresAt.toISOString()
  };
}

export async function deleteUserAdmin(
  id: string,
  actorUserId?: string
): Promise<{ deleted: true; id: string }> {
  if (actorUserId && actorUserId === id) {
    throw new HttpError(400, 'You cannot delete your own account.', 'CANNOT_DELETE_SELF');
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true }
  });

  if (!existing) {
    throw new HttpError(404, `User "${id}" not found.`, 'USER_NOT_FOUND');
  }

  await prisma.user.delete({
    where: { id: existing.id }
  });

  return { deleted: true, id: existing.id };
}
