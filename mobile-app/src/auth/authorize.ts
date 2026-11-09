import * as WebBrowser from 'expo-web-browser';
import type { AuthApi } from '../api/authApi';
import type { TokenResponse } from '../api/types';
import { API_URL, OAUTH_CLIENT_ID, REDIRECT_URI } from '../config';
import { randomBytes, sha256 } from '../crypto/nativeHash';
import { buildAuthorizeUrl, parseAuthCallback } from './oauthCallback';
import { createPkcePair, generateState } from './pkce';

export class LoginCancelledError extends Error {
  constructor() {
    super('Inicio de sesión cancelado');
    this.name = 'LoginCancelledError';
  }
}

/**
 * Flujo Authorization Code + PKCE con el navegador SEGURO del sistema:
 * ASWebAuthenticationSession en iOS y Custom Tabs en Android (nunca una WebView embebida).
 * El code_verifier y el state solo existen en variables locales de esta función (RAM).
 */
export function createAuthorize(authApi: AuthApi) {
  return async function authorize(): Promise<TokenResponse> {
    const pkce = await createPkcePair(randomBytes, sha256);
    const state = generateState(randomBytes);

    const authorizeUrl = buildAuthorizeUrl({
      apiUrl: API_URL,
      clientId: OAUTH_CLIENT_ID,
      redirectUri: REDIRECT_URI,
      codeChallenge: pkce.codeChallenge,
      state,
    });

    const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, REDIRECT_URI, {
      // iOS: sesión efímera, sin compartir cookies con Safari.
      preferEphemeralSession: true,
    });
    if (result.type !== 'success') throw new LoginCancelledError();

    // Valida state (anti-CSRF) y extrae el código; si no coincide, se aborta aquí.
    const { code } = parseAuthCallback(result.url, state, REDIRECT_URI);

    return authApi.exchangeCode({
      code,
      codeVerifier: pkce.codeVerifier,
      redirectUri: REDIRECT_URI,
      clientId: OAUTH_CLIENT_ID,
    });
  };
}
