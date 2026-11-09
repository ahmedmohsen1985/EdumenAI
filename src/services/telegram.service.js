import '../config.js';

const MAX_MESSAGE_LENGTH = 4000;

function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN || '';
}

function getTeacherGroup() {
  return process.env.TELEGRAM_TEACHER_GROUP_ID || '';
}

/**
 * Sends a plain text message to a Telegram chat.
 * Automatically tries supergroup prefix (-100) if a 10-digit group ID returns chat not found.
 */
export async function sendTelegramMessage(chatId, text, parseMode = 'HTML') {
  const token = getBotToken();
  if (!chatId || !token) {
    console.warn('[Telegram] sendTelegramMessage skipped: missing chatId or TELEGRAM_BOT_TOKEN.');
    return null;
  }

  const cleanChatId = String(chatId).trim();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  async function post(targetId) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetId,
        text: text.slice(0, MAX_MESSAGE_LENGTH),
        parse_mode: parseMode,
        disable_web_page_preview: true
      })
    });
    return res.json();
  }

  try {
    let data = await post(cleanChatId);

    // If chat not found and ID is a negative group without -100 prefix, try with -100
    if (!data.ok && data.description && data.description.includes('chat not found')) {
      if (cleanChatId.startsWith('-') && !cleanChatId.startsWith('-100')) {
        const altId = '-100' + cleanChatId.slice(1);
        console.log(`[Telegram] Retrying sendMessage with supergroup ID: ${altId}`);
        const retryData = await post(altId);
        if (retryData.ok) return retryData;
      }
    }

    if (!data.ok) {
      console.error(`[Telegram] sendMessage to ${cleanChatId} failed:`, data.description);
    } else {
      console.log(`[Telegram] sendMessage to ${cleanChatId} delivered.`);
    }

    return data;
  } catch (err) {
    console.error(`[Telegram] Send message error to ${cleanChatId}:`, err.message);
    return null;
  }
}

/**
 * Sends a PDF document to a Telegram chat with an optional caption.
 * Automatically handles supergroup prefix (-100) fallback.
 */
export async function sendTelegramDocument(chatId, fileBuffer, fileName, caption = '') {
  const token = getBotToken();
  if (!chatId || !token || !fileBuffer) {
    console.warn('[Telegram] sendTelegramDocument skipped: missing chatId, token, or fileBuffer.');
    return null;
  }

  const cleanChatId = String(chatId).trim();
  const url = `https://api.telegram.org/bot${token}/sendDocument`;

  async function postDoc(targetId) {
    const formData = new FormData();
    formData.append('chat_id', targetId);
    formData.append('document', new Blob([fileBuffer], { type: 'application/pdf' }), fileName || 'EdumenAI_Report.pdf');
    if (caption) {
      formData.append('caption', caption.slice(0, 1024));
      formData.append('parse_mode', 'HTML');
    }

    const res = await fetch(url, {
      method: 'POST',
      body: formData
    });
    return res.json();
  }

  try {
    let data = await postDoc(cleanChatId);

    // Supergroup prefix fallback
    if (!data.ok && data.description && data.description.includes('chat not found')) {
      if (cleanChatId.startsWith('-') && !cleanChatId.startsWith('-100')) {
        const altId = '-100' + cleanChatId.slice(1);
        console.log(`[Telegram] Retrying sendDocument with supergroup ID: ${altId}`);
        const retryData = await postDoc(altId);
        if (retryData.ok) return retryData;
      }
    }

    if (!data.ok) {
      console.error(`[Telegram] sendDocument to ${cleanChatId} failed:`, data.description);
    } else {
      console.log(`[Telegram] sendDocument to ${cleanChatId} delivered (${fileName}).`);
    }

    return data;
  } catch (err) {
    console.error(`[Telegram] Send document error to ${cleanChatId}:`, err.message);
    return null;
  }
}

/**
 * Formats and sends a student-friendly evaluation summary (text only).
 */
