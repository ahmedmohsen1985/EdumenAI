import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  transcribeHandwriting,
  extractTaskQuestion,
  evaluateArticle
} from '../services/gemini.service.js';
import {
  notifyStudent,
  sendTeacherAudit,
  sendTeacherError
} from '../services/telegram.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Allowed MIME types and extensions for student work
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/heic', 'image/heif'];
const ALLOWED_PDF_TYPES = ['application/pdf'];
const ALLOWED_UPLOAD_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_PDF_TYPES];

function isAllowedUpload(file) {
  if (!file) return false;
  if (ALLOWED_UPLOAD_TYPES.includes(file.mimetype)) return true;
  const ext = path.extname(file.originalname).toLowerCase();
  return ext === '.pdf' || ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif'].includes(ext);
}

// Multer storage: keep uploaded files in memory for direct forwarding to Gemini
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024 // 15 MB
  },
  fileFilter: (req, file, cb) => {
    if (isAllowedUpload(file)) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPG, PNG, WEBP) or PDF documents are allowed.'));
  }
});

/**
 * POST /api/extract-task
 * Accepts an exam question image or PDF and extracts the task question text.
 */
router.post('/extract-task', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No task question file provided.' });
    }

    const mimeType = req.file.mimetype || 'application/octet-stream';
    const taskQuestion = await extractTaskQuestion(req.file.buffer, mimeType);

    if (!taskQuestion || !taskQuestion.trim()) {
      return res.status(422).json({
        success: false,
        error: 'Could not detect an exam question in the uploaded file. Please make sure the image is clear or type the question manually.'
      });
    }

    res.json({
      success: true,
      data: {
        taskQuestion: taskQuestion.trim(),
        mimeType
      }
    });
  } catch (err) {
    console.error('[API /extract-task] Error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Task question extraction failed.'
    });
  }
});

/**
 * POST /api/transcribe
 * Accepts a handwriting image or scanned PDF and returns verbatim OCR text.
 */
router.post('/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided.' });
    }

    const mimeType = req.file.mimetype || 'application/octet-stream';
    const transcription = await transcribeHandwriting(req.file.buffer, mimeType);

    res.json({
      success: true,
      data: {
        transcription,
        mimeType
      }
    });
  } catch (err) {
    console.error('[API /transcribe] Error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Transcription failed.'
    });
  }
});

/**
 * POST /api/evaluate
 * Accepts student info, task prompt, raw OCR, and edited final text.
 * Returns structured marking report and dispatches Telegram notifications.
 */
router.post('/evaluate', async (req, res) => {
  const { student, taskPrompt, rawText, finalText } = req.body || {};

  if (!taskPrompt || !finalText) {
    return res.status(400).json({
      success: false,
      error: 'Task prompt and final text are required.'
    });
  }

  const studentInfo = {
    name: student?.name || 'Unknown',
    telegram: student?.telegram || '',
    school: student?.school || '',
    className: student?.className || student?.class || ''
  };

  try {
    const evaluation = await evaluateArticle(studentInfo.name, taskPrompt, finalText);

    // Dispatch notifications asynchronously; do not block the response
    (async () => {
      try {
        if (studentInfo.telegram) {
          await notifyStudent(studentInfo.telegram, studentInfo.name, evaluation);
        }
        await sendTeacherAudit(studentInfo, rawText, finalText, evaluation);
      } catch (notifyErr) {
        console.error('[API /evaluate] Notification error:', notifyErr);
      }
    })();

    res.json({
      success: true,
      data: evaluation
    });
  } catch (err) {
    console.error('[API /evaluate] Error:', err);

    // Inform teachers about the failure
    (async () => {
      try {
        await sendTeacherError(studentInfo, err.message);
      } catch (notifyErr) {
        console.error('[API /evaluate] Teacher error notification failed:', notifyErr);
      }
    })();

    res.status(500).json({
      success: false,
      error: err.message || 'Evaluation failed.'
    });
  }
});

export default router;
