import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, isValidBase32 } from '../src/crypto/base32.js';

describe('Base32 (RFC 4648)', () => {
  const vectors: Array<[string, string]> = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];

  it.each(vectors)('codifica y decodifica %j', (plain, encoded) => {
    expect(base32Encode(Buffer.from(plain))).toBe(encoded);
    expect(base32Decode(encoded).toString()).toBe(plain);
  });

  it('decodifica la semilla de ejemplo de la guía', () => {
    expect(base32Decode('JBSWY3DPEHPK3PXP').toString('hex')).toBe('48656c6c6f21deadbeef');
  });

  it('tolera minúsculas, espacios y relleno', () => {
    expect(base32Decode('jbsw y3dp ehpk 3pxp====').toString('hex')).toBe('48656c6c6f21deadbeef');
  });

  it('rechaza caracteres fuera del alfabeto', () => {
    expect(isValidBase32('JBSWY3DP0189')).toBe(false);
    expect(() => base32Decode('ABC1')).toThrow();
  });
});
