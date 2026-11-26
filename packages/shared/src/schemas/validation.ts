import { z } from 'zod';

/** Collapse repeated whitespace and trim leading/trailing spaces. */
export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'dispostable.com',
  'fakeinbox.com',
  'getnada.com',
  'maildrop.cc'
]);

const FULL_NAME_PATTERN = /^[A-Za-z]{2,}(?:['’-][A-Za-z]+)*(?:\s+[A-Za-z]{2,}(?:['’-][A-Za-z]+)*)+$/;
const STRICT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/;
const EGYPT_MOBILE_PATTERN = /^(?:\+?20)?0?1[0125]\d{8}$/;
const E164_PHONE_PATTERN = /^\+[1-9]\d{9,14}$/;
const TELEGRAM_USER_ID_PATTERN = /^\d{5,15}$/;
const TELEGRAM_GROUP_CHAT_ID_PATTERN = /^-?\d{5,16}$/;
const SCHOOL_NAME_PATTERN = /^[A-Za-z0-9\s&.,'()-]+$/;
const CLASS_NAME_PATTERN = /^[A-Za-z0-9\s/-]+$/;
const REPEATED_CHAR_PATTERN = /(.)\1{3,}/i;

export const FullNameSchema = z
  .string()
  .transform((v) => normalizeWhitespace(v))
  .pipe(
    z
      .string()
      .min(4, 'Full name must use English letters only and include at least First and Last Name.')
      .max(120, 'Full name cannot exceed 120 characters.')
      .regex(
        FULL_NAME_PATTERN,
        'Full name must use English letters only and include at least First and Last Name.'
      )
      .refine(
        (v) => !REPEATED_CHAR_PATTERN.test(v),
        'Please enter a real First and Last Name without repeated characters.'
      )
  );

export const StrictEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .regex(STRICT_EMAIL_PATTERN, 'Enter a valid email address.')
      .email('Enter a valid email address.')
      .refine(
        (v) => !DISPOSABLE_EMAIL_DOMAINS.has(v.split('@')[1] || ''),
        'Disposable email addresses are not permitted.'
      )
  );

export const PhoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s()-]+/g, '').trim())
  .pipe(
    z
      .string()
      .refine(
        (v) => EGYPT_MOBILE_PATTERN.test(v) || E164_PHONE_PATTERN.test(v),
        'Enter a valid mobile number (e.g., +2010XXXXXXXX or 010XXXXXXXX).'
      )
  );

export const TelegramUserIdSchema = z
  .string()
  .trim()
  .regex(
    TELEGRAM_USER_ID_PATTERN,
    'Telegram User ID must be 5-15 numeric digits (get yours from @userinfobot).'
  );

export const TelegramGroupChatIdSchema = z
  .string()
  .trim()
  .regex(
    TELEGRAM_GROUP_CHAT_ID_PATTERN,
    'Telegram Chat ID must be numeric digits (e.g., -1001234567890).'
  );

export const SchoolNameSchema = z
  .string()
  .transform((v) => normalizeWhitespace(v))
  .pipe(
    z
      .string()
      .min(2, 'Enter a valid English school or institution name.')
      .max(160, 'School or institution name cannot exceed 160 characters.')
      .regex(SCHOOL_NAME_PATTERN, 'Enter a valid English school or institution name.')
      .refine(
        (v) => /[A-Za-z]{2,}/.test(v) && !REPEATED_CHAR_PATTERN.test(v),
        'Enter a valid English school or institution name.'
      )
  );

export const ClassNameSchema = z
  .string()
  .transform((v) => normalizeWhitespace(v))
  .pipe(
    z
      .string()
      .min(1, 'Enter a valid class or grade (English letters/numbers).')
      .max(60, 'Class or grade cannot exceed 60 characters.')
      .regex(CLASS_NAME_PATTERN, 'Enter a valid class or grade (English letters/numbers).')
      .refine((v) => /[A-Za-z0-9]/.test(v), 'Enter a valid class or grade (English letters/numbers).')
  );

export const StrongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters and include both letters and numbers.')
  .max(128, 'Password cannot exceed 128 characters.')
  .refine(
    (v) => /[A-Za-z]/.test(v) && /\d/.test(v),
    'Password must be at least 8 characters and include both letters and numbers.'
  );

export function OptionalStrict<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    schema.nullable().optional()
  );
}
