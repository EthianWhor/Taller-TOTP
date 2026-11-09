import type { NextFunction, Request, Response } from 'express';
import type { AppContext } from '../context.js';
import { TokenError, type AccessClaims } from '../tokens/tokenService.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AccessClaims;
  }
}

/**
 * Exige un Bearer access_token válido. Responde 401 si falta, es inválido o expiró;
 * el cliente móvil interpreta ese 401 como señal para el "silent refresh".
 */
export function requireAuth(ctx: AppContext) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'invalid_token', error_description: 'Falta el access_token' });
      return;
    }
    try {
      const claims = ctx.tokens.verifyAccessToken(match[1]!);
      if (!ctx.refreshTokens.isFamilyActive(claims.sid)) {
        throw new TokenError('Sesión revocada', 'invalid');
      }
      req.auth = claims;
      next();
    } catch (err) {
      const description = err instanceof TokenError ? err.message : 'Token inválido';
      res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", error_description="${description}"`);
      res.status(401).json({ error: 'invalid_token', error_description: description });
    }
  };
}
