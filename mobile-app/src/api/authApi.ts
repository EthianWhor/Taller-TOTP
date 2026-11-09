import { ApiError, NetworkError, SessionExpiredError } from './errors';
import type { FetchFn } from './httpClient';
import type { TokenResponse } from './types';

/**
 * Llamadas a los endpoints de tokens. Usan fetch directo (no el HttpClient interceptado)
 * para que un 401 aquí no dispare, recursivamente, otra renovación.
 */
export function createAuthApi(baseUrl: string, fetchFn: FetchFn = (i, init) => fetch(i, init)) {
  async function post<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new NetworkError();
    }
    const text = await response.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    if (!response.ok) throw new ApiError(response.status, json);
    return json as T;
  }

  return {
    /** Canje authorization_code + code_verifier (PKCE). */
    exchangeCode(params: { code: string; codeVerifier: string; redirectUri: string; clientId: string }) {
      return post<TokenResponse>('/auth/oauth/token', {
        grant_type: 'authorization_code',
        code: params.code,
        code_verifier: params.codeVerifier,
        redirect_uri: params.redirectUri,
        client_id: params.clientId,
      });
    },

    /** Renovación. 400/401 => el refresh_token ya no sirve (vencido, revocado o reutilizado). */
    async refresh(refreshToken: string): Promise<TokenResponse> {
      try {
        return await post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken });
      } catch (err) {
        if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
          throw new SessionExpiredError();
        }
        throw err;
      }
    },

    async logout(refreshToken: string): Promise<void> {
      await post<null>('/auth/logout', { refresh_token: refreshToken });
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
