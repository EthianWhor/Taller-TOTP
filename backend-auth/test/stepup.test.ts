import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { totp } from '../src/crypto/totp.js';
import { login, makeTestApp, TOTP_SECRET } from './helpers.js';

type App = Parameters<typeof request>[0];

async function requestVault(app: App, token: string) {
  return request(app).get('/api/boveda-critica').set('Authorization', `Bearer ${token}`);
}

async function stepUpToken(app: App, accessToken: string): Promise<string> {
  const res = await requestVault(app, accessToken);
  expect(res.status).toBe(403);
  return res.body.step_up_token as string;
}

function verify(app: App, step_up_token: string, code: string) {
  return request(app).post('/auth/mfa/verify').send({ step_up_token, code });
}

describe('GET /api/boveda-critica', () => {
  it('responde 403 mfa_required con step_up_token para un access_token estándar', async () => {
    const { app } = makeTestApp();
    const { access_token } = await login(app);
    const res = await requestVault(app, access_token);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('mfa_required');
    expect(typeof res.body.step_up_token).toBe('string');
    expect(res.headers['www-authenticate']).toContain('insufficient_user_authentication');
  });

  it('el alias /api/boveda aplica la misma protección', async () => {
    const { app } = makeTestApp();
    const { access_token } = await login(app);
    const res = await request(app).get('/api/boveda').set('Authorization', `Bearer ${access_token}`);
    expect(res.status).toBe(403);
  });

  it('responde 401 sin token', async () => {
    const { app } = makeTestApp();
    expect((await request(app).get('/api/boveda-critica')).status).toBe(401);
  });

  it('un step_up_token no sirve como access_token', async () => {
    const { app } = makeTestApp();
    const { access_token } = await login(app);
    const token = await stepUpToken(app, access_token);
    expect((await requestVault(app, token)).status).toBe(401);
  });
});

describe('POST /auth/mfa/verify', () => {
  it('flujo completo: 403 -> TOTP -> elevated_token -> bóveda abierta', async () => {
    const { app, time, ctx } = makeTestApp();
    const { access_token } = await login(app);
    const token = await stepUpToken(app, access_token);

    const res = await verify(app, token, totp(TOTP_SECRET, time.clock()));
    expect(res.status).toBe(200);
    expect(res.body.mfa_verified).toBe(true);
    expect(res.body.expires_in).toBe(600);
    expect(ctx.tokens.verifyAccessToken(res.body.elevated_token).mfa_verified).toBe(true);

    const vault = await requestVault(app, res.body.elevated_token);
    expect(vault.status).toBe(200);
    expect(vault.body.secrets.length).toBeGreaterThan(0);
  });

  it('Anti-Replay: el mismo código reenviado responde 409 Conflict', async () => {
    const { app, time } = makeTestApp();
    const { access_token } = await login(app);
    const code = totp(TOTP_SECRET, time.clock());

    expect((await verify(app, await stepUpToken(app, access_token), code)).status).toBe(200);

    // Reenvío inmediato con el mismo step_up_token y con uno nuevo.
    const sameToken = await stepUpToken(app, access_token);
    const replay = await verify(app, sameToken, code);
    expect(replay.status).toBe(409);
    expect(replay.body.error).toBe('replay_attack_detected');
    expect(replay.body.error_description).toContain('Replay Attack Detected');
  });

  it('Anti-Replay: el registro dura 90 s', async () => {
    const { app, time, ctx } = makeTestApp();
    const { access_token } = await login(app);
    const code = totp(TOTP_SECRET, time.clock());
    expect((await verify(app, await stepUpToken(app, access_token), code)).status).toBe(200);
    time.advance(89_000);
    expect(ctx.replayCache.has('user-001', code)).toBe(true);
    time.advance(2_000);
    expect(ctx.replayCache.has('user-001', code)).toBe(false);
  });

  it('tolera desfase de reloj: acepta C-1 y C+1', async () => {
    const { app, time } = makeTestApp();
    const { access_token } = await login(app);
    const prev = totp(TOTP_SECRET, time.clock() - 30_000);
    const next = totp(TOTP_SECRET, time.clock() + 30_000);
    expect((await verify(app, await stepUpToken(app, access_token), prev)).status).toBe(200);
    expect((await verify(app, await stepUpToken(app, access_token), next)).status).toBe(200);
  });

  it('rechaza códigos fuera de la ventana (C-3)', async () => {
    const { app, time } = makeTestApp();
    const { access_token } = await login(app);
    const old = totp(TOTP_SECRET, time.clock() - 90_000);
    const res = await verify(app, await stepUpToken(app, access_token), old);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_code');
  });

  it('limita a 5 intentos fallidos por step_up_token', async () => {
    const { app, time } = makeTestApp();
    const { access_token } = await login(app);
    const token = await stepUpToken(app, access_token);
    const good = totp(TOTP_SECRET, time.clock());
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await verify(app, token, bad)).status).toBe(401);
    expect((await verify(app, token, good)).status).toBe(429);
  });

  it('el step_up_token es de un solo uso', async () => {
    const { app, time } = makeTestApp();
    const { access_token } = await login(app);
    const token = await stepUpToken(app, access_token);
    expect((await verify(app, token, totp(TOTP_SECRET, time.clock()))).status).toBe(200);
    time.advance(30_000);
    const res = await verify(app, token, totp(TOTP_SECRET, time.clock()));
    expect(res.status).toBe(401);
  });

  it('rechaza un step_up_token expirado', async () => {
    const { app, time } = makeTestApp();
    const { access_token } = await login(app);
    const token = await stepUpToken(app, access_token);
    time.advance(5 * 60 * 1000 + 1000);
    const res = await verify(app, token, totp(TOTP_SECRET, time.clock()));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_token');
  });

  it('valida el formato de la petición', async () => {
    const { app } = makeTestApp();
    expect((await verify(app, 'x', '12345')).status).toBe(400);
    expect((await request(app).post('/auth/mfa/verify').send({})).status).toBe(400);
  });

  it('el elevated_token expira a los 10 minutos', async () => {
    const { app, time } = makeTestApp();
    const { access_token } = await login(app);
    const res = await verify(app, await stepUpToken(app, access_token), totp(TOTP_SECRET, time.clock()));
    time.advance(10 * 60 * 1000 + 1000);
    expect((await requestVault(app, res.body.elevated_token)).status).toBe(401);
  });
});

describe('GET /enroll', () => {
  it('muestra el QR otpauth cuando está habilitado', async () => {
    const { app } = makeTestApp({ enableEnrollPage: true });
    const res = await request(app).get('/enroll');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<svg');
    expect(res.text).toContain('JBSWY3DPEHPK3PXP');
  });

  it('no existe cuando está deshabilitado', async () => {
    const { app } = makeTestApp({ enableEnrollPage: false });
    expect((await request(app).get('/enroll')).status).toBe(404);
  });
});
