import type { Prisma, User } from '@prisma/client';
import {
  RequestEnrollmentSchema,
  RespondEnrollmentSchema,
  type EnrollmentView
} from '@edumenai/shared';
import { appCache } from '../lib/cache.js';
import { prisma, TX_OPTIONS } from '../lib/prisma.js';
import { HttpError } from './exercise.service.js';
import { createNotification } from './notification.service.js';

const INSTRUCTOR_PUBLIC_SELECT = {
  id: true,
  name: true,
  school: true,
  bio: true
} as const;

const STUDENT_ROSTER_SELECT = {
  id: true,
  name: true,
  email: true,
  school: true,
  className: true,
  telegramId: true,
  parentPhone: true,
  parentTelegramId: true
} as const;

type EnrollmentWithInstructor = Prisma.StudentInstructorGetPayload<{
  include: {
    instructor: { select: typeof INSTRUCTOR_PUBLIC_SELECT };
  };
}>;

type EnrollmentWithStudent = Prisma.StudentInstructorGetPayload<{
  include: {
    student: { select: typeof STUDENT_ROSTER_SELECT };
  };
}>;

function mapEnrollmentWithInstructor(row: EnrollmentWithInstructor): EnrollmentView {
  return {
    id: row.id,
    studentId: row.studentId,
    instructorId: row.instructorId,
    status: row.status,
    note: row.note,
    requestedAt: row.requestedAt.toISOString(),
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
    instructor: row.instructor
  };
}

function mapEnrollmentWithStudent(row: EnrollmentWithStudent): EnrollmentView {
  return {
    id: row.id,
    studentId: row.studentId,
    instructorId: row.instructorId,
    status: row.status,
    note: row.note,
    requestedAt: row.requestedAt.toISOString(),
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
    student: row.student
  };
}

export async function listMyEnrollments(user: User): Promise<EnrollmentView[]> {
  if (user.role === 'STUDENT') {
    const rows = await prisma.studentInstructor.findMany({
      where: { studentId: user.id },
      include: {
        instructor: { select: INSTRUCTOR_PUBLIC_SELECT }
      },
      orderBy: { requestedAt: 'desc' }
    });
    return rows.map(mapEnrollmentWithInstructor);
  }

  const rows = await prisma.studentInstructor.findMany({
    where: { instructorId: user.id },
    include: {
      student: { select: STUDENT_ROSTER_SELECT }
    },
    orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }]
  });
  return rows.map(mapEnrollmentWithStudent);
}

export async function requestInstructorEnrollment(
  student: User,
  rawInput: unknown
): Promise<EnrollmentView> {
  const input = RequestEnrollmentSchema.parse(rawInput);

  if (input.instructorId === student.id) {
    throw new HttpError(400, 'You cannot enroll with yourself.', 'CANNOT_ENROLL_SELF');
  }

  const instructor = await prisma.user.findFirst({
    where: {
      id: input.instructorId,
      role: 'INSTRUCTOR',
      accountStatus: 'ACTIVE'
    }
  });

  if (!instructor) {
    throw new HttpError(404, 'Active instructor not found.', 'INSTRUCTOR_NOT_FOUND');
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.studentInstructor.findUnique({
      where: {
        studentId_instructorId: {
          studentId: student.id,
          instructorId: instructor.id
        }
      }
    });

    if (existing && (existing.status === 'PENDING' || existing.status === 'APPROVED')) {
      throw new HttpError(
        409,
        existing.status === 'APPROVED'
          ? 'You are already enrolled with this instructor.'
          : 'An enrollment request is already pending for this instructor.',
        'ENROLLMENT_EXISTS'
      );
    }

    const enrollment = existing
      ? await tx.studentInstructor.update({
          where: { id: existing.id },
          data: {
            status: 'PENDING',
            requestedAt: new Date(),
            respondedAt: null,
            note: input.note ?? null
          },
          include: {
            instructor: { select: INSTRUCTOR_PUBLIC_SELECT }
          }
        })
      : await tx.studentInstructor.create({
          data: {
            studentId: student.id,
            instructorId: instructor.id,
            status: 'PENDING',
            note: input.note ?? null
          },
          include: {
            instructor: { select: INSTRUCTOR_PUBLIC_SELECT }
          }
        });

    await createNotification(tx, {
      userId: instructor.id,
      type: 'ENROLLMENT_REQUEST',
      title: 'New Student Enrollment Request',
      body: `${student.name || student.email || 'A student'} requested to join your class.`,
      link: '/profile',
      metadata: {
        enrollmentId: enrollment.id,
        studentId: student.id
      }
    });

    return enrollment;
  }, TX_OPTIONS);

  appCache.delPrefix('exercises:published:list:');
  return mapEnrollmentWithInstructor(result);
}

export async function respondToEnrollment(
  actorUser: User,
  enrollmentId: string,
  rawInput: unknown
): Promise<EnrollmentView> {
  const input = RespondEnrollmentSchema.parse(rawInput);

  const existing = await prisma.studentInstructor.findUnique({
    where: { id: enrollmentId },
    include: {
      instructor: { select: INSTRUCTOR_PUBLIC_SELECT }
    }
  });

  if (!existing) {
    throw new HttpError(404, `Enrollment "${enrollmentId}" not found.`, 'ENROLLMENT_NOT_FOUND');
  }

  const isAuthorizedInstructor =
    actorUser.role === 'INSTRUCTOR' &&
    actorUser.accountStatus === 'ACTIVE' &&
    existing.instructorId === actorUser.id;

  if (actorUser.role !== 'ADMIN' && !isAuthorizedInstructor) {
    throw new HttpError(
      403,
      'You are not authorized to respond to this enrollment request.',
      'FORBIDDEN'
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.studentInstructor.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        respondedAt: new Date(),
        ...(input.note !== undefined ? { note: input.note } : {})
      },
      include: {
        student: { select: STUDENT_ROSTER_SELECT }
      }
    });

    const isApproved = input.status === 'APPROVED';
    await createNotification(tx, {
      userId: existing.studentId,
      type: isApproved ? 'ENROLLMENT_APPROVED' : 'ENROLLMENT_REJECTED',
      title: isApproved ? 'Enrollment Approved' : 'Enrollment Request Declined',
      body: isApproved
        ? `${existing.instructor.name || 'Your instructor'} approved your enrollment request.`
        : `${existing.instructor.name || 'Your instructor'} declined your enrollment request.`,
      link: '/profile',
      metadata: {
        enrollmentId: row.id,
        instructorId: existing.instructorId
      }
    });

    return row;
  }, TX_OPTIONS);

  appCache.delPrefix('exercises:published:list:');
  return mapEnrollmentWithStudent(updated);
}

export async function deleteEnrollment(
  actorUser: User,
  enrollmentId: string
): Promise<{ deleted: true; id: string }> {
  const existing = await prisma.studentInstructor.findUnique({
    where: { id: enrollmentId }
  });

  if (!existing) {
    throw new HttpError(404, `Enrollment "${enrollmentId}" not found.`, 'ENROLLMENT_NOT_FOUND');
  }

  const canDelete =
    actorUser.role === 'ADMIN' ||
    existing.studentId === actorUser.id ||
    existing.instructorId === actorUser.id;

  if (!canDelete) {
    throw new HttpError(403, 'You are not authorized to remove this enrollment.', 'FORBIDDEN');
  }

  await prisma.studentInstructor.delete({
    where: { id: existing.id }
  });

  appCache.delPrefix('exercises:published:list:');
  return { deleted: true, id: existing.id };
}
