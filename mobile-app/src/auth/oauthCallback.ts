import { constantTimeEqual } from '../crypto/bytes';
import { buildQuery, parseQuery, stripQuery } from '../utils/query';

export interface AuthorizeUrlParams {
  apiUrl: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}

export function buildAuthorizeUrl(p: AuthorizeUrlParams): string {
  return `${p.apiUrl}/oauth/authorize?${buildQuery({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    code_challenge: p.codeChallenge,
    code_challenge_method: 'S256',
    state: p.state,
  })}`;
}

export type OAuthCallbackErrorKind = 'state_mismatch' | 'provider_error' | 'missing_code' | 'wrong_redirect';

export class OAuthCallbackError extends Error {
  constructor(
    readonly kind: OAuthCallbackErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'OAuthCallbackError';
  }
}

/**
 * Valida el deep link de retorno (ej. unisabana-auth://callback?code=...&state=...).
 * Si el state no coincide con el generado en memoria, se ABORTA el intercambio (anti-CSRF).
 */
export function parseAuthCallback(url: string, expectedState: string, expectedRedirectUri: string): { code: string } {
  if (stripQuery(url) !== stripQuery(expectedRedirectUri)) {
    throw new OAuthCallbackError('wrong_redirect', 'El callback no proviene del redirect_uri esperado');
  }
  const params = parseQuery(url);

  // El state se valida ANTES que cualquier otro dato del callback.
  if (!params.state || !constantTimeEqual(params.state, expectedState)) {
    throw new OAuthCallbackError(
      'state_mismatch',
      'El parámetro state no coincide: posible ataque CSRF. Se abortó el inicio de sesión.',
    );
  }
  if (params.error) {
    throw new OAuthCallbackError('provider_error', params.error_description || params.error);
  }
  if (!params.code) {
    throw new OAuthCallbackError('missing_code', 'El servidor no devolvió un código de autorización');
  }
  return { code: params.code };
}
