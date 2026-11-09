import type { Clock } from '../clock.js';
import { randomToken, sha256Hex } from '../crypto/pkce.js';

interface RefreshRecord {
  userId: string;
  familyId: string;
  expiresAt: number;
  used: boolean;
}

interface Family {
  userId: string;
  revoked: boolean;
}

export type RotateResult =
  | { ok: true; userId: string; familyId: string; refreshToken: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'revoked' | 'reused' };

/**
 * Refresh tokens opacos con rotación y detección de reutilización
 * (OAuth 2.0 Security BCP §4.14). Solo se guarda el hash SHA-256 del token.
 * Cada inicio de sesión crea una "familia" que también actúa como id de sesión (sid).
 */
export class RefreshTokenStore {
  private readonly tokens = new Map<string, RefreshRecord>();
  private readonly families = new Map<string, Family>();

  constructor(
    private readonly clock: Clock,
    private readonly ttlSeconds: number,
  ) {}

  createFamily(userId: string): { familyId: string; refreshToken: string } {
    const familyId = randomToken(16);
    this.families.set(familyId, { userId, revoked: false });
    return { familyId, refreshToken: this.mint(userId, familyId) };
  }

  rotate(refreshToken: string): RotateResult {
    const record = this.tokens.get(sha256Hex(refreshToken));
    if (!record) return { ok: false, reason: 'invalid' };
    const family = this.families.get(record.familyId);
    if (!family || family.revoked) return { ok: false, reason: 'revoked' };
    if (record.used) {
      // Un refresh token ya rotado se presentó de nuevo: posible robo. Se revoca toda la sesión.
      family.revoked = true;
      return { ok: false, reason: 'reused' };
    }
    if (record.expiresAt <= this.clock()) return { ok: false, reason: 'expired' };
    record.used = true;
    return {
      ok: true,
      userId: record.userId,
      familyId: record.familyId,
      refreshToken: this.mint(record.userId, record.familyId),
    };
  }

  revokeByToken(refreshToken: string): void {
    const record = this.tokens.get(sha256Hex(refreshToken));
    if (record) this.revokeFamily(record.familyId);
  }

  revokeFamily(familyId: string): void {
    const family = this.families.get(familyId);
    if (family) family.revoked = true;
  }

  isFamilyActive(familyId: string): boolean {
    const family = this.families.get(familyId);
    return !!family && !family.revoked;
  }

  private mint(userId: string, familyId: string): string {
    const token = randomToken(32);
    this.tokens.set(sha256Hex(token), {
      userId,
      familyId,
      expiresAt: this.clock() + this.ttlSeconds * 1000,
      used: false,
    });
    return token;
  }
}
