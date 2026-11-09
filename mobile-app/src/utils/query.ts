/**
 * Construcción y lectura de query strings sin depender del polyfill de URL de
 * React Native (históricamente incompleto en URLSearchParams).
 */
export function buildQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export function parseQuery(url: string): Record<string, string> {
  const start = url.indexOf('?');
  if (start === -1) return {};
  const end = url.indexOf('#', start);
  const query = url.slice(start + 1, end === -1 ? undefined : end);
  const out: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawValue = eq >= 0 ? pair.slice(eq + 1) : '';
    try {
      const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      if (!(key in out)) out[key] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      // Parámetro mal codificado: se ignora.
    }
  }
  return out;
}

/** URL sin query ni fragmento (para comparar el redirect_uri recibido). */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}
