import {
  type CreateTelegramTarget,
  CreateTelegramTargetSchema,
  type MarkingReport,
  type TelegramConfigView,
  type TelegramTargetView,
  type UpdateTelegramTarget,
  UpdateTelegramTargetSchema,
  type UpsertTelegramConfig,
  UpsertTelegramConfigSchema
} from '@edumenai/shared';
import { decryptSecret, encryptSecret, maskSecret } from '../lib/crypto.js';
import { appCache } from '../lib/cache.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

const MAX_MESSAGE_LENGTH = 4000;
const QUOTA_ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const quotaAlertCooldowns = new Map<string, number>();

export interface TelegramStudentInfo {
  name?: string;
  school?: string;
  className?: string;
  class?: string;
  telegram?: string;
  telegramId?: string;
}

export interface TelegramApiResult {
  ok?: boolean;
  description?: string;
  result?: { message_id?: number };
  [key: string]: unknown;
}

function escapeTelegramHtml(str: string | null | undefined): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function resolveBotToken(): Promise<string> {
  const envToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

  try {
    const dbConfig = await prisma.telegramConfig.findUnique({
      where: { key: 'default' }
    });
    if (dbConfig) {
      if (!dbConfig.isEnabled) {
        return '';
      }
      if (dbConfig.botToken.trim()) {
        const decrypted = decryptSecret(dbConfig.botToken).trim();
        if (decrypted) return decrypted;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed reading TelegramConfig from DB; falling back to .env');
  }

  return envToken;
}

async function resolveTargetChatIds(targetIds?: string[]): Promise<string[]> {
  const envGroup = (process.env.TELEGRAM_TEACHER_GROUP_ID || '').trim();

  try {
    if (Array.isArray(targetIds) && targetIds.length > 0) {
      const targets = await prisma.telegramTarget.findMany({
        where: { id: { in: targetIds }, isActive: true },
        orderBy: { createdAt: 'asc' }
      });
      const ids = targets.map((t) => t.chatId.trim()).filter(Boolean);
      if (ids.length > 0) return [...new Set(ids)];
    }

    const defaultTargets = await prisma.telegramTarget.findMany({
      where: { isActive: true, isDefault: true },
      orderBy: { createdAt: 'asc' }
    });
    const defaultIds = defaultTargets.map((t) => t.chatId.trim()).filter(Boolean);
    if (defaultIds.length > 0) return [...new Set(defaultIds)];
  } catch (err) {
    logger.warn({ err }, 'Failed reading TelegramTarget from DB; falling back to .env');
  }

  return envGroup ? [envGroup] : [];
}

function toTargetView(row: {
  id: string;
  name: string;
  chatId: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TelegramTargetView {
  return {
    id: row.id,
    name: row.name,
    chatId: row.chatId,
    description: row.description,
    isDefault: row.isDefault,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function getTelegramConfigView(): Promise<TelegramConfigView> {
  return appCache.getOrSet('telegram:config', async () => {
    const envToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

    try {
      const dbConfig = await prisma.telegramConfig.findUnique({
        where: { key: 'default' }
      });
      if (dbConfig) {
        let plainToken = '';
        if (dbConfig.botToken.trim()) {
          try {
            plainToken = decryptSecret(dbConfig.botToken).trim();
          } catch {
            plainToken = '';
          }
        }
        const effectiveToken = plainToken || envToken;
        const source: 'database' | 'env' | 'none' = plainToken
          ? 'database'
          : envToken
            ? 'env'
            : 'none';
        return {
          hasBotToken: Boolean(effectiveToken),
          botTokenMasked: maskSecret(effectiveToken),
          isEnabled: dbConfig.isEnabled,
          source,
          updatedAt: dbConfig.updatedAt.toISOString()
        };
      }
    } catch (err) {
      logger.warn({ err }, 'Failed reading TelegramConfig view from DB');
    }

    return {
      hasBotToken: Boolean(envToken),
      botTokenMasked: maskSecret(envToken),
      isEnabled: Boolean(envToken),
      source: envToken ? 'env' : 'none',
      updatedAt: null
    };
  });
}

export async function upsertTelegramConfig(input: UpsertTelegramConfig): Promise<TelegramConfigView> {
  const parsed = UpsertTelegramConfigSchema.parse(input);
  const existing = await prisma.telegramConfig.findUnique({
    where: { key: 'default' }
  });

  const newToken = parsed.botToken !== undefined ? parsed.botToken.trim() : '';
  const encryptedToken = newToken ? encryptSecret(newToken) : (existing?.botToken ?? '');

  await prisma.telegramConfig.upsert({
    where: { key: 'default' },
    create: {
      key: 'default',
      botToken: encryptedToken,
      isEnabled: parsed.isEnabled
    },
    update: {
      botToken: encryptedToken,
      isEnabled: parsed.isEnabled
    }
  });

  appCache.delPrefix('telegram:');
  return getTelegramConfigView();
}

export async function listTelegramTargets(): Promise<TelegramTargetView[]> {
  return appCache.getOrSet('telegram:targets', async () => {
    const rows = await prisma.telegramTarget.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });
    return rows.map(toTargetView);
  });
}

export async function createTelegramTarget(input: CreateTelegramTarget): Promise<TelegramTargetView> {
  const parsed = CreateTelegramTargetSchema.parse(input);
  const created = await prisma.telegramTarget.create({
    data: {
      name: parsed.name.trim(),
      chatId: parsed.chatId.trim(),
      description: parsed.description?.trim() || null,
      isDefault: parsed.isDefault ?? false,
      isActive: parsed.isActive ?? true
    }
  });
  appCache.delPrefix('telegram:');
  return toTargetView(created);
}

export async function updateTelegramTarget(
  id: string,
  input: UpdateTelegramTarget
): Promise<TelegramTargetView> {
  const parsed = UpdateTelegramTargetSchema.parse(input);
  const updated = await prisma.telegramTarget.update({
    where: { id },
    data: {
      ...(parsed.name !== undefined ? { name: parsed.name.trim() } : {}),
      ...(parsed.chatId !== undefined ? { chatId: parsed.chatId.trim() } : {}),
      ...(parsed.description !== undefined
        ? { description: parsed.description.trim() || null }
        : {}),
      ...(parsed.isDefault !== undefined ? { isDefault: parsed.isDefault } : {}),
      ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {})
    }
  });
  appCache.delPrefix('telegram:');
  return toTargetView(updated);
}

export async function deleteTelegramTarget(id: string): Promise<{ id: string; deleted: boolean }> {
  await prisma.telegramTarget.delete({ where: { id } });
  appCache.delPrefix('telegram:');
  return { id, deleted: true };
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<TelegramApiResult | null> {
  const token = await resolveBotToken();
  if (!chatId || !token) {
    logger.warn('[Telegram] sendTelegramMessage skipped: missing chatId or bot token.');
    return null;
  }

  const cleanChatId = String(chatId).trim();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  async function post(targetId: string): Promise<TelegramApiResult> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetId,
        text: text.slice(0, MAX_MESSAGE_LENGTH),
        parse_mode: parseMode,
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(15000)
    });
    return (await res.json()) as TelegramApiResult;
  }

  try {
    const data = await post(cleanChatId);

    if (!data.ok && data.description && data.description.includes('chat not found')) {
      if (cleanChatId.startsWith('-') && !cleanChatId.startsWith('-100')) {
        const altId = `-100${cleanChatId.slice(1)}`;
        logger.info(`[Telegram] Retrying sendMessage with supergroup ID: ${altId}`);
        const retryData = await post(altId);
        if (retryData.ok) return retryData;
      }
    }

    if (!data.ok) {
      logger.error(`[Telegram] sendMessage to ${cleanChatId} failed: ${data.description}`);
    } else {
      logger.info(`[Telegram] sendMessage to ${cleanChatId} delivered.`);
    }

    return data;
  } catch (err) {
    logger.error({ err, chatId: cleanChatId }, '[Telegram] Send message error');
    return null;
  }
}

export async function sendTelegramDocument(
  chatId: string,
  fileBuffer: Buffer,
  fileName: string,
  caption = ''
): Promise<TelegramApiResult | null> {
  const token = await resolveBotToken();
  if (!chatId || !token || !fileBuffer) {
    logger.warn('[Telegram] sendTelegramDocument skipped: missing chatId, token, or fileBuffer.');
    return null;
  }

  const cleanChatId = String(chatId).trim();
  const url = `https://api.telegram.org/bot${token}/sendDocument`;

  async function postDoc(targetId: string): Promise<TelegramApiResult> {
    const formData = new FormData();
    formData.append('chat_id', targetId);
    formData.append(
      'document',
      new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }),
      fileName || 'EdumenAI_Report.pdf'
    );
    if (caption) {
      formData.append('caption', caption.slice(0, 1024));
      formData.append('parse_mode', 'HTML');
    }

    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30000)
    });
    return (await res.json()) as TelegramApiResult;
  }

  try {
    const data = await postDoc(cleanChatId);

    if (!data.ok && data.description && data.description.includes('chat not found')) {
      if (cleanChatId.startsWith('-') && !cleanChatId.startsWith('-100')) {
        const altId = `-100${cleanChatId.slice(1)}`;
        logger.info(`[Telegram] Retrying sendDocument with supergroup ID: ${altId}`);
        const retryData = await postDoc(altId);
        if (retryData.ok) return retryData;
      }
    }

    if (!data.ok) {
      logger.error(`[Telegram] sendDocument to ${cleanChatId} failed: ${data.description}`);
    } else {
      logger.info(`[Telegram] sendDocument to ${cleanChatId} delivered (${fileName}).`);
    }

    return data;
  } catch (err) {
    logger.error({ err, chatId: cleanChatId }, '[Telegram] Send document error');
    return null;
  }
}

