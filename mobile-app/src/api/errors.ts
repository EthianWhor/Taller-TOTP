/** Respuesta HTTP no exitosa con su cuerpo JSON (si lo hay). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown> | null,
  ) {
    super(
      (typeof body?.error_description === 'string' && body.error_description) ||
        (typeof body?.error === 'string' && body.error) ||
        `Error HTTP ${status}`,
    );
    this.name = 'ApiError';
  }

  get code(): string | undefined {
    return typeof this.body?.error === 'string' ? this.body.error : undefined;
  }
}

/** Sin conectividad o el servidor no respondió a tiempo. */
export class NetworkError extends Error {
  constructor(message = 'No se pudo contactar al servidor. Revisa tu conexión.') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** El refresh_token venció o fue revocado: hay que volver a iniciar sesión. */
export class SessionExpiredError extends Error {
  constructor(message = 'Tu sesión expiró. Inicia sesión de nuevo.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Ocurrió un error inesperado';
}
