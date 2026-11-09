import jwt from 'jsonwebtoken';
import type { Clock } from '../clock.js';
import type { AppConfig } from '../config.js';
import { randomToken } from '../crypto/pkce.js';

const ISSUER = 'unisabana-backend-auth';
const AUDIENCE = 'unisabana-mobile-api';

export interface AccessClaims {
  sub: string;
  sid: string;
  jti: string;
  token_use: 'access';
  mfa_verified: boolean;
  amr: string[];
  iat: number;
  exp: number;
}

export interface StepUpClaims {
  sub: string;
  sid: string;
  jti: string;
  token_use: 'step_up';
  resource: string;
  iat: number;
  exp: number;
}

export class TokenError extends Error {
  constructor(
    message: string,
    readonly code: 'expired' | 'invalid',
  ) {
    super(message);
  }
}

export class TokenService {
  constructor(
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  private now(): number {
    return Math.floor(this.clock() / 1000);
  }

  private sign(payload: Record<string, unknown>, ttlSeconds: number): string {
    return jwt.sign({ ...payload, iat: this.now(), jti: randomToken(12) }, this.config.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: ttlSeconds,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  }

  private verify(token: string): Record<string, unknown> {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
        clockTimestamp: this.now(),
      });
      if (typeof decoded === 'string') throw new TokenError('Formato de token inválido', 'invalid');
      return decoded as Record<string, unknown>;
    } catch (err) {
      if (err instanceof TokenError) throw err;
      if (err instanceof jwt.TokenExpiredError) throw new TokenError('Token expirado', 'expired');
      throw new TokenError('Token inválido', 'invalid');
    }
  }

  /** access_token estándar (5 min) o elevated_token (10 min, mfa_verified: true). */
  signAccessToken(input: { userId: string; sid: string; mfaVerified: boolean }): {
    token: string;
    expiresIn: number;
  } {
    const expiresIn = input.mfaVerified ? this.config.elevatedTokenTtl : this.config.accessTokenTtl;
    const token = this.sign(
      {
        sub: input.userId,
        sid: input.sid,
        token_use: 'access',
        mfa_verified: input.mfaVerified,
        amr: input.mfaVerified ? ['pwd', 'otp'] : ['pwd'],
      },
      expiresIn,
    );
    return { token, expiresIn };
  }

  verifyAccessToken(token: string): AccessClaims {
    const claims = this.verify(token);
    if (claims.token_use !== 'access' || typeof claims.sub !== 'string' || typeof claims.sid !== 'string') {
      throw new TokenError('No es un access token', 'invalid');
    }
    return claims as unknown as AccessClaims;
  }

  signStepUpToken(input: { userId: string; sid: string; resource: string }): { token: string; expiresIn: number } {
    const expiresIn = this.config.stepUpTokenTtl;
    const token = this.sign(
      { sub: input.userId, sid: input.sid, token_use: 'step_up', resource: input.resource },
      expiresIn,
    );
    return { token, expiresIn };
  }

  verifyStepUpToken(token: string): StepUpClaims {
    const claims = this.verify(token);
    if (claims.token_use !== 'step_up' || typeof claims.sub !== 'string' || typeof claims.jti !== 'string') {
      throw new TokenError('No es un step_up_token', 'invalid');
    }
    return claims as unknown as StepUpClaims;
  }
}
