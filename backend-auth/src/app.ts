import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from './config.js';
import { systemClock, type Clock } from './clock.js';
import { createContext, type AppContext } from './context.js';
import { apiRouter } from './routes/api.js';
import { mfaRouter } from './routes/mfa.js';
import { oauthRouter } from './routes/oauth.js';
import { sessionRouter } from './routes/session.js';
import { vaultRouter } from './routes/vault.js';

export interface AppDeps {
  config: AppConfig;
  clock?: Clock;
}

export function createApp({ config, clock = systemClock }: AppDeps): Express & { locals: { ctx: AppContext } } {
  const ctx = createContext(config, clock);
  const app = express();
  app.locals.ctx = ctx;
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(express.json({ limit: '16kb' }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));

  // Ninguna respuesta de este servidor debe quedar en cachés intermedias.
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date(clock()).toISOString() });
  });

  app.use(oauthRouter(ctx));
  app.use(sessionRouter(ctx));
  app.use(apiRouter(ctx));
  app.use(mfaRouter(ctx));
  app.use(vaultRouter(ctx));

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[backend-auth] error no controlado:', err);
    res.status(500).json({ error: 'server_error' });
  });

  return app as Express & { locals: { ctx: AppContext } };
}
