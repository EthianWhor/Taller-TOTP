import { base32Decode } from './base32';
import { hmac, type HashFunction } from './hmac';

/**
 * Generador TOTP (RFC 6238) implementado desde cero.
 * No usa librerías de alto nivel (otplib, speakeasy...): solo SHA-1 nativo.
 */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** Paso 1 — Ventana de tiempo: T = floor(UnixTimestamp / 30). */
export function timeStep(unixMs: number, period = TOTP_PERIOD_SECONDS): number {
  return Math.floor(unixMs / 1000 / period);
}

/** T como entero de 64 bits Big-Endian (buffer de 8 bytes). */
export function counterToBytes(counter: number): Uint8Array {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new Error('El contador debe ser un entero no negativo');
  }
  const bytes = new Uint8Array(8);
  // JS opera bits en 32 bits: se separa en parte alta y baja.
  const high = Math.floor(counter / 0x1_0000_0000);
  const low = counter >>> 0;
  bytes[0] = (high >>> 24) & 0xff;
  bytes[1] = (high >>> 16) & 0xff;
  bytes[2] = (high >>> 8) & 0xff;
  bytes[3] = high & 0xff;
  bytes[4] = (low >>> 24) & 0xff;
  bytes[5] = (low >>> 16) & 0xff;
  bytes[6] = (low >>> 8) & 0xff;
  bytes[7] = low & 0xff;
  return bytes;
}

/** Paso 3 — Truncamiento dinámico (RFC 4226 §5.3). */
export function dynamicTruncation(h: Uint8Array): number {
  const offset = h[h.length - 1]! & 0x0f; // H[19] & 0x0F para SHA-1
  return (
    ((h[offset]! & 0x7f) << 24) |
    ((h[offset + 1]! & 0xff) << 16) |
    ((h[offset + 2]! & 0xff) << 8) |
    (h[offset + 3]! & 0xff)
  );
}

export async function hotp(
  sha1: HashFunction,
  secret: Uint8Array,
  counter: number,
  digits = TOTP_DIGITS,
): Promise<string> {
  // Paso 2 — H = HMAC-SHA1(ClaveSecretaEnBytes, T)
  const h = await hmac(sha1, secret, counterToBytes(counter));
  const binCode = dynamicTruncation(h);
  // Paso 4 — 6 dígitos con ceros a la izquierda.
  return (binCode % 10 ** digits).toString().padStart(digits, '0');
}

export async function generateTotp(
  sha1: HashFunction,
  secretBase32: string,
  unixMs: number,
  digits = TOTP_DIGITS,
  period = TOTP_PERIOD_SECONDS,
): Promise<string> {
  return hotp(sha1, base32Decode(secretBase32), timeStep(unixMs, period), digits);
}

/** Segundos restantes de la ventana actual (30 → 1). */
export function secondsRemaining(unixMs: number, period = TOTP_PERIOD_SECONDS): number {
  return period - (Math.floor(unixMs / 1000) % period);
}
