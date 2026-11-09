import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';

export const CLIENT_ID = 'unisabana-mobile';
export const REDIRECT_URI = 'unisabana-auth://callback';
export const EMAIL = 'estudiante@unisabana.edu.co';
export const PASSWORD = 'Sabana2026*';
export const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

export function makeClock(start = Date.UTC(2026, 10, 9, 12, 0, 0)) {
  let now = start;
  const clock = () => now;
  return {
    clock,
    advance: (ms: number) => {
      now += ms;
    },
    set: (ms: number) => {
      now = ms;
    },
  };
}

export function makeTestApp(overrides: Partial<AppConfig> = {}) {
  const time = makeClock();
  const config = loadConfig({
    jwtSecret: 'test-secret-test-secret-test-secret-123',
    allowedRedirectUris: [REDIRECT_URI],
    allowExpoDevRedirects: false,
    demoUser: { email: EMAIL, password: PASSWORD, name: 'Estudiante', totpSecret: TOTP_SECRET },
    ...overrides,
  });
  const app = createApp({ config, clock: time.clock });
  return { app, config, time, ctx: app.locals.ctx };
}

export function pkcePair() {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function authorizeQuery(challenge: string, state = randomBytes(16).toString('base64url')) {
  return {
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  };
}

/** Recorre /oauth/authorize + login y devuelve el code y el state del deep link. */
export async function obtainCode(app: Parameters<typeof request>[0], challenge: string) {
  const query = authorizeQuery(challenge);
  const page = await request(app).get('/oauth/authorize').query(query);
  const requestId = /name="request_id" value="([^"]+)"/.exec(page.text)?.[1];
  if (!requestId) throw new Error(`No se obtuvo request_id: ${page.status} ${page.text}`);
  const login = await request(app)
    .post('/oauth/authorize')
    .type('form')
    .send({ request_id: requestId, email: EMAIL, password: PASSWORD, action: 'login' });
  const location = new URL(login.headers.location as string);
  return {
    code: location.searchParams.get('code')!,
    state: location.searchParams.get('state')!,
    sentState: query.state,
    location,
  };
}

/** Login completo: devuelve access_token y refresh_token. */
export async function login(app: Parameters<typeof request>[0]) {
  const { verifier, challenge } = pkcePair();
  const { code } = await obtainCode(app, challenge);
  const res = await request(app).post('/auth/oauth/token').send({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
  });
  if (res.status !== 200) throw new Error(`Token exchange falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { access_token: string; refresh_token: string; expires_in: number };
}
