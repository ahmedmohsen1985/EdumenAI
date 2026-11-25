import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LEN = 64;
const HEX_PATTERN = /^[0-9a-f]+$/i;

function deriveScryptKey(password: string, saltHex: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const salt = Buffer.from(saltHex, 'hex');
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

/** Hash a plaintext password using Node built-in scrypt (scrypt$<saltHex>$<hashHex>). */
export async function hashPassword(password: string): Promise<string> {
  const saltHex = crypto.randomBytes(16).toString('hex');
  const derived = await deriveScryptKey(password, saltHex);
  return `scrypt$${saltHex}$${derived.toString('hex')}`;
}

/** Constant-time password verification against a stored scrypt hash. Never throws on malformed hashes. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (!stored || typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

    const saltHex = parts[1];
    const hashHex = parts[2];
    if (
      !saltHex ||
      !hashHex ||
      saltHex.length % 2 !== 0 ||
      hashHex.length !== SCRYPT_KEY_LEN * 2 ||
      !HEX_PATTERN.test(saltHex) ||
      !HEX_PATTERN.test(hashHex)
    ) {
      return false;
    }

    const expected = Buffer.from(hashHex, 'hex');
    const derived = await deriveScryptKey(password, saltHex);
    if (expected.length !== derived.length) {
      return false;
    }

    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
