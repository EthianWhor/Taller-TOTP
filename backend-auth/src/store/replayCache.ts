import type { Clock } from '../clock.js';

/**
 * Caché Anti-Replay en memoria con TTL. Un código TOTP aceptado para un usuario se
 * registra durante 90 s (las tres ventanas C-1, C, C+1); si se vuelve a presentar
 * dentro de ese lapso se rechaza con 409 Conflict.
 */
export class ReplayCache {
  private readonly entries = new Map<string, number>();

  constructor(
    private readonly clock: Clock,
    private readonly ttlSeconds: number,
  ) {}

  private key(userId: string, code: string): string {
    return `${userId}:${code}`;
  }

  has(userId: string, code: string): boolean {
    this.sweep();
    return this.entries.has(this.key(userId, code));
  }

  remember(userId: string, code: string): void {
    this.entries.set(this.key(userId, code), this.clock() + this.ttlSeconds * 1000);
  }

  get size(): number {
    this.sweep();
    return this.entries.size;
  }

  private sweep(): void {
    const now = this.clock();
    for (const [k, expiresAt] of this.entries) if (expiresAt <= now) this.entries.delete(k);
  }
}

interface StepUpState {
  attempts: number;
  consumed: boolean;
  expiresAt: number;
}

/** Controla intentos fallidos y uso único de cada step_up_token (por jti). */
export class StepUpTracker {
  private readonly states = new Map<string, StepUpState>();

  constructor(private readonly clock: Clock) {}

  get(jti: string, expUnixSeconds: number): StepUpState {
    this.sweep();
    let state = this.states.get(jti);
    if (!state) {
      state = { attempts: 0, consumed: false, expiresAt: expUnixSeconds * 1000 };
      this.states.set(jti, state);
    }
    return state;
  }

  private sweep(): void {
    const now = this.clock();
    for (const [jti, s] of this.states) if (s.expiresAt <= now) this.states.delete(jti);
  }
}
