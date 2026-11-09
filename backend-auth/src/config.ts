import { randomBytes } from 'node:crypto';

export interface AppConfig {
  port: number;
  host: string;
  publicBaseUrl: string;
  jwtSecret: string;
  oauthClientId: string;
  allowedRedirectUris: string[];
  allowExpoDevRedirects: boolean;
  accessTokenTtl: number;
  refreshTokenTtl: number;
  elevatedTokenTtl: number;
  stepUpTokenTtl: number;
  authCodeTtl: number;
  /** TTL de la caché Anti-Replay (segundos). Cubre las 3 ventanas C-1, C, C+1. */
  replayTtl: number;
  /** Intentos fallidos máximos por step_up_token. */
  maxMfaAttempts: number;
  demoUser: {
    email: string;
    password: string;
    name: string;
    totpSecret: string;
  };
  totpIssuer: string;
  enableEnrollPage: boolean;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`La variable ${name} debe ser un entero positivo (recibido: "${raw}")`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const port = int('PORT', 4000);
  let jwtSecret = process.env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
    }
    // En desarrollo se genera un secreto efímero: los tokens se invalidan al reiniciar.
    jwtSecret = randomBytes(48).toString('base64url');
  }

  const base: AppConfig = {
    port,
    host: str('HOST', '0.0.0.0'),
    publicBaseUrl: str('PUBLIC_BASE_URL', `http://localhost:${port}`),
    jwtSecret,
    oauthClientId: str('OAUTH_CLIENT_ID', 'unisabana-mobile'),
    allowedRedirectUris: str('ALLOWED_REDIRECT_URIS', 'unisabana-auth://callback')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    allowExpoDevRedirects: bool('ALLOW_EXPO_DEV_REDIRECTS', process.env.NODE_ENV !== 'production'),
    accessTokenTtl: int('ACCESS_TOKEN_TTL_SECONDS', 5 * 60),
    refreshTokenTtl: int('REFRESH_TOKEN_TTL_SECONDS', 30 * 24 * 60 * 60),
    elevatedTokenTtl: int('ELEVATED_TOKEN_TTL_SECONDS', 10 * 60),
    stepUpTokenTtl: int('STEP_UP_TOKEN_TTL_SECONDS', 5 * 60),
    authCodeTtl: int('AUTH_CODE_TTL_SECONDS', 60),
    replayTtl: 90,
    maxMfaAttempts: 5,
    demoUser: {
      email: str('DEMO_USER_EMAIL', 'estudiante@unisabana.edu.co'),
      password: str('DEMO_USER_PASSWORD', 'Sabana2026*'),
      name: str('DEMO_USER_NAME', 'Estudiante UniSabana'),
      totpSecret: str('DEMO_TOTP_SECRET', 'JBSWY3DPEHPK3PXP'),
    },
    totpIssuer: str('TOTP_ISSUER', 'UniSabana'),
    enableEnrollPage: bool('ENABLE_ENROLL_PAGE', process.env.NODE_ENV !== 'production'),
  };

  return { ...base, ...overrides };
}
