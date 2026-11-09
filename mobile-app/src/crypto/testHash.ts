import type { HashFunction } from './hmac';

/** SHA-1/SHA-256 vía WebCrypto (disponible en Node ≥ 20) para las pruebas unitarias. */
export const webSha1: HashFunction = async (data) =>
  new Uint8Array(await globalThis.crypto.subtle.digest('SHA-1', new Uint8Array(data)));

export const webSha256: HashFunction = async (data) =>
  new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(data)));