export async function sendTelegramTestMessage(
  chatId: string,
  customMessage?: string
): Promise<{ ok: boolean; chatId: string; messageId?: number; error?: string }> {
  const token = await resolveBotToken();
  if (!token) {
    return {
      ok: false,
      chatId,
      error: 'Telegram bot token is not configured or Telegram integration is disabled.'
    };
  }

  const text =
    customMessage?.trim() ||
    '✅ <b>EdumenAI Telegram Test</b>\nYour Telegram bot and target chat are configured correctly.';
  const result = await sendTelegramMessage(chatId, text);

  if (!result) {
    return { ok: false, chatId, error: 'Failed to reach Telegram API.' };
  }
  if (!result.ok) {
    return { ok: false, chatId, error: result.description || 'Telegram rejected the message.' };
  }
  return {
    ok: true,
    chatId,
    messageId: result.result?.message_id
  };
}

export async function notifyStudent(
  telegramId: string,
  studentName: string,
  evaluation: Partial<MarkingReport>,
  exerciseTitle = 'Assessment'
): Promise<TelegramApiResult | null> {
  if (!telegramId) return null;

  const firstName = studentName ? studentName.split(' ')[0] : 'Student';
  const errorCount = Array.isArray(evaluation.errors) ? evaluation.errors.length : 0;
  const marks = evaluation.marks;
  const safeTitle = escapeTelegramHtml(exerciseTitle || 'Assessment');

  const msg = `
🌟 <b>EdumenAI - ${safeTitle} Evaluation</b>
👤 <b>Student:</b> ${escapeTelegramHtml(firstName)}

📊 <b>Scores:</b>
• Total: <b>${marks?.total ?? 0} / ${marks?.total_max ?? 23}</b>
• Content & Communication: <b>${marks?.content ?? 0} / ${marks?.content_max ?? 8}</b>
• Language: <b>${marks?.language ?? 0} / ${marks?.language_max ?? 15}</b>

💡 <b>Examiner Verdict:</b>
${escapeTelegramHtml(evaluation.justification?.content || '')}
${escapeTelegramHtml(evaluation.justification?.language || '')}

🔍 <b>Errors Detected:</b> ${errorCount} item(s) found.
Check the detailed report on your screen!

<i>EdumenAI powered by EDUMENIA</i>
`;

  return sendTelegramMessage(telegramId, msg);
}

