/**
 * Wraps an async function so concurrent callers share one in-flight call.
 *
 * Used for the session refresh: ten requests that all hit `401 TOKEN_EXPIRED` at once must
 * cause ONE `POST /auth/refresh`, not ten. Refresh tokens rotate on every use and reusing
 * a rotated one revokes the whole session family, so a second concurrent refresh would
 * sign the person out. Also used for the step-up prompt (one dialog, however many writes
 * asked for it).
 *
 * Once the call settles, the next caller starts a fresh one.
 */
export function singleFlight<A extends unknown[], T>(fn: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return (...args: A) => {
    if (inFlight) return inFlight;

    // Started on a microtask so `inFlight` is always assigned before the call can settle,
    // even when `fn` throws synchronously.
    const run: Promise<T> = Promise.resolve()
      .then(() => fn(...args))
      .finally(() => {
        if (inFlight === run) inFlight = null;
      });

    inFlight = run;
    return run;
  };
}
