import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let warnedMissingProdKey = false;

function deriveKey(): Buffer {
  const secretMaterial =
    env.appEncryptionKey ||
    env.adminAccessKey ||
    env.databaseUrl ||
    'edumenai-local-dev-key';

  if (env.nodeEnv === 'production' && !env.appEncryptionKey && !warnedMissingProdKey) {
    warnedMissingProdKey = true;
    logger.warn(
      'APP_ENCRYPTION_KEY is not set in production; falling back to derived key material. Set APP_ENCRYPTION_KEY explicitly.'
    );
  }

  return crypto.createHash('sha256').update(secretMaterial, 'utf8').digest();
}

export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(stored: string): string {
  if (!stored || !stored.startsWith(PREFIX)) {
    return stored;
  }

  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format.');
  }

  const [ivB64, tagB64, cipherB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(cipherB64, 'base64');

  const key = deriveKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskSecret(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return '••••';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}
