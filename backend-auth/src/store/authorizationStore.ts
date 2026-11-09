import type { Clock } from '../clock.js';
import { randomToken } from '../crypto/pkce.js';

/** Solicitud /oauth/authorize pendiente mientras el usuario inicia sesión en el navegador. */
export interface PendingAuthorization {
  id: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  expiresAt: number;
  failedLogins: number;
}

export interface AuthorizationCode {
  code: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
  used: boolean;
  /** Familia de refresh tokens emitida con este código (para revocarla si se reutiliza). */
  issuedFamilyId?: string;
}

const PENDING_TTL_MS = 10 * 60 * 1000;

export class AuthorizationStore {
  private readonly pending = new Map<string, PendingAuthorization>();
  private readonly codes = new Map<string, AuthorizationCode>();

  constructor(
    private readonly clock: Clock,
    private readonly codeTtlSeconds: number,
  ) {}

  createPending(input: Omit<PendingAuthorization, 'id' | 'expiresAt' | 'failedLogins'>): PendingAuthorization {
    this.sweep();
    const entry: PendingAuthorization = {
      ...input,
      id: randomToken(24),
      expiresAt: this.clock() + PENDING_TTL_MS,
      failedLogins: 0,
    };
    this.pending.set(entry.id, entry);
    return entry;
  }

  getPending(id: string): PendingAuthorization | undefined {
    const entry = this.pending.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.clock()) {
      this.pending.delete(id);
      return undefined;
    }
    return entry;
  }

  deletePending(id: string): void {
    this.pending.delete(id);
  }

  issueCode(pending: PendingAuthorization, userId: string): AuthorizationCode {
    const code: AuthorizationCode = {
      code: randomToken(32),
      userId,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      expiresAt: this.clock() + this.codeTtlSeconds * 1000,
      used: false,
    };
    this.codes.set(code.code, code);
    return code;
  }

  getCode(code: string): AuthorizationCode | undefined {
    return this.codes.get(code);
  }

  isExpired(code: AuthorizationCode): boolean {
    return code.expiresAt <= this.clock();
  }

  private sweep(): void {
    const now = this.clock();
    for (const [id, p] of this.pending) if (p.expiresAt <= now) this.pending.delete(id);
    // Los códigos usados se conservan un rato más para detectar reutilización.
    for (const [c, entry] of this.codes) if (entry.expiresAt + PENDING_TTL_MS <= now) this.codes.delete(c);
  }
}
