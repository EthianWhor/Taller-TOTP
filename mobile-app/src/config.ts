import * as Linking from 'expo-linking';

/** URL del backend-auth (ver .env.example). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

/** Cliente OAuth PÚBLICO: la app no tiene ni necesita client_secret (PKCE lo reemplaza). */
export const OAUTH_CLIENT_ID = process.env.EXPO_PUBLIC_OAUTH_CLIENT_ID ?? 'unisabana-mobile';

/**
 * Redirect URI del deep link.
 *  - Development build / app instalada: unisabana-auth://callback (esquema de app.json)
 *  - Expo Go: exp://<ip>:8081/--/callback (el backend lo admite solo en desarrollo)
 */
export const REDIRECT_URI = Linking.createURL('callback');
