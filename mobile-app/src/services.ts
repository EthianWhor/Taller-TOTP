import { createAuthApi } from './api/authApi';
import { HttpClient } from './api/httpClient';
import type { MeResponse, MfaVerifyResponse, VaultResponse } from './api/types';
import { createAuthorize } from './auth/authorize';
import { secureRefreshTokenStorage } from './auth/secureStorage';
import { SessionManager } from './auth/sessionManager';
import { API_URL } from './config';

/** Composición de dependencias de la app (singletons de proceso). */
export const authApi = createAuthApi(API_URL);

export const session = new SessionManager({
  storage: secureRefreshTokenStorage,
  authApi,
  authorize: createAuthorize(authApi),
});

export const http = new HttpClient({
  baseUrl: API_URL,
  getAccessToken: session.getAccessToken,
  refreshAccessToken: session.refreshAccessToken,
  onSessionExpired: session.expire,
});

export const api = {
  me: () => http.request<MeResponse>('/api/me'),

  /** Con elevated_token vigente se usa directamente; si no, va el access_token estándar. */
  vault: (elevatedToken?: string | null) =>
    http.request<VaultResponse>('/api/boveda-critica', elevatedToken ? { token: elevatedToken } : {}),

  verifyMfa: (stepUpToken: string, code: string) =>
    http.request<MfaVerifyResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: { step_up_token: stepUpToken, code },
      auth: false,
    }),
};
