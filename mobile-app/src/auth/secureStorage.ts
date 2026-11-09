import * as SecureStore from 'expo-secure-store';
import type { RefreshTokenStorage } from './sessionManager';

/**
 * expo-secure-store => iOS Keychain (kSecClassGenericPassword) y, en Android,
 * valores cifrados con una llave AES del Android Keystore.
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY: solo legible con el equipo desbloqueado y nunca
 * se migra a copias de seguridad / otros dispositivos.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const REFRESH_TOKEN_KEY = 'auth.refresh_token';

export const secureRefreshTokenStorage: RefreshTokenStorage = {
  get: () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY, OPTIONS),
  set: (token) => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, OPTIONS),
  clear: () => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, OPTIONS),
};

/** Almacenamiento genérico de JSON cifrado (se usa para las semillas TOTP). */
export async function readSecureJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await SecureStore.getItemAsync(key, OPTIONS);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeSecureJson(key: string, value: unknown): Promise<void> {
  await SecureStore.setItemAsync(key, JSON.stringify(value), OPTIONS);
}
