/** Rules for opening a logged platform email and revealing the secret hidden in it. */

/** A reason must say something: it is kept in the audit log next to who looked. */
export const REVEAL_REASON_MIN = 10;

export function revealReasonError(reason: string): string | null {
  return reason.trim().length < REVEAL_REASON_MIN
    ? `Say why you need to see it (at least ${REVEAL_REASON_MIN} characters), e.g. “Owner phoned: the code never arrived”.`
    : null;
}