export async function sendTeacherAudit(
  studentInfo: TelegramStudentInfo,
  textOrRaw: string | undefined,
  finalOrEval?: string | Partial<MarkingReport>,
  maybeEval?: Partial<MarkingReport>,
  targetIds?: string[],
  exerciseTitle = 'Assessment'
): Promise<Array<{ chatId: string; result: TelegramApiResult | null }>> {
  const resolvedTargets = await resolveTargetChatIds(targetIds);
  if (resolvedTargets.length === 0) {
    logger.warn('[Telegram] sendTeacherAudit skipped: no Telegram targets configured.');
    return [];
  }

  const evaluation: Partial<MarkingReport> =
    maybeEval ||
    (typeof finalOrEval === 'object' && finalOrEval !== null ? finalOrEval : {}) ||
    {};
  const studentText =
    typeof textOrRaw === 'string'
      ? maybeEval && typeof finalOrEval === 'string'
        ? finalOrEval || textOrRaw
        : textOrRaw
      : typeof finalOrEval === 'string'
        ? finalOrEval
        : '';

  const errorCount = Array.isArray(evaluation.errors) ? evaluation.errors.length : 0;
  const marks = evaluation.marks;
  const snippet = studentText.trim();
  const classLabel = studentInfo.className || studentInfo.class || 'Class';
  const safeTitle = escapeTelegramHtml(exerciseTitle || 'Assessment');

  const auditMsg = `
📋 <b>AUDIT REPORT - ${safeTitle}</b>
👤 <b>Student:</b> ${escapeTelegramHtml(studentInfo.name || 'Unknown')} (${escapeTelegramHtml(studentInfo.school || 'General')} - ${escapeTelegramHtml(classLabel)})
📱 <b>Telegram ID:</b> ${escapeTelegramHtml(studentInfo.telegram || studentInfo.telegramId || 'N/A')}
📊 <b>Result:</b> <b>${marks?.total ?? 0}/${marks?.total_max ?? 23}</b> (Content: ${marks?.content ?? 0}/${marks?.content_max ?? 8}, Language: ${marks?.language ?? 0}/${marks?.language_max ?? 15})
🔍 <b>Errors Flagged:</b> ${errorCount}
🔒 <b>Mode:</b> EdumenAI Dynamic Assessment

📝 <b>Student Submission:</b>
<code>${escapeTelegramHtml(snippet.substring(0, 1500))}</code>
`;

  const results: Array<{ chatId: string; result: TelegramApiResult | null }> = [];
  for (const chatId of resolvedTargets) {
    const result = await sendTelegramMessage(chatId, auditMsg);
    results.push({ chatId, result });
  }
  return results;
}

