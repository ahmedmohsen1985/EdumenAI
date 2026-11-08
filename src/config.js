import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env in project root
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Returns an array of configured Gemini API keys (supports single, comma-separated, or fallback keys).
 */
export function getGeminiApiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) {
    keys.push(...process.env.GEMINI_API_KEY.split(',').map(s => s.trim()).filter(Boolean));
  }
  if (process.env.GEMINI_FALLBACK_API_KEY) {
    keys.push(...process.env.GEMINI_FALLBACK_API_KEY.split(',').map(s => s.trim()).filter(Boolean));
  }
  if (process.env.GEMINI_API_KEYS) {
    keys.push(...process.env.GEMINI_API_KEYS.split(',').map(s => s.trim()).filter(Boolean));
  }
  return [...new Set(keys)];
}

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramTeacherGroupId: process.env.TELEGRAM_TEACHER_GROUP_ID || '',
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 86400)
};

export default config;
