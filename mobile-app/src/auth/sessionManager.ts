import { NetworkError, SessionExpiredError } from '../api/errors';
import type { AuthApi } from '../api/authApi';
import type { TokenResponse } from '../api/types';

export type SessionStatus = 'restoring' | 'authenticated' | 'unauthenticated';
export type SessionEndReason = 'expired' | 'logged_out' | 'offline' | null;

export interface SessionState {
  status: SessionStatus;
  reason: SessionEndReason;
}

/** Persistencia del refresh_token (Keychain / Keystore vía expo-secure-store). */
export interface RefreshTokenStorage {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface SessionDeps {
  storage: RefreshTokenStorage;
  authApi: Pick<AuthApi, 'refresh' | 'logout'>;
  /** Flujo OAuth 2.0 + PKCE en el navegador del sistema. */
  authorize: () => Promise<TokenResponse>;
  clock?: () => number;
}

/**
 * Ciclo de vida de los tokens con separación de memoria:
 *  - access_token y elevated_token: SOLO en variables de este objeto (RAM). Mueren con el proceso.
 *  - refresh_token: SOLO en el almacenamiento seguro del sistema operativo.
 */
export class SessionManager {
  private accessToken: string | null = null;
  private elevated: { token: string; expiresAt: number } | null = null;
  private state: SessionState = { status: 'restoring', reason: null };
  private readonly listeners = new Set<() => void>();
  private readonly clock: () => number;

  constructor(private readonly deps: SessionDeps) {
    this.clock = deps.clock ?? (() => Date.now());
  }

  // ---- Suscripción (useSyncExternalStore) ----
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): SessionState => this.state;

  private setState(next: SessionState): void {
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  // ---- Tokens en memoria ----
  getAccessToken = (): string | null => this.accessToken;

  getElevatedToken(): string | null {
    if (!this.elevated) return null;
    // Margen de 5 s para no enviar un token a punto de expirar.
    if (this.elevated.expiresAt - 5_000 <= this.clock()) {
      this.elevated = null;
      return null;
    }
    return this.elevated.token;
  }

  getElevatedExpiresAt(): number | null {
    return this.getElevatedToken() ? this.elevated!.expiresAt : null;
  }

  setElevatedToken(token: string, expiresInSeconds: number): void {
    this.elevated = { token, expiresAt: this.clock() + expiresInSeconds * 1000 };
  }

  clearElevatedToken(): void {
    this.elevated = null;
  }

  // ---- Ciclo de vida ----

  /** Al abrir la app: si hay refresh_token guardado, obtiene un access_token nuevo. */
  async restore(): Promise<void> {
    const stored = await this.deps.storage.get();
    if (!stored) {
      this.setState({ status: 'unauthenticated', reason: null });
      return;
    }
    try {
      await this.refreshAccessToken();
      this.setState({ status: 'authenticated', reason: null });
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        await this.clearAll();
        this.setState({ status: 'unauthenticated', reason: 'expired' });
      } else {
        // Sin red (p. ej. Modo Avión): se conserva el refresh_token para reintentar luego.
        this.setState({ status: 'unauthenticated', reason: 'offline' });
      }
    }
  }

  async hasStoredSession(): Promise<boolean> {
    return (await this.deps.storage.get()) !== null;
  }

  async login(): Promise<void> {
    const tokens = await this.deps.authorize();
    await this.deps.storage.set(tokens.refresh_token);
    this.accessToken = tokens.access_token;
    this.elevated = null;
    this.setState({ status: 'authenticated', reason: null });
  }

  /**
   * Renovación usada por la Silent Refresh Queue. Rota el refresh_token en SecureStore
   * y deja el nuevo access_token en memoria.
   */
  refreshAccessToken = async (): Promise<string> => {
    const refreshToken = await this.deps.storage.get();
    if (!refreshToken) throw new SessionExpiredError();
    const tokens = await this.deps.authApi.refresh(refreshToken);
    await this.deps.storage.set(tokens.refresh_token);
    this.accessToken = tokens.access_token;
    return tokens.access_token;
  };

  /** El refresh_token venció o fue revocado: se limpia todo y se vuelve a bienvenida. */
  expire = async (): Promise<void> => {
    await this.clearAll();
    this.setState({ status: 'unauthenticated', reason: 'expired' });
  };

  async logout(): Promise<void> {
    const refreshToken = await this.deps.storage.get();
    if (refreshToken) {
      try {
        await this.deps.authApi.logout(refreshToken);
      } catch (err) {
        // Sin red igual se cierra la sesión local; el token caducará en el servidor.
        if (!(err instanceof NetworkError)) console.warn('[session] logout remoto falló', err);
      }
    }
    await this.clearAll();
    this.setState({ status: 'unauthenticated', reason: 'logged_out' });
  }

  /** Solo para la demostración: invalida el access_token en memoria para forzar un 401. */
  simulateAccessTokenExpiry(): void {
    if (this.accessToken) this.accessToken = `${this.accessToken}.expirado`;
  }

  private async clearAll(): Promise<void> {
    this.accessToken = null;
    this.elevated = null;
    await this.deps.storage.clear();
  }
}
