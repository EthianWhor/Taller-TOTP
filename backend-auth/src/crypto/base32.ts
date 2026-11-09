/**
 * Codificación Base32 (RFC 4648, alfabeto estándar A-Z2-7).
 * Es el formato en el que viajan las semillas TOTP en los URI otpauth://.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function normalizeBase32(input: string): string {
  return input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
}

export function isValidBase32(input: string): boolean {
  const s = normalizeBase32(input);
  return s.length > 0 && /^[A-Z2-7]+$/.test(s);
}

export function base32Decode(input: string): Buffer {
  const s = normalizeBase32(input);
  if (!/^[A-Z2-7]*$/.test(s)) {
    throw new Error('Cadena Base32 inválida');
  }
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    buffer = (buffer << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

export function base32Encode(data: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of data) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += ALPHABET[(buffer << (5 - bits)) & 0x1f];
  }
  return out;
}
