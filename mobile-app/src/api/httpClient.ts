import { ApiError, NetworkError, SessionExpiredError } from './errors';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  baseUrl: string;
  /** access_token actual, que vive solo en memoria. */
  getAccessToken: () => string | null;
  /** Ejecuta POST /auth/refresh y devuelve el nuevo access_token. Lanza SessionExpiredError si el refresh_token no sirve. */
  refreshAccessToken: () => Promise<string>;
  /** Limpia el almacenamiento seguro y lleva al usuario a la pantalla de bienvenida. */
  onSessionExpired: () => void | Promise<void>;
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** false = petición pública, sin Authorization. */
  auth?: boolean;
  /** Token explícito (p. ej. elevated_token). Con él NO se hace silent refresh en 401. */
  token?: string;
}

interface QueuedRequest {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

/**
 * Cliente HTTP (wrapper de fetch) con "Silent Refresh Queue".
 *
 * Cuando una petición recibe 401:
 *  1. Se pausan las llamadas subsecuentes y las peticiones en vuelo se encolan.
 *  2. Se dispara UNA sola petición de renovación (POST /auth/refresh).
 *  3. Si funciona, se actualiza el access_token en memoria, se reintentan las
 *     peticiones originales y se desbloquea la cola.
 *  4. Si el refresh_token también está vencido/revocado, se rechaza toda la cola
 *     y se invoca onSessionExpired (limpia SecureStore y navega a bienvenida).
 */
export class HttpClient {
  private refreshing = false;
  private queue: QueuedRequest[] = [];
  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;

  /** Métricas para la demostración en vivo. */
  readonly stats = { refreshCount: 0, retriedRequests: 0 };

  constructor(private readonly options: HttpClientOptions) {
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  get isRefreshing(): boolean {
    return this.refreshing;
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const usesSessionToken = opts.auth !== false && opts.token === undefined;

    // (1) Si ya hay una renovación en curso, la nueva llamada espera en la cola.
    let token: string | null = null;
    if (usesSessionToken) {
      token = this.refreshing ? await this.enqueue() : this.options.getAccessToken();
    } else if (opts.token !== undefined) {
      token = opts.token;
    }

    let response = await this.send(path, opts, token);

    if (response.status === 401 && usesSessionToken) {
      const freshToken = await this.handleUnauthorized(token);
      this.stats.retriedRequests += 1;
      response = await this.send(path, opts, freshToken);
    }

    return this.parse<T>(response);
  }

  private handleUnauthorized(failedToken: string | null): Promise<string> {
    const current = this.options.getAccessToken();
    // Otra petición ya renovó el token mientras esta estaba en vuelo: basta con reintentar.
    if (!this.refreshing && current && current !== failedToken) {
      return Promise.resolve(current);
    }
    const waiter = this.enqueue();
    if (!this.refreshing) void this.runRefresh();
    return waiter;
  }

  private enqueue(): Promise<string> {
    return new Promise<string>((resolve, reject) => this.queue.push({ resolve, reject }));
  }

  private async runRefresh(): Promise<void> {
    this.refreshing = true;
    this.stats.refreshCount += 1;
    let token: string | undefined;
    let failure: unknown;
    try {
      token = await this.options.refreshAccessToken();
    } catch (err) {
      failure = err;
    }

    const pending = this.queue;
    this.queue = [];
    this.refreshing = false;

    if (token !== undefined) {
      pending.forEach((q) => q.resolve(token));
      return;
    }
    if (failure instanceof SessionExpiredError) {
      try {
        await this.options.onSessionExpired();
      } catch {
        // La limpieza no debe impedir rechazar la cola.
      }
    }
    pending.forEach((q) => q.reject(failure));
  }

  private async send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(`${this.options.baseUrl}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }

  private async parse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: 'invalid_response', error_description: text.slice(0, 200) };
      }
    }
    if (!response.ok) {
      throw new ApiError(response.status, (body as Record<string, unknown>) ?? null);
    }
    return body as T;
  }
}
