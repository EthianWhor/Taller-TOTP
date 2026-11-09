import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authorizeQuery, CLIENT_ID, EMAIL, makeTestApp, obtainCode, pkcePair, REDIRECT_URI } from './helpers.js';

describe('GET /oauth/authorize', () => {
  it('muestra la página de login para una solicitud válida', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/oauth/authorize').query(authorizeQuery(pkcePair().challenge));
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="request_id"');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('no redirige a un redirect_uri no registrado (evita open redirect)', async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .get('/oauth/authorize')
      .query({ ...authorizeQuery(pkcePair().challenge), redirect_uri: 'https://evil.example/cb' });
    expect(res.status).toBe(400);
    expect(res.headers.location).toBeUndefined();
  });

  it('rechaza un client_id desconocido', async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .get('/oauth/authorize')
      .query({ ...authorizeQuery(pkcePair().challenge), client_id: 'otro' });
    expect(res.status).toBe(400);
  });

  it('exige PKCE S256 (rechaza plain)', async () => {
    const { app } = makeTestApp();
    const query = { ...authorizeQuery(pkcePair().challenge), code_challenge_method: 'plain' };
    const res = await request(app).get('/oauth/authorize').query(query);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get('error')).toBe('invalid_request');
    expect(location.searchParams.get('state')).toBe(query.state);
  });

  it('exige el parámetro state', async () => {
    const { app } = makeTestApp();
    const { state: _state, ...query } = authorizeQuery(pkcePair().challenge);
    const res = await request(app).get('/oauth/authorize').query(query);
    expect(new URL(res.headers.location as string).searchParams.get('error')).toBe('invalid_request');
  });

  it('permite redirect URIs de Expo Go solo si está habilitado', async () => {
    const expoUri = 'exp://192.168.1.10:8081/--/callback';
    const challenge = pkcePair().challenge;
    const off = makeTestApp();
    const on = makeTestApp({ allowExpoDevRedirects: true });
    const q = { ...authorizeQuery(challenge), redirect_uri: expoUri };
    expect((await request(off.app).get('/oauth/authorize').query(q)).status).toBe(400);
    expect((await request(on.app).get('/oauth/authorize').query(q)).status).toBe(200);
  });
});

describe('POST /oauth/authorize (login en el navegador)', () => {
  it('redirige al deep link con code y el mismo state', async () => {
    const { app } = makeTestApp();
    const { code, state, sentState, location } = await obtainCode(app, pkcePair().challenge);
    expect(`${location.protocol}//${location.host}${location.pathname}`).toBe(REDIRECT_URI);
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(state).toBe(sentState);
  });

  it('rechaza credenciales inválidas sin redirigir', async () => {
    const { app } = makeTestApp();
    const page = await request(app).get('/oauth/authorize').query(authorizeQuery(pkcePair().challenge));
    const requestId = /name="request_id" value="([^"]+)"/.exec(page.text)![1];
    const res = await request(app)
      .post('/oauth/authorize')
      .type('form')
      .send({ request_id: requestId, email: EMAIL, password: 'incorrecta', action: 'login' });
    expect(res.status).toBe(401);
    expect(res.headers.location).toBeUndefined();
    expect(res.text).toContain('incorrectos');
  });

  it('devuelve access_denied si el usuario cancela', async () => {
    const { app } = makeTestApp();
    const page = await request(app).get('/oauth/authorize').query(authorizeQuery(pkcePair().challenge));
    const requestId = /name="request_id" value="([^"]+)"/.exec(page.text)![1];
    const res = await request(app).post('/oauth/authorize').type('form').send({ request_id: requestId, action: 'deny' });
    expect(new URL(res.headers.location as string).searchParams.get('error')).toBe('access_denied');
  });
});

describe('POST /auth/oauth/token', () => {
  async function exchange(app: Parameters<typeof request>[0], code: string, verifier: string, extra = {}) {
    return request(app)
      .post('/auth/oauth/token')
      .send({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, ...extra });
  }

  it('entrega access_token y refresh_token cuando SHA256(verifier) == challenge', async () => {
    const { app, ctx } = makeTestApp();
    const { verifier, challenge } = pkcePair();
    const { code } = await obtainCode(app, challenge);
    const res = await exchange(app, code, verifier);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 300, refresh_expires_in: 2592000 });
    const claims = ctx.tokens.verifyAccessToken(res.body.access_token);
    expect(claims.mfa_verified).toBe(false);
    expect(res.body).not.toHaveProperty('client_secret');
  });

  it('rechaza un code_verifier incorrecto', async () => {
    const { app } = makeTestApp();
    const { challenge } = pkcePair();
    const { code } = await obtainCode(app, challenge);
    const res = await exchange(app, code, pkcePair().verifier);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('el código es de un solo uso y su reutilización revoca la sesión', async () => {
    const { app } = makeTestApp();
    const { verifier, challenge } = pkcePair();
    const { code } = await obtainCode(app, challenge);
    const first = await exchange(app, code, verifier);
    expect(first.status).toBe(200);
    const second = await exchange(app, code, verifier);
    expect(second.status).toBe(400);
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${first.body.access_token}`);
    expect(me.status).toBe(401);
  });

  it('rechaza un código expirado (60 s)', async () => {
    const { app, time } = makeTestApp();
    const { verifier, challenge } = pkcePair();
    const { code } = await obtainCode(app, challenge);
    time.advance(61_000);
    expect((await exchange(app, code, verifier)).status).toBe(400);
  });

  it('rechaza un redirect_uri distinto al de la autorización', async () => {
    const { app } = makeTestApp();
    const { verifier, challenge } = pkcePair();
    const { code } = await obtainCode(app, challenge);
    expect((await exchange(app, code, verifier, { redirect_uri: 'unisabana-auth://otro' })).status).toBe(400);
  });

  it('rechaza grant_type no soportado', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/auth/oauth/token').send({ grant_type: 'password' });
    expect(res.body.error).toBe('unsupported_grant_type');
  });
});
