import { concatBytes } from './bytes';

/** Función de hash asíncrona (SHA-1 nativo de expo-crypto en la app, WebCrypto en pruebas). */
export type HashFunction = (data: Uint8Array) => Promise<Uint8Array>;

/** Tamaño de bloque de SHA-1 y SHA-256 en bytes. */
export const SHA1_BLOCK_SIZE = 64;

/**
 * HMAC (RFC 2104) construido sobre una primitiva de hash nativa:
 *   HMAC(K, m) = H((K' ⊕ opad) || H((K' ⊕ ipad) || m))
 * donde K' es la clave ajustada al tamaño de bloque.
 */
export async function hmac(
  hash: HashFunction,
  key: Uint8Array,
  message: Uint8Array,
  blockSize = SHA1_BLOCK_SIZE,
): Promise<Uint8Array> {
  const keyBlock = new Uint8Array(blockSize);
  keyBlock.set(key.length > blockSize ? await hash(key) : key);

  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = keyBlock[i]! ^ 0x36;
    opad[i] = keyBlock[i]! ^ 0x5c;
  }

  const inner = await hash(concatBytes(ipad, message));
  return hash(concatBytes(opad, inner));
}
