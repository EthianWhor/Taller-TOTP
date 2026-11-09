import { describe, expect, it } from 'vitest';
import { computeS256Challenge, isValidCodeVerifier, verifyPkce } from '../src/crypto/pkce.js';

describe('PKCE S256 (RFC 7636)', () => {
  // Vector del Apéndice B del RFC 7636.
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

  it('calcula el challenge del vector oficial', () => {
    expect(computeS256Challenge(verifier)).toBe(challenge);
  });

  it('verifica un par válido', () => {
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it('rechaza un verifier distinto', () => {
    expect(verifyPkce(verifier.replace('d', 'e'), challenge)).toBe(false);
  });

  it('valida longitud y alfabeto del verifier', () => {
    expect(isValidCodeVerifier('a'.repeat(42))).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(43))).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(128))).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(129))).toBe(false);
    expect(isValidCodeVerifier(`${'a'.repeat(43)}+`)).toBe(false);
  });
});
