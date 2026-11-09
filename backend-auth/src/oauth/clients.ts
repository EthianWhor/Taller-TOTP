import type { AppConfig } from '../config.js';

export function isRegisteredClient(config: AppConfig, clientId: unknown): clientId is string {
  return typeof clientId === 'string' && clientId === config.oauthClientId;
}

/**
 * Comparación EXACTA contra la lista blanca (RFC 9700 §4.1.3).
 * En desarrollo se permiten además los URI de Expo Go (exp://host:puerto/--/callback).
 */
export function isAllowedRedirectUri(config: AppConfig, redirectUri: unknown): redirectUri is string {
  if (typeof redirectUri !== 'string' || redirectUri.length > 512) return false;
  if (config.allowedRedirectUris.includes(redirectUri)) return true;
  if (config.allowExpoDevRedirects) {
    return /^exps?:\/\/[A-Za-z0-9.\-]+(:\d+)?\/--\/callback$/.test(redirectUri);
  }
  return false;
}