export async function notifyStudent(telegramId, studentName, evaluation) {
  if (!telegramId) return null;

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
Check the detailed report on your screen!

<i>EdumenAI powered by EDUMENIA</i>
`;

  return sendTelegramMessage(telegramId, msg);
}

/**
 * Sends an audit log to the teacher supergroup (text only).
 */
export async function sendTeacherAudit(studentInfo, textOrRaw, finalOrEval, maybeEval) {
  const teacherGroup = getTeacherGroup();
  if (!teacherGroup) {
    console.warn('[Telegram] sendTeacherAudit skipped: TELEGRAM_TEACHER_GROUP_ID not configured.');
    return null;
  }

  // Handle both 3-argument and 4-argument calls seamlessly
  const evaluation = maybeEval || finalOrEval || {};
  const studentText = typeof textOrRaw === 'string'
    ? (maybeEval ? (finalOrEval || textOrRaw) : textOrRaw)
    : '';

  const errorCount = Array.isArray(evaluation.errors) ? evaluation.errors.length : 0;
  const marks = evaluation.marks || {};
  const snippet = studentText.trim();

  const auditMsg = `
📋 <b>AUDIT REPORT - Exercise 4 (Article)</b>
👤 <b>Student:</b> ${studentInfo.name || 'Unknown'} (${studentInfo.school || 'General'} - ${studentInfo.className || 'Class'})
📱 <b>Telegram ID:</b> ${studentInfo.telegram || 'N/A'}
📊 <b>Result:</b> <b>${marks.total ?? 0}/23</b> (Content: ${marks.content ?? 0}/8, Language: ${marks.language ?? 0}/15)
🔍 <b>Errors Flagged:</b> ${errorCount}
🔒 <b>Mode:</b> Verbatim Handwriting OCR (Locked - Unedited)

📝 <b>Student Article:</b>
<code>${snippet.substring(0, 1500)}</code>
`;

  return sendTelegramMessage(teacherGroup, auditMsg);
}

/**
 * Dispatches the complete PDF report and summaries to both Teacher Group and Student.
 */
export async function dispatchFullReportWithPdf({ studentInfo, evaluation, rawText, finalText, pdfBuffer, fileName }) {
  const results = {
    teacherGroup: null,
    student: null
  };

  const errorCount = Array.isArray(evaluation.errors) ? evaluation.errors.length : 0;
  const firstName = studentInfo.name ? studentInfo.name.split(' ')[0] : 'Student';

  // 1. Teacher Group Caption & Document
  const teacherGroup = getTeacherGroup();
  if (teacherGroup) {
    const teacherCaption = `📋 <b>EdumenAI - Exercise 4 Marked Report</b>
👤 <b>Student:</b> ${studentInfo.name || 'Unknown'} (${studentInfo.className || 'Class'} - ${studentInfo.school || 'School'})
📱 <b>Telegram ID:</b> ${studentInfo.telegram || 'N/A'}
📊 <b>Marks:</b> <b>${evaluation.marks.total}/23</b> (Content: ${evaluation.marks.content}/8, Language: ${evaluation.marks.language}/15)
🔍 <b>Errors:</b> ${errorCount}
🔒 <b>Submission:</b> Verbatim OCR (Locked)

📎 <i>Attached: Complete Marked PDF Report</i>`;

    if (pdfBuffer) {
      results.teacherGroup = await sendTelegramDocument(teacherGroup, pdfBuffer, fileName, teacherCaption);
    } else {
      results.teacherGroup = await sendTelegramMessage(teacherGroup, teacherCaption);
    }
  } else {
    console.warn('[Telegram] dispatchFullReportWithPdf: TELEGRAM_TEACHER_GROUP_ID is not configured.');
  }

  // 2. Student Caption & Document (if student Telegram ID is available)
  const studentTelegramId = studentInfo.telegramId || studentInfo.telegram;
  if (studentTelegramId && /^\d+$/.test(String(studentTelegramId).trim())) {
    const studentCaption = `🌟 <b>EdumenAI - Exercise 4 Marked Report</b>
👤 <b>Hello ${firstName}!</b>

📊 <b>Your Scores:</b>
• Total: <b>${evaluation.marks.total} / 23</b>
• Content & Communication: <b>${evaluation.marks.content} / 8</b>
• Language: <b>${evaluation.marks.language} / 15</b>
🔍 <b>Errors Flagged:</b> ${errorCount}

📎 Your marked PDF report is attached below. Keep this copy for your revision!

<i>EdumenAI powered by EDUMENIA</i>`;

    if (pdfBuffer) {
      results.student = await sendTelegramDocument(studentTelegramId, pdfBuffer, fileName, studentCaption);
    } else {
      results.student = await sendTelegramMessage(studentTelegramId, studentCaption);
    }
  }

  return results;
}

/**
 * Sends a fallback error notification to the teacher group.
 */
export async function sendTeacherError(studentInfo, errorMessage) {
  const teacherGroup = getTeacherGroup();
  if (!teacherGroup) {
    return null;
  }

  const msg = `
⚠️ <b>EdumenAI Error - Exercise 4</b>
👤 <b>Student:</b> ${studentInfo?.name || 'Unknown'} (${studentInfo?.school || 'General'})
📱 <b>Telegram:</b> ${studentInfo?.telegram || 'N/A'}

❌ <b>Error:</b> ${errorMessage}
`;

  return sendTelegramMessage(teacherGroup, msg);
}
