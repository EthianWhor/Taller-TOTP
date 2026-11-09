import { createHmac, timingSafeEqual } from 'node:crypto';
import { base32Decode } from './base32.js';

/**
 * TOTP según RFC 6238 (sobre HOTP, RFC 4226), implementado desde cero:
 *   T     = floor(unixSeconds / 30)            -> entero de 64 bits Big-Endian
 *   H     = HMAC-SHA1(secreto, T)              -> 20 bytes
 *   off   = H[19] & 0x0F                       -> truncamiento dinámico
 *   bin   = (H[off]&0x7F)<<24 | H[off+1]<<16 | H[off+2]<<8 | H[off+3]
 *   TOTP  = bin % 10^digits                    -> con ceros a la izquierda
 */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function timeCounter(unixMs: number, period = TOTP_PERIOD_SECONDS): number {
  return Math.floor(unixMs / 1000 / period);
}

export function counterToBytes(counter: number): Buffer {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new Error('El contador debe ser un entero no negativo');
  }
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  return buf;
}

export function dynamicTruncation(hmac: Uint8Array): number {
  const offset = hmac[hmac.length - 1]! & 0x0f;
  return (
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff)
  );
}

export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  const hmac = createHmac('sha1', secret).update(counterToBytes(counter)).digest();
  const binCode = dynamicTruncation(hmac);
  return (binCode % 10 ** digits).toString().padStart(digits, '0');
}

export function totp(secretBase32: string, unixMs: number, digits = TOTP_DIGITS): string {
  return hotp(base32Decode(secretBase32), timeCounter(unixMs), digits);
}

export interface TotpVerification {
  valid: boolean;
  /** Desfase de ventana que coincidió: -1 (C-1), 0 (C) o +1 (C+1). */
  delta?: number;
  counter?: number;
}

/**
 * Verifica un código tolerando desfase de reloj en las ventanas C-1, C y C+1.
 * Se recorren SIEMPRE las tres ventanas y se compara en tiempo constante
 * para no filtrar información por canal lateral de tiempo.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  unixMs: number,
  window = 1,
  digits = TOTP_DIGITS,
): TotpVerification {
  if (!new RegExp(`^\\d{${digits}}$`).test(code)) {
    return { valid: false };
  }
  const secret = base32Decode(secretBase32);
  const current = timeCounter(unixMs);
  const given = Buffer.from(code);
  let match: TotpVerification = { valid: false };
  for (let delta = -window; delta <= window; delta++) {
    const counter = current + delta;
    if (counter < 0) continue;
    const expected = Buffer.from(hotp(secret, counter, digits));
    if (timingSafeEqual(expected, given) && !match.valid) {
      match = { valid: true, delta, counter };
    }
  }
  return match;
}

export function buildOtpAuthUri(params: {
  issuer: string;
  account: string;
  secretBase32: string;
}): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.account)}`;
  const query = new URLSearchParams({
    secret: params.secretBase32,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
