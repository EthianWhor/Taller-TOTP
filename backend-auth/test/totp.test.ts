import { describe, expect, it } from 'vitest';
import { base32Encode } from '../src/crypto/base32.js';
import {
  buildOtpAuthUri,
  counterToBytes,
  dynamicTruncation,
  hotp,
  totp,
  verifyTotp,
} from '../src/crypto/totp.js';

// Semilla de los vectores de prueba del RFC 6238 (Apéndice B) para SHA-1.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('vector oficial t=%i -> %s (8 dígitos)', (t, expected) => {
    expect(totp(RFC_SECRET, t * 1000, 8)).toBe(expected);
  });

  it('genera 6 dígitos con ceros a la izquierda', () => {
    expect(totp(RFC_SECRET, 1234567890 * 1000)).toBe('005924');
  });

  it('cumple los vectores HOTP del RFC 4226 (Apéndice D)', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    const secret = Buffer.from('12345678901234567890');
    expected.forEach((code, counter) => expect(hotp(secret, counter)).toBe(code));
  });

  it('codifica el contador como entero de 64 bits Big-Endian', () => {
    expect(counterToBytes(1).toString('hex')).toBe('0000000000000001');
    expect(counterToBytes(0x0123456789).toString('hex')).toBe('0000000123456789');
  });

  it('aplica el truncamiento dinámico del RFC 4226 §5.4', () => {
    const h = Buffer.from('1f8698690e02ca16618550ef7f19da8e945b555a', 'hex');
    expect(dynamicTruncation(h)).toBe(0x50ef7f19);
  });

  describe('verifyTotp con ventanas C-1, C, C+1', () => {
    const now = 1_700_000_000_000;
    it('acepta el código actual', () => {
      expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now), now)).toMatchObject({ valid: true, delta: 0 });
    });
    it('acepta la ventana anterior y la siguiente', () => {
      expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now - 30_000), now)).toMatchObject({ valid: true, delta: -1 });
      expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now + 30_000), now)).toMatchObject({ valid: true, delta: 1 });
    });
    it('rechaza códigos fuera de la tolerancia', () => {
      expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now - 90_000), now).valid).toBe(false);
      expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now + 90_000), now).valid).toBe(false);
    });
    it('rechaza formatos inválidos', () => {
      expect(verifyTotp(RFC_SECRET, '12345', now).valid).toBe(false);
      expect(verifyTotp(RFC_SECRET, 'abcdef', now).valid).toBe(false);
    });
  });

  it('construye un URI otpauth compatible con Google Authenticator', () => {
    const uri = buildOtpAuthUri({
      issuer: 'UniSabana',
      account: 'estudiante@unisabana.edu.co',
      secretBase32: 'JBSWY3DPEHPK3PXP',
    });
    expect(uri.startsWith('otpauth://totp/UniSabana:estudiante%40unisabana.edu.co?')).toBe(true);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=UniSabana');
  });
});
