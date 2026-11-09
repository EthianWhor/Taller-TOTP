import { Router } from 'express';
import QRCode from 'qrcode';
import type { AppContext } from '../context.js';
import { buildOtpAuthUri, verifyTotp } from '../crypto/totp.js';
import { TokenError } from '../tokens/tokenService.js';
import { escapeHtml, layout } from '../views/html.js';

const CODE_RE = /^\d{6}$/;

export function mfaRouter(ctx: AppContext): Router {
  const router = Router();

  /**
   * Verificación del segundo factor (Step-Up).
   * Orden de validaciones:
   *  1. step_up_token firmado y vigente, ligado a una sesión activa.
   *  2. Caché Anti-Replay: un código ya aceptado -> 409 Conflict.
   *  3. Límite de intentos y uso único del step_up_token.
   *  4. TOTP en ventanas C-1, C, C+1 (tolerancia de desfase de reloj).
   *  5. Emisión del elevated_token (mfa_verified: true, 10 min).
   */
  router.post('/auth/mfa/verify', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const stepUpToken = body.step_up_token;
    const code = typeof body.code === 'string' ? body.code.trim() : body.code;

    if (typeof stepUpToken !== 'string' || typeof code !== 'string' || !CODE_RE.test(code)) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Se requieren step_up_token y un código numérico de 6 dígitos',
      });
      return;
    }

    let claims;
    try {
      claims = ctx.tokens.verifyStepUpToken(stepUpToken);
    } catch (err) {
      const expired = err instanceof TokenError && err.code === 'expired';
      res.status(401).json({
        error: 'invalid_token',
        error_description: expired ? 'El step_up_token expiró; solicita el recurso de nuevo' : 'step_up_token inválido',
      });
      return;
    }

    const user = ctx.users.findById(claims.sub);
    if (!user || !ctx.refreshTokens.isFamilyActive(claims.sid)) {
      res.status(401).json({ error: 'invalid_token', error_description: 'La sesión ya no está activa' });
      return;
    }

    if (ctx.replayCache.has(user.id, code)) {
      res.status(409).json({
        error: 'replay_attack_detected',
        error_description: 'Replay Attack Detected: este código TOTP ya fue utilizado',
      });
      return;
    }

    const state = ctx.stepUps.get(claims.jti, claims.exp);
    if (state.consumed) {
      res.status(401).json({ error: 'invalid_token', error_description: 'El step_up_token ya fue utilizado' });
      return;
    }
    if (state.attempts >= ctx.config.maxMfaAttempts) {
      res.status(429).json({
        error: 'too_many_attempts',
        error_description: 'Demasiados intentos fallidos; solicita el recurso de nuevo',
      });
      return;
    }

    const result = verifyTotp(user.totpSecret, code, ctx.clock());
    if (!result.valid) {
      state.attempts += 1;
      res.status(401).json({
        error: 'invalid_code',
        error_description: 'Código TOTP incorrecto o fuera de la ventana de tiempo',
        attempts_remaining: Math.max(0, ctx.config.maxMfaAttempts - state.attempts),
      });
      return;
    }

    ctx.replayCache.remember(user.id, code);
    state.consumed = true;

    const elevated = ctx.tokens.signAccessToken({ userId: user.id, sid: claims.sid, mfaVerified: true });
    res.json({
      token_type: 'Bearer',
      elevated_token: elevated.token,
      expires_in: elevated.expiresIn,
      mfa_verified: true,
      window_delta: result.delta,
    });
  });

  /**
   * Página de enrolamiento SOLO para el laboratorio: muestra el QR otpauth:// del usuario
   * demo para escanearlo a la vez con Google Authenticator y con la app móvil.
   */
  if (ctx.config.enableEnrollPage) {
    router.get('/enroll', async (_req, res, next) => {
      try {
        const user = ctx.users.findByEmail(ctx.config.demoUser.email)!;
        const uri = buildOtpAuthUri({ issuer: ctx.config.totpIssuer, account: user.email, secretBase32: user.totpSecret });
        const svg = await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
        res
          .type('html')
          .setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:")
          .send(
            layout(
              'Enrolamiento TOTP — UniSabana',
              `<div class="brand">Universidad de La Sabana</div>
<h1>Enrolar autenticador</h1>
<p class="muted">Escanea este QR con <b>Google Authenticator</b> y con la <b>app del laboratorio</b>: ambas deben mostrar los mismos 6 dígitos.</p>
<div class="qr">${svg}</div>
<p><b>Cuenta:</b> ${escapeHtml(user.email)}</p>
<p><b>Semilla Base32:</b> <code>${escapeHtml(user.totpSecret)}</code></p>
<p><b>URI:</b> <code>${escapeHtml(uri)}</code></p>
<p class="hint">Página habilitada solo para el laboratorio (ENABLE_ENROLL_PAGE).</p>`,
            ),
          );
      } catch (err) {
        next(err);
      }
    });
  }

  return router;
}
