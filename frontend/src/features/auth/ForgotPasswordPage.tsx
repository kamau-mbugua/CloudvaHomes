import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { AuthLayout } from './AuthLayout';
import { authErrorMessage } from './authErrors';

/**
 * Step 1 of a password reset: who are you? The server always answers 202 — whether or
 * not the account exists — so the next screen is the same either way.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [identifier, setIdentifier] = useState(
    params.get('identifier') ?? ((location.state ?? {}) as { identifier?: string }).identifier ?? '',
  );

  const forgot = useMutation({
    mutationFn: (body: { identifier: string }) => api.post('/auth/password/forgot', body, { skipAuthRetry: true }),
    onSuccess: (_result, body) => {
      navigate(`/reset-password?identifier=${encodeURIComponent(body.identifier)}`, { state: { sentAt: Date.now() } });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    forgot.mutate({ identifier: identifier.trim() });
  };

  return (
    <AuthLayout>
      <form className="au__form" onSubmit={submit}>
        <div className="au__step">
          <h1>Reset your password</h1>
          <p className="au__lede">
            Enter the email or phone number you sign in with. We will send a 6-digit code to it.
          </p>

          <div className="au__field">
            <div className="au__labelrow"><label htmlFor="identifier">Email or phone number</label></div>
            <input
              id="identifier"
              className="au__input"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="you@example.com or 0712 345 678"
              autoFocus
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>
        </div>

        {forgot.isError ? <p className="au__error" role="alert">{authErrorMessage(forgot.error)}</p> : null}

        <button className="au__submit" type="submit" disabled={forgot.isPending}>
          {forgot.isPending ? 'Sending…' : 'Send code'}
        </button>

        <p className="au__note">
          Already have a code? <Link to={`/reset-password?identifier=${encodeURIComponent(identifier.trim())}`}>Enter it</Link>
          {' · '}
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
