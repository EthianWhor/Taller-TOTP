import { describe, expect, it, vi } from 'vitest';
import { NetworkError, SessionExpiredError } from '../api/errors';
import type { TokenResponse } from '../api/types';
import { SessionManager, type RefreshTokenStorage } from './sessionManager';

function memoryStorage(initial: string | null = null): RefreshTokenStorage & { value: string | null } {
  return {
    value: initial,
    async get() {
      return this.value;
    },
    async set(t) {
      this.value = t;
    },
    async clear() {
      this.value = null;
    },
  };
}

const tokens = (n: number): TokenResponse => ({
  token_type: 'Bearer',
  access_token: `access-${n}`,
  expires_in: 300,
  refresh_token: `refresh-${n}`,
  refresh_expires_in: 2592000,
});

describe('SessionManager', () => {
  it('login: access_token en memoria y refresh_token en el almacenamiento seguro', async () => {
    const storage = memoryStorage();
    const session = new SessionManager({
      storage,
      authApi: { refresh: vi.fn(), logout: vi.fn() },
      authorize: async () => tokens(1),
    });
    await session.login();
    expect(session.getAccessToken()).toBe('access-1');
    expect(storage.value).toBe('refresh-1');
    expect(session.getState().status).toBe('authenticated');
  });

  it('restore: renueva con el refresh_token guardado y lo rota', async () => {
    const storage = memoryStorage('refresh-0');
    const refresh = vi.fn(async () => tokens(1));
    const session = new SessionManager({ storage, authApi: { refresh, logout: vi.fn() }, authorize: vi.fn() });
    await session.restore();
    expect(refresh).toHaveBeenCalledWith('refresh-0');
    expect(storage.value).toBe('refresh-1');
    expect(session.getState()).toEqual({ status: 'authenticated', reason: null });
  });

  it('restore: si el refresh_token venció, limpia el almacenamiento', async () => {
    const storage = memoryStorage('refresh-0');
    const session = new SessionManager({
      storage,
      authApi: { refresh: async () => Promise.reject(new SessionExpiredError()), logout: vi.fn() },
      authorize: vi.fn(),
    });
    await session.restore();
    expect(storage.value).toBeNull();
    expect(session.getState()).toEqual({ status: 'unauthenticated', reason: 'expired' });
  });

  it('restore: sin red conserva el refresh_token', async () => {
    const storage = memoryStorage('refresh-0');
    const session = new SessionManager({
      storage,
      authApi: { refresh: async () => Promise.reject(new NetworkError()), logout: vi.fn() },
      authorize: vi.fn(),
    });
    await session.restore();
    expect(storage.value).toBe('refresh-0');
    expect(session.getState().reason).toBe('offline');
  });

  it('expire: borra tokens de memoria y SecureStore y notifica a la UI', async () => {
    const storage = memoryStorage();
    const session = new SessionManager({ storage, authApi: { refresh: vi.fn(), logout: vi.fn() }, authorize: async () => tokens(1) });
    await session.login();
    session.setElevatedToken('elevated', 600);
    const listener = vi.fn();
    session.subscribe(listener);
    await session.expire();
    expect(session.getAccessToken()).toBeNull();
    expect(session.getElevatedToken()).toBeNull();
    expect(storage.value).toBeNull();
    expect(listener).toHaveBeenCalled();
    expect(session.getState()).toEqual({ status: 'unauthenticated', reason: 'expired' });
  });

  it('el elevated_token caduca en memoria', () => {
    let now = 0;
    const session = new SessionManager({
      storage: memoryStorage(),
      authApi: { refresh: vi.fn(), logout: vi.fn() },
      authorize: vi.fn(),
      clock: () => now,
    });
    session.setElevatedToken('elevated', 600);
    expect(session.getElevatedToken()).toBe('elevated');
    now = 600_000;
    expect(session.getElevatedToken()).toBeNull();
  });

  it('logout: revoca en el servidor aunque falle la red', async () => {
    const storage = memoryStorage();
    const logout = vi.fn(async () => Promise.reject(new NetworkError()));
    const session = new SessionManager({ storage, authApi: { refresh: vi.fn(), logout }, authorize: async () => tokens(1) });
    await session.login();
    await session.logout();
    expect(logout).toHaveBeenCalledWith('refresh-1');
    expect(storage.value).toBeNull();
    expect(session.getState().reason).toBe('logged_out');
  });
});
