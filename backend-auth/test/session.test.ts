import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { login, makeTestApp } from './helpers.js';

describe('access_token y /api/me', () => {
  it('permite el acceso con un access_token vigente', async () => {
    const { app } = makeTestApp();
    const tokens = await login(app);
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${tokens.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('estudiante@unisabana.edu.co');
  });

  it('responde 401 cuando el access_token expira (5 min)', async () => {
    const { app, time } = makeTestApp();
    const tokens = await login(app);
    time.advance(5 * 60 * 1000 + 1000);
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${tokens.access_token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_token');
  });

  it('responde 401 sin token', async () => {
    const { app } = makeTestApp();
    expect((await request(app).get('/api/me')).status).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  it('rota el refresh_token y emite un nuevo access_token', async () => {
    const { app, time } = makeTestApp();
    const tokens = await login(app);
    time.advance(6 * 60 * 1000);
    const res = await request(app).post('/auth/refresh').send({ refresh_token: tokens.refresh_token });
    expect(res.status).toBe(200);
    expect(res.body.refresh_token).not.toBe(tokens.refresh_token);
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${res.body.access_token}`);
    expect(me.status).toBe(200);
  });

  it('detecta reutilización de un refresh_token y revoca toda la sesión', async () => {
    const { app } = makeTestApp();
    const tokens = await login(app);
    const rotated = await request(app).post('/auth/refresh').send({ refresh_token: tokens.refresh_token });
    expect(rotated.status).toBe(200);
    const replay = await request(app).post('/auth/refresh').send({ refresh_token: tokens.refresh_token });
    expect(replay.status).toBe(401);
    const next = await request(app).post('/auth/refresh').send({ refresh_token: rotated.body.refresh_token });
    expect(next.status).toBe(401);
  });

  it('rechaza un refresh_token vencido (30 días)', async () => {
    const { app, time } = makeTestApp();
    const tokens = await login(app);
    time.advance(30 * 24 * 60 * 60 * 1000 + 1000);
    const res = await request(app).post('/auth/refresh').send({ refresh_token: tokens.refresh_token });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('logout revoca el refresh_token y los access_token de la sesión', async () => {
    const { app } = makeTestApp();
    const tokens = await login(app);
    expect((await request(app).post('/auth/logout').send({ refresh_token: tokens.refresh_token })).status).toBe(204);
    expect((await request(app).post('/auth/refresh').send({ refresh_token: tokens.refresh_token })).status).toBe(401);
    expect((await request(app).get('/api/me').set('Authorization', `Bearer ${tokens.access_token}`)).status).toBe(401);
  });
});