export async function dispatchFullReportWithPdf({
  studentInfo,
  evaluation,
  pdfBuffer,
  fileName,
  targetIds,
  exerciseTitle = 'Assessment'
}: {
  studentInfo: TelegramStudentInfo;
  evaluation: Partial<MarkingReport>;
  rawText?: string;
  finalText?: string;
  pdfBuffer?: Buffer;
  fileName?: string;
  targetIds?: string[];
  exerciseTitle?: string;
}): Promise<{
  targets: Array<{ chatId: string; ok: boolean; error?: string }>;
  student: TelegramApiResult | null;
}> {
  const targets: Array<{ chatId: string; ok: boolean; error?: string }> = [];
  let student: TelegramApiResult | null = null;

  const errorCount = Array.isArray(evaluation.errors) ? evaluation.errors.length : 0;
  const firstName = studentInfo.name ? studentInfo.name.split(' ')[0] : 'Student';
  const marks = evaluation.marks;
  const classLabel = studentInfo.className || studentInfo.class || 'Class';
  const resolvedFileName = fileName || 'EdumenAI_Report.pdf';
  const safeTitle = escapeTelegramHtml(exerciseTitle || 'Assessment');

  const resolvedTargets = await resolveTargetChatIds(targetIds);
  if (resolvedTargets.length > 0) {
    const teacherCaption = `📋 <b>EdumenAI - ${safeTitle} Marked Report</b>
👤 <b>Student:</b> ${escapeTelegramHtml(studentInfo.name || 'Unknown')} (${escapeTelegramHtml(classLabel)} - ${escapeTelegramHtml(studentInfo.school || 'School')})
📱 <b>Telegram ID:</b> ${escapeTelegramHtml(studentInfo.telegram || studentInfo.telegramId || 'N/A')}
📊 <b>Marks:</b> <b>${marks?.total ?? 0}/${marks?.total_max ?? 23}</b> (Content: ${marks?.content ?? 0}/${marks?.content_max ?? 8}, Language: ${marks?.language ?? 0}/${marks?.language_max ?? 15})
🔍 <b>Errors:</b> ${errorCount}
🔒 <b>Mode:</b> EdumenAI Dynamic Assessment

📎 <i>Attached: Complete Marked PDF Report</i>`;

    for (const chatId of resolvedTargets) {
      const res = pdfBuffer
        ? await sendTelegramDocument(chatId, pdfBuffer, resolvedFileName, teacherCaption)
        : await sendTelegramMessage(chatId, teacherCaption);

      targets.push({
        chatId,
        ok: Boolean(res?.ok),
        ...(res?.ok ? {} : { error: res?.description || 'Delivery failed' })
      });
    }
  } else {
    logger.warn('[Telegram] dispatchFullReportWithPdf: no teacher targets configured.');
  }

  const studentTelegramId = studentInfo.telegramId || studentInfo.telegram;
  if (studentTelegramId && /^\d+$/.test(String(studentTelegramId).trim())) {
    const studentCaption = `🌟 <b>EdumenAI - ${safeTitle} Marked Report</b>
👤 <b>Hello ${escapeTelegramHtml(firstName)}!</b>

📊 <b>Your Scores:</b>
• Total: <b>${marks?.total ?? 0} / ${marks?.total_max ?? 23}</b>
• Content & Communication: <b>${marks?.content ?? 0} / ${marks?.content_max ?? 8}</b>
• Language: <b>${marks?.language ?? 0} / ${marks?.language_max ?? 15}</b>
🔍 <b>Errors Flagged:</b> ${errorCount}

📎 Your marked PDF report is attached below. Keep this copy for your revision!

<i>EdumenAI powered by EDUMENIA</i>`;

    student = pdfBuffer
      ? await sendTelegramDocument(
          String(studentTelegramId).trim(),
          pdfBuffer,
          resolvedFileName,
          studentCaption
        )
      : await sendTelegramMessage(String(studentTelegramId).trim(), studentCaption);
  }

  return { targets, student };
}

