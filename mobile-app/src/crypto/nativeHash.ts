import * as Crypto from 'expo-crypto';
import type { HashFunction } from './hmac';

/**
 * Primitivas de hash NATIVAS (CommonCrypto en iOS, java.security en Android) vía expo-crypto.
 * Funcionan 100 % offline: no hacen ninguna petición de red (Modo Avión).
 */
export const sha1: HashFunction = async (data) =>
  new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA1, new Uint8Array(data)));

export const sha256: HashFunction = async (data) =>
  new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(data)));

/** Bytes aleatorios de un CSPRNG nativo (SecRandomCopyBytes / SecureRandom). */
export function randomBytes(count: number): Uint8Array {
  return Crypto.getRandomBytes(count);
}
