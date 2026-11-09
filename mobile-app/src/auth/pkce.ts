import { base64UrlEncode, utf8Bytes } from '../crypto/bytes';
import type { HashFunction } from '../crypto/hmac';

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export type RandomBytes = (count: number) => Uint8Array;

/**
 * code_verifier (RFC 7636 §4.1): 64 bytes de un CSPRNG en Base64URL → 86 caracteres
 * del conjunto unreserved [A-Z a-z 0-9 - _], dentro del rango 43–128.
 */
export function generateCodeVerifier(randomBytes: RandomBytes): string {
  return base64UrlEncode(randomBytes(64));
}

/** code_challenge = BASE64URL-SIN-RELLENO(SHA256(ASCII(code_verifier))) (RFC 7636 §4.2). */
export async function computeCodeChallenge(verifier: string, sha256: HashFunction): Promise<string> {
  return base64UrlEncode(await sha256(utf8Bytes(verifier)));
}

export async function createPkcePair(randomBytes: RandomBytes, sha256: HashFunction): Promise<PkcePair> {
  const codeVerifier = generateCodeVerifier(randomBytes);
  return {
    codeVerifier,
    codeChallenge: await computeCodeChallenge(codeVerifier, sha256),
    codeChallengeMethod: 'S256',
  };
}

/** Parámetro state anti-CSRF: 32 bytes aleatorios, único por solicitud. */
export function generateState(randomBytes: RandomBytes): string {
  return base64UrlEncode(randomBytes(32));
}
