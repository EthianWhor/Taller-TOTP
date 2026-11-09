import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, SessionExpiredError } from './errors';
import { HttpClient, type FetchFn } from './httpClient';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Backend simulado: acepta solo el token "valid-N" vigente. */
function setup(opts: { refresh?: () => Promise<string> } = {}) {
  let accessToken: string | null = 'expired';
  const seenTokens: Array<string | null> = [];
  const fetchFn = vi.fn<FetchFn>(async (_url, init) => {
    const auth = (init?.headers as Record<string, string>)?.Authorization ?? null;
    const token = auth?.replace('Bearer ', '') ?? null;
    seenTokens.push(token);
    return token === accessToken && token !== 'expired' ? json(200, { ok: true, token }) : json(401, { error: 'invalid_token' });
  });
  let refreshCalls = 0;
  const refreshAccessToken = vi.fn(
    opts.refresh ??
      (async () => {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 10));
        accessToken = `valid-${refreshCalls}`;
        return accessToken;
      }),
  );
  const onSessionExpired = vi.fn();
  const client = new HttpClient({
    baseUrl: 'http://api',
    getAccessToken: () => accessToken,
    refreshAccessToken,
    onSessionExpired,
    fetchFn,
  });
  return { client, fetchFn, refreshAccessToken, onSessionExpired, seenTokens, setToken: (t: string | null) => (accessToken = t) };
}

describe('HttpClient — Silent Refresh Queue', () => {
  it('ante varios 401 concurrentes dispara UNA sola renovación y reintenta todas', async () => {
    const { client, refreshAccessToken, onSessionExpired } = setup();
    const results = await Promise.all([
      client.request<{ token: string }>('/api/me'),
      client.request<{ token: string }>('/api/me'),
      client.request<{ token: string }>('/api/me'),
    ]);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.token)).toEqual(['valid-1', 'valid-1', 'valid-1']);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(client.stats).toEqual({ refreshCount: 1, retriedRequests: 3 });
  });

  it('pausa las llamadas nuevas mientras la renovación está en curso', async () => {
    const gate = deferred<string>();
    const { client, fetchFn, seenTokens, setToken } = setup({
      refresh: async () => {
        const t = await gate.promise;
        setToken(t);
        return t;
      },
    });
    const first = client.request('/api/me');
    await vi.waitFor(() => expect(client.isRefreshing).toBe(true));
    const callsBefore = fetchFn.mock.calls.length;

    const second = client.request('/api/me'); // llega durante el refresh
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchFn.mock.calls.length).toBe(callsBefore); // no salió a la red

    gate.resolve('valid-x');
    await Promise.all([first, second]);
    expect(seenTokens.filter((t) => t === 'expired')).toHaveLength(1); // solo la primera usó el token viejo
  });

  it('si el refresh_token venció: limpia sesión una vez y rechaza toda la cola', async () => {
    const { client, onSessionExpired } = setup({
      refresh: async () => {
        await new Promise((r) => setTimeout(r, 5));
        throw new SessionExpiredError();
      },
    });
    const results = await Promise.allSettled([client.request('/a'), client.request('/b'), client.request('/c')]);
    expect(results.every((r) => r.status === 'rejected' && r.reason instanceof SessionExpiredError)).toBe(true);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('un error de red al renovar NO cierra la sesión', async () => {
    const { client, onSessionExpired } = setup({
      refresh: async () => {
        throw new NetworkError();
      },
    });
    await expect(client.request('/a')).rejects.toBeInstanceOf(NetworkError);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(client.isRefreshing).toBe(false);
  });

  it('no renueva de nuevo si otra petición ya obtuvo un token fresco', async () => {
    const refreshAccessToken = vi.fn(async () => 'nunca');
    // Simula una petición que salió con un token viejo y vuelve con 401 cuando ya hay uno nuevo.
    const fetchFn = vi.fn<FetchFn>(async (_u, init) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer valid-0' ? json(200, { ok: true }) : json(401, {});
    });
    const stale = new HttpClient({
      baseUrl: 'http://api',
      getAccessToken: (() => {
        let n = 0;
        return () => (n++ === 0 ? 'old' : 'valid-0');
      })(),
      refreshAccessToken,
      onSessionExpired: vi.fn(),
      fetchFn,
    });
    await expect(stale.request('/a')).resolves.toEqual({ ok: true });
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('propaga 403 mfa_required con su cuerpo (step_up_token)', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => json(403, { error: 'mfa_required', step_up_token: 'su' }));
    const client = new HttpClient({
      baseUrl: 'http://api',
      getAccessToken: () => 't',
      refreshAccessToken: vi.fn(),
      onSessionExpired: vi.fn(),
      fetchFn,
    });
    const err = (await client.request('/api/boveda-critica').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('mfa_required');
    expect(err.body?.step_up_token).toBe('su');
  });

  it('con token explícito (elevated_token) no intenta renovar en 401', async () => {
    const { client, refreshAccessToken } = setup();
    const err = (await client.request('/api/boveda-critica', { token: 'elevated-viejo' }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('las peticiones públicas no envían Authorization', async () => {
    const { client, seenTokens } = setup();
    await client.request('/auth/mfa/verify', { method: 'POST', body: {}, auth: false }).catch(() => undefined);
    expect(seenTokens).toEqual([null]);
  });

  it('traduce fallas de conectividad a NetworkError', async () => {
    const client = new HttpClient({
      baseUrl: 'http://api',
      getAccessToken: () => 't',
      refreshAccessToken: vi.fn(),
      onSessionExpired: vi.fn(),
      fetchFn: async () => {
        throw new TypeError('Network request failed');
      },
    });
    await expect(client.request('/a')).rejects.toBeInstanceOf(NetworkError);
  });
});
