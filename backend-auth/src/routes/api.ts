import { Router } from 'express';
import type { AppContext } from '../context.js';
import { requireAuth } from '../middleware/requireAuth.js';

export function apiRouter(ctx: AppContext): Router {
  const router = Router();
  const auth = requireAuth(ctx);

  /** Recurso protegido estándar: basta con un access_token válido. */
  router.get('/api/me', auth, (req, res) => {
    const user = ctx.users.findById(req.auth!.sub);
    if (!user) {
      res.status(404).json({ error: 'user_not_found' });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      session: { mfa_verified: req.auth!.mfa_verified, expires_at: req.auth!.exp },
    });
  });

  return router;
}
