import {
  ClassNameSchema,
  FullNameSchema,
  PhoneSchema,
  SchoolNameSchema,
  StrictEmailSchema,
  StrongPasswordSchema,
  TelegramGroupChatIdSchema,
  TelegramUserIdSchema
} from '@edumenai/shared';
interface SafeParseableSchema {
  safeParse: (
    value: unknown
  ) =>
    | { success: true }
    | { success: false; error: { issues: ReadonlyArray<{ message?: string }> } };
}

function parseWithSchema(schema: SafeParseableSchema, value: string): string | null {
  const result = schema.safeParse(value);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? 'Invalid value.';
}

export function validateFullName(val: string): string | null {
  if (!val.trim()) {
    return 'Full name is required (English letters, First and Last Name).';
  }
  return parseWithSchema(FullNameSchema, val);
}

export function validateStrictEmail(val: string): string | null {
  if (!val.trim()) {
    return 'Email address is required.';
  }
  return parseWithSchema(StrictEmailSchema, val);
}

export function validatePhone(val: string, required = false): string | null {
  const trimmed = val.trim();
  if (!trimmed) {
    return required ? 'Phone number is required.' : null;
  }
  return parseWithSchema(PhoneSchema, trimmed);
}

export function validateTelegramUserId(val: string, required = false): string | null {
  const trimmed = val.trim();
  if (!trimmed) {
    return required ? 'Telegram User ID is required.' : null;
  }
  return parseWithSchema(TelegramUserIdSchema, trimmed);
}

export function validateTelegramGroupId(val: string, required = false): string | null {
  const trimmed = val.trim();
  if (!trimmed) {
    return required ? 'Telegram Group Chat ID is required.' : null;
  }
  return parseWithSchema(TelegramGroupChatIdSchema, trimmed);
}

export function validateSchoolName(val: string, required = false): string | null {
  const trimmed = val.trim();
  if (!trimmed) {
    return required ? 'School or institution name is required.' : null;
  }
  return parseWithSchema(SchoolNameSchema, trimmed);
}

export function validateClassName(val: string, required = false): string | null {
  const trimmed = val.trim();
  if (!trimmed) {
    return required ? 'Class or grade is required.' : null;
  }
  return parseWithSchema(ClassNameSchema, trimmed);
}

export function validateStrongPassword(val: string): string | null {
  if (!val) {
    return 'Password is required.';
  }
  return parseWithSchema(StrongPasswordSchema, val);
}

export interface PasswordStrengthResult {
  valid: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Weak' | 'Fair' | 'Good' | 'Strong';
  checks: {
    minLength: boolean;
    hasLetter: boolean;
    hasNumber: boolean;
    hasExtra: boolean;
  };
}

export function getPasswordStrength(password: string): PasswordStrengthResult {
  const minLength = password.length >= 8 && password.length <= 128;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const hasExtra = (hasMixedCase || hasSymbol || password.length >= 12) && password.length >= 8;

  const valid = minLength && hasLetter && hasNumber;

  let rawScore = 0;
  if (minLength) rawScore += 1;
  if (hasLetter) rawScore += 1;
  if (hasNumber) rawScore += 1;
  if (valid && hasExtra) rawScore += 1;

  const score = Math.min(4, Math.max(0, rawScore)) as 0 | 1 | 2 | 3 | 4;
  const label: PasswordStrengthResult['label'] =
    score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong';

  return {
    valid,
    score,
    label,
    checks: {
      minLength,
      hasLetter,
      hasNumber,
      hasExtra
    }
  };
}
