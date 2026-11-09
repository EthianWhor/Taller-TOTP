import { validateBase32Secret } from './base32';

export interface OtpAuthAccount {
  issuer: string;
  account: string;
  secret: string;
  digits: number;
  period: number;
  algorithm: 'SHA1';
}

export class OtpAuthParseError extends Error {}

/**
 * Interpreta un URI de Key URI Format (el mismo que lee Google Authenticator):
 *   otpauth://totp/UniSabana:estudiante@unisabana.edu.co?secret=JBSWY3DPEHPK3PXP&issuer=UniSabana
 * Se parsea a mano para no depender de la implementación de URL de cada motor JS.
 */
export function parseOtpAuthUri(uri: string): OtpAuthAccount {
  const match = /^otpauth:\/\/([^/?#]+)\/([^?#]*)(?:\?([^#]*))?/i.exec(uri.trim());
  if (!match) throw new OtpAuthParseError('El QR no contiene un URI otpauth:// válido');

  const type = match[1]!.toLowerCase();
  if (type !== 'totp') throw new OtpAuthParseError(`Tipo "${type}" no soportado: solo TOTP`);

  const label = safeDecode(match[2] ?? '');
  const params = parseQuery(match[3] ?? '');

  const secretCheck = validateBase32Secret(params.get('secret') ?? '');
  if (!secretCheck.ok) throw new OtpAuthParseError(`Semilla inválida: ${secretCheck.error}`);

  const algorithm = (params.get('algorithm') ?? 'SHA1').toUpperCase();
  if (algorithm !== 'SHA1') throw new OtpAuthParseError('Solo se soporta el algoritmo SHA1');

  const digits = Number(params.get('digits') ?? 6);
  if (digits !== 6) throw new OtpAuthParseError('Solo se soportan códigos de 6 dígitos');

  const period = Number(params.get('period') ?? 30);
  if (period !== 30) throw new OtpAuthParseError('Solo se soporta un periodo de 30 segundos');

  const separator = label.indexOf(':');
  const labelIssuer = separator >= 0 ? label.slice(0, separator).trim() : '';
  const account = (separator >= 0 ? label.slice(separator + 1) : label).trim();
  const issuer = params.get('issuer')?.trim() || labelIssuer || 'Sin emisor';

  return { issuer, account: account || 'cuenta', secret: secretCheck.normalized, digits, period, algorithm: 'SHA1' };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    throw new OtpAuthParseError('El URI tiene caracteres mal codificados');
  }
}

function parseQuery(query: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = safeDecode(eq >= 0 ? pair.slice(0, eq) : pair).toLowerCase();
    const value = eq >= 0 ? safeDecode(pair.slice(eq + 1)) : '';
    if (!params.has(key)) params.set(key, value);
  }
  return params;
}