export async function sendTeacherQuotaAlert({
  provider = 'unknown',
  model = 'unknown',
  operation = 'AI Operation',
  retryAfter = null,
  studentInfo = null
}: {
  provider?: string;
  model?: string;
  operation?: string;
  retryAfter?: string | null;
  studentInfo?: TelegramStudentInfo | null;
}): Promise<TelegramApiResult[] | null> {
  const resolvedTargets = await resolveTargetChatIds();
  if (resolvedTargets.length === 0) {
    return null;
  }

  const key = `${provider}_${model}`;
  const lastAlert = quotaAlertCooldowns.get(key) || 0;
  if (Date.now() - lastAlert < QUOTA_ALERT_COOLDOWN_MS) {
    logger.info(`[Telegram] Quota alert for ${key} suppressed (cooldown active).`);
    return null;
  }
  quotaAlertCooldowns.set(key, Date.now());

  const retryLine = retryAfter
    ? `\n⏳ <b>Provider Retry Hint:</b> ${escapeTelegramHtml(retryAfter)}`
    : '';
  const studentLine = studentInfo?.name
    ? `\n👤 <b>Affected Student:</b> ${escapeTelegramHtml(studentInfo.name)} (${escapeTelegramHtml(studentInfo.className || studentInfo.school || 'General')})`
    : '';

  const msg = `🚨 <b>تنبيه إداري: نفاد رصيد أو حصة الذكاء الاصطناعي (Quota Exhausted)</b>

🔌 <b>المزود (Provider):</b> <code>${escapeTelegramHtml(provider)}</code>
🤖 <b>النموذج (Model):</b> <code>${escapeTelegramHtml(model)}</code>
⚙️ <b>العملية المتأثرة:</b> ${escapeTelegramHtml(operation)}${retryLine}${studentLine}

🛑 <i>تم إيقاف التصحيح التلقائي مؤقتاً للحفاظ على نفس الجودة وعدم الانتقال لنماذج أضعف.</i>
💳 <b>الإجراء المطلوب:</b> يرجى شحن رصيد الحساب أو تفعيل خطة الدفع حسب الاستخدام (<b>Pay-as-you-go</b>) لدى المزود المذكور لاستئناف العمل فوراً.`;

  const results: TelegramApiResult[] = [];
  for (const chatId of resolvedTargets) {
    const res = await sendTelegramMessage(chatId, msg);
    if (res) results.push(res);
  }
  return results;
}

export async function sendTeacherError(
  studentInfo: TelegramStudentInfo | null | undefined,
  errorMessage: string,
  exerciseTitle = 'Assessment'
): Promise<TelegramApiResult[] | null> {
  const resolvedTargets = await resolveTargetChatIds();
  if (resolvedTargets.length === 0) {
    return null;
  }

  const safeTitle = escapeTelegramHtml(exerciseTitle || 'Assessment');
  const msg = `
⚠️ <b>EdumenAI Error - ${safeTitle}</b>
👤 <b>Student:</b> ${escapeTelegramHtml(studentInfo?.name || 'Unknown')} (${escapeTelegramHtml(studentInfo?.school || 'General')})
📱 <b>Telegram:</b> ${escapeTelegramHtml(studentInfo?.telegram || studentInfo?.telegramId || 'N/A')}

❌ <b>Error:</b> ${escapeTelegramHtml(errorMessage)}
`;

  const results: TelegramApiResult[] = [];
  for (const chatId of resolvedTargets) {
    const res = await sendTelegramMessage(chatId, msg);
    if (res) results.push(res);
  }
  return results;
}
