/** Reloj inyectable (en milisegundos) para poder probar expiraciones y ventanas TOTP. */
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();
