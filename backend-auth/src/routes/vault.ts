import { Router, type Request, type Response } from 'express';
import type { AppContext } from '../context.js';
import { requireAuth } from '../middleware/requireAuth.js';

const RESOURCE = 'boveda-critica';

export function vaultRouter(ctx: AppContext): Router {
  const router = Router();

  const handler = (req: Request, res: Response) => {
    const auth = req.auth!;
    if (!auth.mfa_verified) {
      // Step-Up (RFC 9470): el token es válido pero no tiene el nivel de autenticación requerido.
      const stepUp = ctx.tokens.signStepUpToken({ userId: auth.sub, sid: auth.sid, resource: RESOURCE });
      res.setHeader(
        'WWW-Authenticate',
        'Bearer error="insufficient_user_authentication", error_description="Se requiere segundo factor (TOTP)"',
      );
      res.status(403).json({
        error: 'mfa_required',
        error_description: 'Este recurso requiere verificación con segundo factor (TOTP)',
        step_up_token: stepUp.token,
        step_up_expires_in: stepUp.expiresIn,
        verify_endpoint: '/auth/mfa/verify',
      });
      return;
    }

    const user = ctx.users.findById(auth.sub)!;
    res.json({
      resource: RESOURCE,
      owner: user.name,
      accessed_at: new Date(ctx.clock()).toISOString(),
      elevated_until: new Date(auth.exp * 1000).toISOString(),
      secrets: [
        { label: 'Cuenta de nómina', value: 'Bancolombia •••• 4821' },
        { label: 'Notas definitivas', value: 'Desarrollo Móvil: 4.8' },
        { label: 'Llave API de laboratorio', value: 'sk_lab_7f3c9a1e52d84b06' },
      ],
    });
  };

  router.get('/api/boveda-critica', requireAuth(ctx), handler);
  // Alias usado en el diagrama de arquitectura de la guía.
  router.get('/api/boveda', requireAuth(ctx), handler);

  return router;
}
