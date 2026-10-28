/** The brief wait while the session is restored on load — no layout to jump afterwards. */
export function Splash({ label = 'Checking your session…' }: { label?: string }) {
  return (
    <div className="splash" role="status" aria-live="polite">
      <img src="/favicon.svg" alt="" aria-hidden="true" className="splash__mark" />
      <span>{label}</span>
    </div>
  );
}
