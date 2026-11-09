/**
 * Decodificador Base32 (RFC 4648) propio para las semillas TOTP.
 * Acepta minúsculas, espacios, guiones y relleno '=' (formatos comunes al copiar la semilla).
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function normalizeBase32(input: string): string {
  return input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
}

export type Base32Validation = { ok: true; normalized: string } | { ok: false; error: string };

/** Validación con mensajes pensados para el formulario de ingreso manual. */
export function validateBase32Secret(input: string): Base32Validation {
  const normalized = normalizeBase32(input);
  if (normalized.length === 0) return { ok: false, error: 'Ingresa la semilla Base32' };
  const invalid = normalized.match(/[^A-Z2-7]/);
  if (invalid) {
    return { ok: false, error: `Carácter no válido en Base32: "${invalid[0]}" (solo A–Z y 2–7)` };
  }
  // Cada carácter aporta 5 bits; se exigen al menos 80 bits (16 caracteres) de entropía.
  if (normalized.length < 16) {
    return { ok: false, error: 'La semilla es demasiado corta (mínimo 16 caracteres)' };
  }
  // Longitudes imposibles en Base32 (restos de 1, 3 o 6 caracteres por bloque de 8).
  if ([1, 3, 6].includes(normalized.length % 8)) {
    return { ok: false, error: 'La longitud de la semilla no es válida en Base32' };
  }
  return { ok: true, normalized };
}

export function base32Decode(input: string): Uint8Array {
  const s = normalizeBase32(input);
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    const value = ALPHABET.indexOf(ch);
    if (value === -1) throw new Error(`Carácter Base32 inválido: ${ch}`);
    buffer = ((buffer << 5) | value) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}
