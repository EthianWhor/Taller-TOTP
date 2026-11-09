import { describe, expect, it } from 'vitest';
import { utf8Bytes } from '../crypto/bytes';
import { webSha256 } from '../crypto/testHash';
import { buildAuthorizeUrl, OAuthCallbackError, parseAuthCallback } from './oauthCallback';
import { computeCodeChallenge, createPkcePair, generateState } from './pkce';

const cryptoRandom = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const REDIRECT = 'unisabana-auth://callback';

describe('PKCE (RFC 7636)', () => {
  it('reproduce el vector del Apéndice B', async () => {
    expect(await computeCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', webSha256)).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('genera un code_verifier de 43–128 caracteres URL-safe y su challenge S256', async () => {
    const pair = await createPkcePair(cryptoRandom, webSha256);
    expect(pair.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(pair.codeChallenge).toMatch(/^[A-Za-z0-9\-_]{43}$/); // sin relleno '='
    expect(pair.codeChallengeMethod).toBe('S256');
    expect(pair.codeChallenge).toBe(await computeCodeChallenge(pair.codeVerifier, webSha256));
  });

  it('genera valores distintos en cada solicitud', async () => {
    const a = await createPkcePair(cryptoRandom, webSha256);
    const b = await createPkcePair(cryptoRandom, webSha256);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(generateState(cryptoRandom)).not.toBe(generateState(cryptoRandom));
  });

  it('usa la fuente aleatoria inyectada', () => {
    const fixed = (n: number) => utf8Bytes('x'.repeat(n));
    expect(generateState(fixed)).toBe(generateState(fixed));
  });
});

describe('URL de autorización', () => {
  it('incluye todos los parámetros codificados', () => {
    const url = buildAuthorizeUrl({
      apiUrl: 'http://10.0.2.2:4000',
      clientId: 'unisabana-mobile',
      redirectUri: REDIRECT,
      codeChallenge: 'abc',
      state: 's t',
    });
    expect(url).toBe(
      'http://10.0.2.2:4000/oauth/authorize?response_type=code&client_id=unisabana-mobile' +
        '&redirect_uri=unisabana-auth%3A%2F%2Fcallback&code_challenge=abc&code_challenge_method=S256&state=s%20t',
    );
  });
});

describe('callback del deep link', () => {
  it('extrae el code cuando el state coincide', () => {
    expect(parseAuthCallback(`${REDIRECT}?code=AUTH_CODE&state=xyz`, 'xyz', REDIRECT)).toEqual({ code: 'AUTH_CODE' });
  });

  it('aborta si el state no coincide (anti-CSRF)', () => {
    expect(() => parseAuthCallback(`${REDIRECT}?code=AUTH_CODE&state=atacante`, 'xyz', REDIRECT)).toThrow(
      expect.objectContaining({ kind: 'state_mismatch' }),
    );
  });

  it('aborta si falta el state', () => {
    expect(() => parseAuthCallback(`${REDIRECT}?code=AUTH_CODE`, 'xyz', REDIRECT)).toThrow(OAuthCallbackError);
  });

  it('valida el state incluso cuando el servidor devuelve un error', () => {
    expect(() => parseAuthCallback(`${REDIRECT}?error=access_denied&state=otro`, 'xyz', REDIRECT)).toThrow(
      expect.objectContaining({ kind: 'state_mismatch' }),
    );
    expect(() =>
      parseAuthCallback(`${REDIRECT}?error=access_denied&error_description=Cancelado&state=xyz`, 'xyz', REDIRECT),
    ).toThrow(expect.objectContaining({ kind: 'provider_error', message: 'Cancelado' }));
  });

  it('rechaza un callback de otro redirect_uri', () => {
    expect(() => parseAuthCallback('otraapp://callback?code=X&state=xyz', 'xyz', REDIRECT)).toThrow(
      expect.objectContaining({ kind: 'wrong_redirect' }),
    );
  });

  it('acepta el redirect de Expo Go', () => {
    const expo = 'exp://192.168.1.10:8081/--/callback';
    expect(parseAuthCallback(`${expo}?code=C&state=s`, 's', expo)).toEqual({ code: 'C' });
  });
});
