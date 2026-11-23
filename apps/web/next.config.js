import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readRootEnv(keys) {
  const envPath = path.resolve(__dirname, '../../.env');
  const values = {};
  if (!fs.existsSync(envPath)) return values;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    if (!keys.includes(key)) continue;
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (val) values[key] = val;
  }
  return values;
}

const rootEnv = readRootEnv(['NEXT_PUBLIC_API_URL', 'API_INTERNAL_URL']);
const resolvedPublicApiUrl = process.env.NEXT_PUBLIC_API_URL || rootEnv.NEXT_PUBLIC_API_URL || '';
if (!process.env.API_INTERNAL_URL && rootEnv.API_INTERNAL_URL) {
  process.env.API_INTERNAL_URL = rootEnv.API_INTERNAL_URL;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@edumenai/blocks', '@edumenai/shared'],
  ...(resolvedPublicApiUrl ? { env: { NEXT_PUBLIC_API_URL: resolvedPublicApiUrl } } : {})
};

export default nextConfig;
