import { useEffect, useState } from 'react';

/** Hora actual (ms) refrescada cada `intervalMs`. Solo usa el reloj local: funciona offline. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
