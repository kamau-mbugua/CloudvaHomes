import { useEffect, useState } from 'react';

/**
 * Seconds left until a code may be re-sent. `start()` begins a new wait; 0 means "now".
 * `startedAt` (epoch ms) resumes a wait that began on a previous screen.
 */
export function useCountdown(seconds: number, startedAt?: number): { left: number; start: () => void } {
  const [until, setUntil] = useState<number | null>(() => (startedAt === undefined ? null : startedAt + seconds * 1000));
  const [now, setNow] = useState(() => Date.now());

  const running = until !== null && until > now;

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const left = until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));

  return {
    left,
    start: () => {
      const at = Date.now();
      setNow(at);
      setUntil(at + seconds * 1000);
    },
  };
}
