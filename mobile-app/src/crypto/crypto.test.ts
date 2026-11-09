import { describe, expect, it } from 'vitest';
import { base32Decode, validateBase32Secret } from './base32';
import { base64UrlEncode, constantTimeEqual, fromHex, toHex, utf8Bytes } from './bytes';
import { hmac } from './hmac';
import { OtpAuthParseError, parseOtpAuthUri } from './otpauth';
import { webSha1 } from './testHash';
import { counterToBytes, dynamicTruncation, generateTotp, hotp, secondsRemaining, timeStep } from './totp';

const RFC_SECRET_BYTES = utf8Bytes('12345678901234567890');
// "12345678901234567890" en Base32
const RFC_SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('Base32', () => {
  it('decodifica la semilla de la guía', () => {
    expect(toHex(base32Decode('JBSWY3DPEHPK3PXP'))).toBe('48656c6c6f21deadbeef');
  });
  it('decodifica la semilla del RFC 6238', () => {
    expect(toHex(base32Decode(RFC_SECRET_B32))).toBe(toHex(RFC_SECRET_BYTES));
  });
  it('acepta minúsculas, espacios y relleno', () => {
    expect(toHex(base32Decode('jbsw y3dp-ehpk 3pxp=='))).toBe('48656c6c6f21deadbeef');
  });
  it('valida la semilla ingresada manualmente', () => {
    expect(validateBase32Secret('JBSWY3DPEHPK3PXP')).toEqual({ ok: true, normalized: 'JBSWY3DPEHPK3PXP' });
    expect(validateBase32Secret('').ok).toBe(false);
    expect(validateBase32Secret('JBSWY3DP0HPK3PXP').ok).toBe(false); // '0' no existe en Base32
    expect(validateBase32Secret('JBSWY3DP').ok).toBe(false); // demasiado corta
  });
});

describe('HMAC-SHA1 propio (RFC 2202)', () => {
  it.each([
    ['0b'.repeat(20), utf8Bytes('Hi There'), 'b617318655057264e28bc0b6fb378c8ef146be00'],
    [toHex(utf8Bytes('Jefe')), utf8Bytes('what do ya want for nothing?'), 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79'],
    ['aa'.repeat(20), fromHex('dd'.repeat(50)), '125d7342b9ac11cd91a39af48aa17b4f63f175d3'],
    // Clave más larga que el bloque (80 bytes): se hashea primero.
    ['aa'.repeat(80), utf8Bytes('Test Using Larger Than Block-Size Key - Hash Key First'), 'aa4ae5e15272d00e95705637ce8a3b55ed402112'],
  ])('vector %#', async (keyHex, message, expected) => {
    expect(toHex(await hmac(webSha1, fromHex(keyHex), message))).toBe(expected);
  });
});

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('vector oficial t=%i -> %s', async (t, expected) => {
    expect(await generateTotp(webSha1, RFC_SECRET_B32, t * 1000, 8)).toBe(expected);
  });

  it('formatea a 6 dígitos con ceros a la izquierda', async () => {
    expect(await generateTotp(webSha1, RFC_SECRET_B32, 1234567890 * 1000)).toBe('005924');
  });

  it('cumple los vectores HOTP del RFC 4226', async () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    for (const [counter, code] of expected.entries()) {
      expect(await hotp(webSha1, RFC_SECRET_BYTES, counter)).toBe(code);
    }
  });

  it('codifica T en 8 bytes Big-Endian, incluso por encima de 2^32', () => {
    expect(toHex(counterToBytes(1))).toBe('0000000000000001');
    expect(toHex(counterToBytes(0x0123456789))).toBe('0000000123456789');
    // Valor de T publicado en la tabla del Apéndice B del RFC 6238.
    expect(toHex(counterToBytes(timeStep(20000000000 * 1000)))).toBe('0000000027bc86aa');
    expect(toHex(counterToBytes(0x1_0000_0001))).toBe('0000000100000001');
  });

  it('aplica el truncamiento dinámico (RFC 4226 §5.4)', () => {
    expect(dynamicTruncation(fromHex('1f8698690e02ca16618550ef7f19da8e945b555a'))).toBe(0x50ef7f19);
  });

  it('calcula los segundos restantes de la ventana', () => {
    expect(secondsRemaining(0)).toBe(30);
    expect(secondsRemaining(29_999)).toBe(1);
    expect(secondsRemaining(30_000)).toBe(30);
  });
});

describe('otpauth:// (Key URI Format)', () => {
  it('interpreta el URI de ejemplo de la guía', () => {
    const acc = parseOtpAuthUri(
      'otpauth://totp/UniSabana:estudiante@unisabana.edu.co?secret=JBSWY3DPEHPK3PXP&issuer=UniSabana',
    );
    expect(acc).toMatchObject({ issuer: 'UniSabana', account: 'estudiante@unisabana.edu.co', secret: 'JBSWY3DPEHPK3PXP' });
  });

  it('interpreta etiquetas codificadas y parámetros opcionales', () => {
    const acc = parseOtpAuthUri(
      'otpauth://totp/UniSabana:estudiante%40unisabana.edu.co?secret=JBSWY3DPEHPK3PXP&issuer=UniSabana&algorithm=SHA1&digits=6&period=30',
    );
    expect(acc.account).toBe('estudiante@unisabana.edu.co');
  });

  it('rechaza URIs inválidos o no soportados', () => {
    expect(() => parseOtpAuthUri('https://example.com')).toThrow(OtpAuthParseError);
    expect(() => parseOtpAuthUri('otpauth://hotp/X?secret=JBSWY3DPEHPK3PXP&counter=0')).toThrow(OtpAuthParseError);
    expect(() => parseOtpAuthUri('otpauth://totp/X?secret=INVALID0')).toThrow(OtpAuthParseError);
    expect(() => parseOtpAuthUri('otpauth://totp/X?secret=JBSWY3DPEHPK3PXP&digits=8')).toThrow(OtpAuthParseError);
  });
});

describe('utilidades de bytes', () => {
  it('codifica Base64URL sin relleno', () => {
    expect(base64UrlEncode(utf8Bytes(''))).toBe('');
    expect(base64UrlEncode(utf8Bytes('f'))).toBe('Zg');
    expect(base64UrlEncode(utf8Bytes('fo'))).toBe('Zm8');
    expect(base64UrlEncode(utf8Bytes('foo'))).toBe('Zm9v');
    expect(base64UrlEncode(fromHex('fbff'))).toBe('-_8');
  });
  it('compara en tiempo constante', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'ab')).toBe(false);
  });
});
