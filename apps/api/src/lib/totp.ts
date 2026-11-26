import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

export function generateBase32Secret(bytes = 20): string {
  const random = crypto.randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of random) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31] ?? '';
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31] ?? '';
  }

  return output;
}

export function decodeBase32(encoded: string): Buffer {
  const normalized = encoded.toUpperCase().replace(/[\s=-]+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      return Buffer.alloc(0);
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpToken(
  secret: string,
  counterOffset = 0,
  timestampMs = Date.now()
): string {
  const key = decodeBase32(secret);
  if (key.length === 0) {
    throw new Error('Invalid Base32 TOTP secret');
  }

  const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS) + counterOffset;
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);

  const otp = binary % 10 ** TOTP_DIGITS;
  return String(otp).padStart(TOTP_DIGITS, '0');
}

export function verifyTotpCode(
  secret: string,
  candidateCode: string,
  window = 1
): boolean {
  try {
    const trimmed = candidateCode.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      return false;
    }

    const key = decodeBase32(secret);
    if (key.length === 0) {
      return false;
    }

    const candidateBuf = Buffer.from(trimmed, 'utf8');
    const now = Date.now();
    let matched = false;

    for (let offset = -window; offset <= window; offset += 1) {
      const expected = generateTotpToken(secret, offset, now);
      const expectedBuf = Buffer.from(expected, 'utf8');
      if (
        expectedBuf.length === candidateBuf.length &&
        crypto.timingSafeEqual(expectedBuf, candidateBuf)
      ) {
        matched = true;
      }
    }

    return matched;
  } catch {
    return false;
  }
}

export function buildOtpAuthUri(params: {
  secret: string;
  email: string;
  issuer?: string;
}): string {
  const issuer = params.issuer?.trim() || 'EdumenAI';
  const label = encodeURIComponent(`${issuer}:${params.email}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(
    params.secret
  )}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}
