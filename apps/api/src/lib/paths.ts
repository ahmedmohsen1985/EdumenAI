import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Works identically from src/lib/paths.ts and dist/lib/paths.js
export const API_ROOT_DIR: string = path.resolve(__dirname, '../..');
export const MONOREPO_ROOT_DIR: string = path.resolve(API_ROOT_DIR, '../..');
