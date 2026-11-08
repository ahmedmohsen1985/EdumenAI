import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env in project root
dotenv.config({ path: path.join(__dirname, '../.env') });

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramTeacherGroupId: process.env.TELEGRAM_TEACHER_GROUP_ID || '',
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 86400)
};

export default config;
