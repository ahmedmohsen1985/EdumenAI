import { z } from 'zod';
import {
  ClassNameSchema,
  FullNameSchema,
  OptionalStrict,
  PhoneSchema,
  SchoolNameSchema,
  StrictEmailSchema,
  StrongPasswordSchema,
  TelegramUserIdSchema
} from './validation.js';

/**
 * Core Authentication, Two-Factor Auth, User Profile, RBAC, Enrollment & Notification contracts.
 */

export const UserRoleSchema = z.enum(['STUDENT', 'INSTRUCTOR', 'ADMIN']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const AccountStatusSchema = z.enum(['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED']);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const EnrollmentStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export type EnrollmentStatus = z.infer<typeof EnrollmentStatusSchema>;

export const NotificationTypeSchema = z.enum([
  'ENROLLMENT_REQUEST',
  'ENROLLMENT_APPROVED',
  'ENROLLMENT_REJECTED',
  'INSTRUCTOR_PENDING_APPROVAL',
  'INSTRUCTOR_APPROVED',
  'SYSTEM'
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const TwoFactorMethodSchema = z.enum(['EMAIL_OTP', 'TOTP']);
export type TwoFactorMethod = z.infer<typeof TwoFactorMethodSchema>;

export const OtpPurposeSchema = z.enum(['REGISTER_VERIFY', 'LOGIN_2FA']);
export type OtpPurpose = z.infer<typeof OtpPurposeSchema>;

const OptionalTrimmed = (max: number) => z.string().trim().max(max).nullable().optional();

export const RegisterRequestSchema = z.object({
  email: StrictEmailSchema,
  password: StrongPasswordSchema,
  name: FullNameSchema,
  role: z.enum(['STUDENT', 'INSTRUCTOR']).default('STUDENT'),
  school: OptionalStrict(SchoolNameSchema),
  className: OptionalStrict(ClassNameSchema),
  telegramId: OptionalStrict(TelegramUserIdSchema),
  parentPhone: OptionalStrict(PhoneSchema),
  parentTelegramId: OptionalStrict(TelegramUserIdSchema),
  bio: OptionalTrimmed(1000),
  instructorIds: z.array(z.string().trim().min(1)).max(20).optional()
});

export const LoginRequestSchema = z.object({
  email: StrictEmailSchema,
  password: z.string().min(1)
});

export const ForgotPasswordRequestSchema = z.object({
  email: StrictEmailSchema
});

export const ResetPasswordRequestSchema = z.object({
  token: z.string().trim().min(16),
  password: StrongPasswordSchema
});

export const UpdateProfileRequestSchema = z.object({
  name: FullNameSchema.optional(),
  school: OptionalStrict(SchoolNameSchema),
  className: OptionalStrict(ClassNameSchema),
  telegramId: OptionalStrict(TelegramUserIdSchema),
  parentPhone: OptionalStrict(PhoneSchema),
  parentTelegramId: OptionalStrict(TelegramUserIdSchema),
  bio: OptionalTrimmed(1000),
  sponsorStudentCredits: z.boolean().optional()
});

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: StrongPasswordSchema
});

export const CreateUserAdminSchema = z.object({
  email: StrictEmailSchema,
  password: StrongPasswordSchema,
  name: FullNameSchema,
  role: UserRoleSchema,
  accountStatus: AccountStatusSchema.default('ACTIVE'),
  school: OptionalStrict(SchoolNameSchema),
  className: OptionalStrict(ClassNameSchema),
  telegramId: OptionalStrict(TelegramUserIdSchema),
  parentPhone: OptionalStrict(PhoneSchema),
  parentTelegramId: OptionalStrict(TelegramUserIdSchema),
  bio: OptionalTrimmed(1000)
});

export const UpdateUserAdminSchema = z.object({
  name: FullNameSchema.optional(),
  role: UserRoleSchema.optional(),
  accountStatus: AccountStatusSchema.optional(),
  school: OptionalStrict(SchoolNameSchema),
  className: OptionalStrict(ClassNameSchema),
  telegramId: OptionalStrict(TelegramUserIdSchema),
  parentPhone: OptionalStrict(PhoneSchema),
  parentTelegramId: OptionalStrict(TelegramUserIdSchema),
  bio: OptionalTrimmed(1000),
  sponsorStudentCredits: z.boolean().optional()
});

export const RequestEnrollmentSchema = z.object({
  instructorId: z.string().trim().min(1),
  note: z.string().trim().max(300).optional()
});

export const RespondEnrollmentSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(300).optional()
});

export const VerifyOtpRequestSchema = z.object({
  challengeToken: z.string().min(16),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit verification code.'),
  trustDevice: z.boolean().optional().default(false)
});

export const ResendOtpRequestSchema = z.object({
  challengeToken: z.string().min(16)
});

export const VerifyTotpSetupSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit authenticator code.')
});

export const DisableTotpSchema = z.object({
  currentPassword: z.string().min(1)
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type CreateUserAdminRequest = z.infer<typeof CreateUserAdminSchema>;
export type UpdateUserAdminRequest = z.infer<typeof UpdateUserAdminSchema>;
export type RequestEnrollmentRequest = z.infer<typeof RequestEnrollmentSchema>;
export type RespondEnrollmentRequest = z.infer<typeof RespondEnrollmentSchema>;
export type VerifyOtpRequest = z.infer<typeof VerifyOtpRequestSchema>;
export type ResendOtpRequest = z.infer<typeof ResendOtpRequestSchema>;
export type VerifyTotpSetupRequest = z.infer<typeof VerifyTotpSetupSchema>;
export type DisableTotpRequest = z.infer<typeof DisableTotpSchema>;

export interface AuthUserView {
  id: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  twoFactorMethod: TwoFactorMethod;
  school: string | null;
  className: string | null;
  telegramId: string | null;
  parentPhone: string | null;
  parentTelegramId: string | null;
  bio: string | null;
  creditBalance: number;
  sponsorStudentCredits: boolean;
  createdAt: string;
}

export interface TwoFactorChallengeView {
  challengeToken: string;
  purpose: OtpPurpose;
  method: TwoFactorMethod;
  maskedEmail: string;
  expiresAt: string;
  devOtpHint?: string;
}

export interface PublicInstructorView {
  id: string;
  name: string | null;
  school: string | null;
  bio: string | null;
}

export interface EnrollmentView {
  id: string;
  studentId: string;
  instructorId: string;
  status: EnrollmentStatus;
  note: string | null;
  requestedAt: string;
  respondedAt: string | null;
  student?: {
    id: string;
    name: string | null;
    email: string | null;
    school: string | null;
    className: string | null;
    telegramId: string | null;
    parentPhone: string | null;
    parentTelegramId: string | null;
  };
  instructor?: PublicInstructorView;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface AdminUserView extends AuthUserView {
  studentEnrollmentCount: number;
  instructorStudentCount: number;
  submissionCount: number;
}
