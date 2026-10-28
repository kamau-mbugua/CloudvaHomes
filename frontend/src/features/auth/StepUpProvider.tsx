import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Sheet } from '../../components/Sheet';
import { api, configureAuth } from '../../lib/api/client';
import type { StepUpGrant } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { isOtpCode } from '../../lib/auth/passwordPolicy';
import { CodeInput } from './CodeInput';
import { authErrorMessage } from './authErrors';
import { useCountdown } from './useCountdown';

/**
 * Answers `403 STEP_UP_REQUIRED` for the whole app.
 *
 * The API client calls the handler installed here; it opens a dialog, sends a code to
 * the person's own phone (or email), and resolves with the step-up grant once they type
 * it. The client then repeats the original request once with `X-Step-Up`. Cancelling
 * rejects, and the screen that made the change sees the original error.
 */

interface Pending {
  resolve: (grant: StepUpGrant) => void;
  reject: (reason: unknown) => void;
}

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    configureAuth({
      stepUp: () => new Promise<StepUpGrant>((resolve, reject) => setPending({ resolve, reject })),
    });
    return () => configureAuth({ stepUp: undefined });
  }, []);

  return (
    <>
      {children}
      {pending ? (
        <StepUpDialog
          onVerified={(grant) => {
            pending.resolve(grant);
            setPending(null);
          }}
          onCancel={() => {
            pending.reject(new Error('Step-up cancelled'));
            setPending(null);
          }}
        />
      ) : null}
    </>
  );
}

const RESEND_SECONDS = 60;

function StepUpDialog({ onVerified, onCancel }: { onVerified: (grant: StepUpGrant) => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(RESEND_SECONDS);
  const requested = useRef(false);

  const sendCode = async () => {
    setSending(true);
    setError(null);
    try {
      await api.post('/auth/step-up/request');
      setSent(true);
      countdown.start();
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setSending(false);
    }
  };

  // Once per dialog, StrictMode included: a second send would be a second SMS.
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!isOtpCode(code)) {
      setError('Enter the 6-digit code.');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const result = await api.post<DataEnvelope<StepUpGrant>>('/auth/step-up/verify', { code: code.replace(/\s/g, '') });
      onVerified(result.data);
    } catch (caught) {
      setError(authErrorMessage(caught));
      setVerifying(false);
    }
  };

  return (
    <Sheet title="Confirm it’s you" busy={verifying} onClose={onCancel}>
      <form className="stepup" onSubmit={verify}>
        <p className="stepup__lede">
          This change needs a fresh check.{' '}
          {sent
            ? 'We sent a 6-digit code to your phone (or your email if there is no phone on your account).'
            : sending ? 'Sending you a 6-digit code…' : 'We could not send a code yet.'}
        </p>

        <div className="fld">
          <label htmlFor="stepup-code">Code</label>
          <CodeInput id="stepup-code" className="stepup__code" value={code} onChange={setCode} autoFocus />
        </div>

        {error ? <p className="nx-sheet__error" role="alert">{error}</p> : null}

        <p className="stepup__resend">
          {countdown.left > 0 ? (
            <span className="nx-muted">You can send a new code in {countdown.left}s.</span>
          ) : (
            <button type="button" className="au__link" onClick={sendCode} disabled={sending}>
              {sending ? 'Sending…' : sent ? 'Send a new code' : 'Try sending again'}
            </button>
          )}
        </p>

        <div className="nx-sheet__actions">
          <button type="button" className="nx-btn" onClick={onCancel} disabled={verifying}>Cancel</button>
          <button type="submit" className="nx-btn nx-btn--primary" disabled={verifying}>
            {verifying ? 'Checking…' : 'Confirm and continue'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
