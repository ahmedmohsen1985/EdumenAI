import { z } from 'zod';

/**
 * Credits, Billing Configuration, Token Metrics & Anti-Cheat Integrity Contracts.
 */

export const CreditTransactionTypeSchema = z.enum([
  'WELCOME_BONUS',
  'TOP_UP',
  'DEDUCTION',
  'ADJUSTMENT',
  'REFUND'
]);
export type CreditTransactionType = z.infer<typeof CreditTransactionTypeSchema>;

export const IntegrityEventTypeSchema = z.enum([
  'tab_switch',
  'window_blur',
  'paste_blocked',
  'copy_blocked',
  'cut_blocked',
  'right_click_blocked'
]);
export type IntegrityEventType = z.infer<typeof IntegrityEventTypeSchema>;

export const IntegrityEventSchema = z.object({
  type: IntegrityEventTypeSchema,
  timestamp: z.string(),
  detail: z.string().max(200).optional()
});
export type IntegrityEvent = z.infer<typeof IntegrityEventSchema>;

export const IntegrityLogSchema = z.object({
  enabled: z.boolean(),
  tabSwitchCount: z.number().int().nonnegative().default(0),
  windowBlurCount: z.number().int().nonnegative().default(0),
  pasteBlockedCount: z.number().int().nonnegative().default(0),
  copyBlockedCount: z.number().int().nonnegative().default(0),
  rightClickBlockedCount: z.number().int().nonnegative().default(0),
  totalViolations: z.number().int().nonnegative().default(0),
  events: z.array(IntegrityEventSchema).max(100).default([])
});
export type IntegrityLog = z.infer<typeof IntegrityLogSchema>;

export const UpdateBillingConfigSchema = z.object({
  tokensPerCredit: z.number().int().min(100).max(100000).optional(),
  welcomeBonusCredits: z.number().int().min(0).max(10000).optional(),
  lowCreditThreshold: z.number().int().min(0).max(1000).optional(),
  enforceCredits: z.boolean().optional()
});
export type UpdateBillingConfig = z.infer<typeof UpdateBillingConfigSchema>;

export const AdminAdjustCreditsSchema = z.object({
  amount: z.number().int().refine((n) => n !== 0, 'Amount must be non-zero.'),
  type: z.enum(['TOP_UP', 'ADJUSTMENT', 'REFUND']).default('TOP_UP'),
  note: z.string().trim().min(2).max(300)
});
export type AdminAdjustCredits = z.infer<typeof AdminAdjustCreditsSchema>;

export interface PlatformBillingConfigView {
  tokensPerCredit: number;
  welcomeBonusCredits: number;
  lowCreditThreshold: number;
  enforceCredits: boolean;
  updatedAt: string | null;
}

export interface CreditTransactionView {
  id: string;
  userId: string;
  actorUserId: string | null;
  submissionId: string | null;
  type: CreditTransactionType;
  amount: number;
  balanceAfter: number;
  tokensUsed: number | null;
  operation: string | null;
  note: string | null;
  createdAt: string;
}

export interface MyCreditsPayload {
  creditBalance: number;
  lowCreditThreshold: number;
  isLowCredit: boolean;
  enforceCredits: boolean;
  sponsorStudentCredits: boolean;
  transactions: CreditTransactionView[];
}

export interface TokenMetricsResponse {
  periodDays: number;
  summary: {
    totalEvaluations: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    avgLatencyMs: number;
    totalCreditsDeducted: number;
  };
  byProviderModel: Array<{
    provider: string;
    model: string;
    evaluations: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    avgLatencyMs: number;
  }>;
  byExercise: Array<{
    exerciseCode: string;
    exerciseTitle: string;
    evaluations: number;
    totalTokens: number;
  }>;
  daily: Array<{
    date: string;
    evaluations: number;
    totalTokens: number;
    creditsDeducted: number;
  }>;
}
