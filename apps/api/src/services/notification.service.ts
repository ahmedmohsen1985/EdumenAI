import { Prisma, type Notification, type PrismaClient } from '@prisma/client';
import type { NotificationType, NotificationView } from '@edumenai/shared';
import { prisma } from '../lib/prisma.js';
import { HttpError } from './exercise.service.js';

export type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
}

function mapNotification(row: Notification): NotificationView {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    metadata,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString()
  };
}

export async function createNotification(
  db: PrismaExecutor,
  params: CreateNotificationParams
): Promise<NotificationView> {
  const created = await db.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link ?? null,
      ...(params.metadata !== undefined && params.metadata !== null
        ? { metadata: params.metadata as Prisma.InputJsonValue }
        : {})
    }
  });

  return mapNotification(created);
}

export async function listUserNotifications(
  userId: string,
  limit = 30
): Promise<{ items: NotificationView[]; unreadCount: number }> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit
    }),
    prisma.notification.count({
      where: { userId, isRead: false }
    })
  ]);

  return {
    items: rows.map(mapNotification),
    unreadCount
  };
}

export async function markNotificationRead(
  userId: string,
  id: string
): Promise<NotificationView> {
  const existing = await prisma.notification.findFirst({
    where: { id, userId }
  });

  if (!existing) {
    throw new HttpError(404, `Notification "${id}" not found.`, 'NOTIFICATION_NOT_FOUND');
  }

  if (existing.isRead) {
    return mapNotification(existing);
  }

  const updated = await prisma.notification.update({
    where: { id: existing.id },
    data: { isRead: true }
  });

  return mapNotification(updated);
}

export async function markAllNotificationsRead(
  userId: string
): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true }
  });

  return { updated: result.count };
}
