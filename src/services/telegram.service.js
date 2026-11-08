import fetch from 'node-fetch';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TEACHER_GROUP = process.env.TELEGRAM_TEACHER_GROUP_ID;
const MAX_MESSAGE_LENGTH = 4000;

/**
 * Sends a plain text message to a Telegram chat.
 * Returns the API response or null if skipped.
 */
export async function sendTelegramMessage(chatId, text, parseMode = 'HTML') {
  if (!chatId || !BOT_TOKEN) {
    return null;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, MAX_MESSAGE_LENGTH),
        parse_mode: parseMode,
        disable_web_page_preview: true
      })
    });

    const data = await res.json();

    if (!data.ok) {
      console.error('[Telegram] API error:', data.description);
    }

    return data;
  } catch (err) {
    console.error('[Telegram] Send error:', err);
    return null;
  }
}

/**
 * Formats and sends a student-friendly evaluation summary.
 */
export async function notifyStudent(telegramId, studentName, evaluation) {
  if (!telegramId || !BOT_TOKEN) {
    return null;
  }

  const firstName = studentName ? studentName.split(' ')[0] : 'Student';
  const errorCount = Array.isArray(evaluation.errors) ? evaluation.errors.length : 0;

  const msg = `
🌟 <b>EdumenAI - Exercise 4 Evaluation</b>
👤 <b>Student:</b> ${firstName}

📊 <b>Scores:</b>
• Total: <b>${evaluation.marks.total} / 23</b>
• Content & Communication: <b>${evaluation.marks.content} / 8</b>
• Language: <b>${evaluation.marks.language} / 15</b>

💡 <b>Examiner Verdict:</b>
${evaluation.justification?.content || ''}
${evaluation.justification?.language || ''}

🔍 <b>Errors Detected:</b> ${errorCount} item(s) found.
Check the detailed report and corrected version on your screen!

<i>EdumenAI powered by EDUMENIA</i>
`;

  return sendTelegramMessage(telegramId, msg);
}

/**
 * Sends an audit log (raw vs edited text + marks) to the teacher supergroup.
 */
export async function sendTeacherAudit(studentInfo, rawText, finalText, evaluation) {
  if (!TEACHER_GROUP || !BOT_TOKEN) {
    return null;
  }

  const isChanged = Boolean(rawText && finalText && rawText.trim() !== finalText.trim());
  const errorCount = Array.isArray(evaluation.errors) ? evaluation.errors.length : 0;

  const auditMsg = `
📋 <b>AUDIT REPORT - Exercise 4 (Article)</b>
👤 <b>Student:</b> ${studentInfo.name || 'Unknown'} (${studentInfo.school || 'General'} - ${studentInfo.className || 'Class'})
📱 <b>Telegram:</b> ${studentInfo.telegram || 'N/A'}
📊 <b>Result:</b> ${evaluation.marks.total}/23 (C: ${evaluation.marks.content}/8, L: ${evaluation.marks.language}/15)
🔍 <b>Errors:</b> ${errorCount}

📝 <b>Status:</b> ${isChanged ? '⚠️ Student edited OCR transcription' : '✅ Submitted without edits'}

<b>RAW TRANSCRIPTION:</b>
<code>${(rawText || '').substring(0, 1000)}</code>

<b>SUBMITTED FINAL:</b>
<code>${(finalText || '').substring(0, 1000)}</code>
`;

  return sendTelegramMessage(TEACHER_GROUP, auditMsg);
}

/**
 * Sends a fallback error notification to the teacher group.
 */
export async function sendTeacherError(studentInfo, errorMessage) {
  if (!TEACHER_GROUP || !BOT_TOKEN) {
    return null;
  }

  const msg = `
⚠️ <b>EdumenAI Error - Exercise 4</b>
👤 <b>Student:</b> ${studentInfo.name || 'Unknown'} (${studentInfo.school || 'General'})
📱 <b>Telegram:</b> ${studentInfo.telegram || 'N/A'}

❌ <b>Error:</b> ${errorMessage}
`;

  return sendTelegramMessage(TEACHER_GROUP, msg);
}
