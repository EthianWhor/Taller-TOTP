import { useEffect, useState } from 'react';
import { sha1 } from '../crypto/nativeHash';
import { generateTotp, secondsRemaining, timeStep, TOTP_PERIOD_SECONDS } from '../crypto/totp';

export interface TotpState {
  code: string | null;
  secondsLeft: number;
  counter: number;
  error: string | null;
}

/**
 * Calcula el TOTP localmente para la ventana actual. El código solo se recalcula
 * cuando cambia la ventana T y el anterior se mantiene en pantalla hasta que el
 * nuevo está listo, así no hay parpadeos al regenerar.
 */
export function useTotp(secretBase32: string, now: number): TotpState {
  const counter = timeStep(now);
  const [result, setResult] = useState<{ counter: number; code: string | null; error: string | null }>({
    counter: -1,
    code: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    generateTotp(sha1, secretBase32, counter * TOTP_PERIOD_SECONDS * 1000)
      .then((code) => {
        if (!cancelled) setResult({ counter, code, error: null });
      })
      .catch(() => {
        if (!cancelled) setResult((prev) => ({ ...prev, error: 'No se pudo calcular el código' }));
      });
    return () => {
      cancelled = true;
    };
  }, [secretBase32, counter]);

  return { code: result.code, secondsLeft: secondsRemaining(now), counter, error: result.error };
}
