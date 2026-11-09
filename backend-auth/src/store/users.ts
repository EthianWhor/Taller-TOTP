import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export interface User {
  id: string;
  email: string;
  name: string;
  /** Semilla TOTP en Base32. En producción debería ir cifrada en reposo. */
  totpSecret: string;
  passwordHash: string;
}

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

// Hash fijo para igualar el tiempo de respuesta cuando el usuario no existe
// (evita enumeración de cuentas por canal lateral de tiempo).
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

export class UserStore {
  private readonly byId = new Map<string, User>();
  private readonly byEmail = new Map<string, User>();

  add(input: { id: string; email: string; name: string; password: string; totpSecret: string }): User {
    const user: User = {
      id: input.id,
      email: input.email.toLowerCase(),
      name: input.name,
      totpSecret: input.totpSecret,
      passwordHash: hashPassword(input.password),
    };
    this.byId.set(user.id, user);
    this.byEmail.set(user.email, user);
    return user;
  }

  findById(id: string): User | undefined {
    return this.byId.get(id);
  }

  findByEmail(email: string): User | undefined {
    return this.byEmail.get(email.trim().toLowerCase());
  }

  authenticate(email: string, password: string): User | undefined {
    const user = this.findByEmail(email);
    const ok = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    return ok && user ? user : undefined;
  }
}
