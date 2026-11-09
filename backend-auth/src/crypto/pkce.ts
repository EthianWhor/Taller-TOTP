import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 7636 §4.1: 43–128 caracteres del conjunto unreserved [A-Z a-z 0-9 - . _ ~]. */
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
/** Un challenge S256 es SHA-256 (32 bytes) en Base64URL sin relleno: 43 caracteres. */
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;

export function isValidCodeVerifier(verifier: string): boolean {
  return VERIFIER_RE.test(verifier);
}

export function isValidCodeChallenge(challenge: string): boolean {
  return CHALLENGE_RE.test(challenge);
}

export function computeS256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** Verifica que BASE64URL(SHA256(code_verifier)) === code_challenge en tiempo constante. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!isValidCodeVerifier(verifier) || !isValidCodeChallenge(challenge)) return false;
  const computed = Buffer.from(computeS256Challenge(verifier));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
