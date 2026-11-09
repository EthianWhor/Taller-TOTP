import { Router, type Response } from 'express';
import type { AppContext } from '../context.js';
import { isValidCodeChallenge, verifyPkce } from '../crypto/pkce.js';
import { isAllowedRedirectUri, isRegisteredClient } from '../oauth/clients.js';
import { renderErrorPage, renderLoginPage } from '../views/loginPage.js';

const MAX_LOGIN_ATTEMPTS = 5;

function redirectWithParams(res: Response, redirectUri: string, params: Record<string, string>): void {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  res.redirect(302, url.toString());
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function oauthRouter(ctx: AppContext): Router {
  const router = Router();

  /**
   * Endpoint de autorización. Se abre en el navegador del sistema
   * (ASWebAuthenticationSession / Custom Tabs), nunca en una WebView embebida.
   */
  router.get('/oauth/authorize', (req, res) => {
    const q = req.query;
    const clientId = q.client_id;
    const redirectUri = q.redirect_uri;

    // Si el cliente o el redirect_uri no son válidos NO se redirige (RFC 6749 §4.1.2.1):
    // se muestra el error en el navegador para no convertirnos en un open redirect.
    if (!isRegisteredClient(ctx.config, clientId)) {
      res.status(400).type('html').send(renderErrorPage('Cliente desconocido', 'El parámetro client_id no es válido.'));
      return;
    }
    if (!isAllowedRedirectUri(ctx.config, redirectUri)) {
      res.status(400).type('html').send(renderErrorPage('Redirección no permitida', 'El redirect_uri no está registrado.'));
      return;
    }

    const state = str(q.state);
    const fail = (error: string, description: string) =>
      redirectWithParams(res, redirectUri, {
        error,
        error_description: description,
        ...(state ? { state } : {}),
      });

    if (q.response_type !== 'code') return fail('unsupported_response_type', 'Solo se admite response_type=code');
    if (!state || state.length < 16 || state.length > 256) return fail('invalid_request', 'state es obligatorio (anti-CSRF)');
    if (q.code_challenge_method !== 'S256') return fail('invalid_request', 'code_challenge_method debe ser S256');
    const codeChallenge = str(q.code_challenge);
    if (!codeChallenge || !isValidCodeChallenge(codeChallenge)) {
      return fail('invalid_request', 'code_challenge ausente o mal formado');
    }

    const pending = ctx.authorizations.createPending({ clientId, redirectUri, codeChallenge, state });
    res
      .status(200)
      .setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
      .setHeader('X-Frame-Options', 'DENY')
      .type('html')
      .send(renderLoginPage({ requestId: pending.id }));
  });

  /** Envío del formulario de login del navegador. Emite el authorization_code. */
  router.post('/oauth/authorize', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const requestId = str(body.request_id);
    const pending = requestId ? ctx.authorizations.getPending(requestId) : undefined;
    if (!pending) {
      res.status(400).type('html').send(renderErrorPage('Solicitud expirada', 'Vuelve a la app e inicia sesión de nuevo.'));
      return;
    }

    if (body.action === 'deny') {
      ctx.authorizations.deletePending(pending.id);
      return redirectWithParams(res, pending.redirectUri, {
        error: 'access_denied',
        error_description: 'El usuario canceló el inicio de sesión',
        state: pending.state,
      });
    }

    const email = str(body.email) ?? '';
    const user = ctx.users.authenticate(email, str(body.password) ?? '');
    if (!user) {
      pending.failedLogins += 1;
      if (pending.failedLogins >= MAX_LOGIN_ATTEMPTS) {
        ctx.authorizations.deletePending(pending.id);
        return redirectWithParams(res, pending.redirectUri, {
          error: 'access_denied',
          error_description: 'Demasiados intentos fallidos',
          state: pending.state,
        });
      }
      res
        .status(401)
        .setHeader('X-Frame-Options', 'DENY')
        .type('html')
        .send(renderLoginPage({ requestId: pending.id, email, error: 'Correo o contraseña incorrectos.' }));
      return;
    }

    ctx.authorizations.deletePending(pending.id);
    const code = ctx.authorizations.issueCode(pending, user.id);
    redirectWithParams(res, pending.redirectUri, { code: code.code, state: pending.state });
  });

  /** Canje del authorization_code + code_verifier por los tokens de sesión. */
  router.post('/auth/oauth/token', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const invalidGrant = (description: string) =>
      res.status(400).json({ error: 'invalid_grant', error_description: description });

    if (body.grant_type !== 'authorization_code') {
      res.status(400).json({ error: 'unsupported_grant_type' });
      return;
    }
    const codeValue = str(body.code);
    const verifier = str(body.code_verifier);
    const redirectUri = str(body.redirect_uri);
    const clientId = str(body.client_id);
    if (!codeValue || !verifier || !redirectUri || !clientId) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Se requieren code, code_verifier, redirect_uri y client_id',
      });
      return;
    }
    if (!isRegisteredClient(ctx.config, clientId)) {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }

    const code = ctx.authorizations.getCode(codeValue);
    if (!code) return invalidGrant('Código de autorización inválido');
    if (code.used) {
      // Reutilización de un código: se revoca la sesión emitida con él (RFC 6749 §4.1.2).
      if (code.issuedFamilyId) ctx.refreshTokens.revokeFamily(code.issuedFamilyId);
      return invalidGrant('El código de autorización ya fue utilizado');
    }
    // Se marca como usado antes de cualquier otra validación: un solo intento por código.
    code.used = true;
    if (ctx.authorizations.isExpired(code)) return invalidGrant('El código de autorización expiró');
    if (code.clientId !== clientId || code.redirectUri !== redirectUri) {
      return invalidGrant('client_id o redirect_uri no coinciden con la solicitud original');
    }
    if (!verifyPkce(verifier, code.codeChallenge)) {
      return invalidGrant('PKCE inválido: SHA256(code_verifier) no coincide con code_challenge');
    }

    const { familyId, refreshToken } = ctx.refreshTokens.createFamily(code.userId);
    code.issuedFamilyId = familyId;
    const access = ctx.tokens.signAccessToken({ userId: code.userId, sid: familyId, mfaVerified: false });

    res.json({
      token_type: 'Bearer',
      access_token: access.token,
      expires_in: access.expiresIn,
      refresh_token: refreshToken,
      refresh_expires_in: ctx.config.refreshTokenTtl,
    });
  });

  return router;
}
