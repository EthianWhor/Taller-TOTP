import { Router } from 'express';
import type { AppContext } from '../context.js';

export function sessionRouter(ctx: AppContext): Router {
  const router = Router();

  /** Renovación silenciosa: rota el refresh_token y emite un nuevo access_token. */
  router.post('/auth/refresh', (req, res) => {
    const refreshToken = (req.body as Record<string, unknown>)?.refresh_token;
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token es obligatorio' });
      return;
    }

    const result = ctx.refreshTokens.rotate(refreshToken);
    if (!result.ok) {
      const descriptions = {
        invalid: 'refresh_token desconocido',
        expired: 'refresh_token vencido',
        revoked: 'La sesión fue revocada',
        reused: 'Reutilización de refresh_token detectada: sesión revocada',
      } as const;
      res.status(401).json({ error: 'invalid_grant', error_description: descriptions[result.reason] });
      return;
    }

    const access = ctx.tokens.signAccessToken({ userId: result.userId, sid: result.familyId, mfaVerified: false });
    res.json({
      token_type: 'Bearer',
      access_token: access.token,
      expires_in: access.expiresIn,
      refresh_token: result.refreshToken,
      refresh_expires_in: ctx.config.refreshTokenTtl,
    });
  });

  /** Cierre de sesión: revoca la familia completa de refresh tokens. */
  router.post('/auth/logout', (req, res) => {
    const refreshToken = (req.body as Record<string, unknown>)?.refresh_token;
    if (typeof refreshToken === 'string') ctx.refreshTokens.revokeByToken(refreshToken);
    res.status(204).end();
  });

  return router;
}
