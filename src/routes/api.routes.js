import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  transcribeHandwriting,
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

// Multer storage: keep uploaded images in memory for direct forwarding to Gemini
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif|bmp|heic/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed for transcription.'));
  }
});

/**
 * POST /api/transcribe
 * Accepts a handwriting image and returns verbatim OCR text.
 */
router.post('/transcribe', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided.' });
    }

    const mimeType = req.file.mimetype || 'image/jpeg';
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
