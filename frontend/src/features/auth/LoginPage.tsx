import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { acceptSession } from '../../lib/auth/session';
import { safeNext } from '../../lib/auth/next';
import { isOtpCode } from '../../lib/auth/passwordPolicy';
import { useAuthState } from '../../lib/auth/useAuth';
import type { AdminTwoFactorChallenge, SessionPayload } from '../../lib/auth/types';
import { Splash } from '../../components/Splash';
import { EyeIcon } from './EyeIcon';
import { AuthLayout } from './AuthLayout';
import { CodeInput } from './CodeInput';
import { authErrorMessage } from './authErrors';
import { useCountdown } from './useCountdown';

/**
 * Sign in — the pos-react auth layout with Hodi branding.
 *
 * One identifier field takes an email address OR a phone number; the server decides
 * which it is. "Use a one-time code instead" is the phone-only path (most tenants and
 * caretakers have no email): phone → 6-digit SMS code.
 *
 * After signing in the person goes to `next` (the page they were sent here from) or
 * `/app`. An account without an organisation is explained by RequireAuth there.
 */

type Mode = 'password' | 'otp-phone' | 'otp-code' | 'admin-2fa';

const RESEND_SECONDS = 60;

interface LoginNotice {
  notice?: string;
  identifier?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { status } = useAuthState();
  const next = safeNext(params.get('next'));
  const handedOver = (location.state ?? {}) as LoginNotice;

  const [mode, setMode] = useState<Mode>('password');
  const [identifier, setIdentifier] = useState(handedOver.identifier ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [twoFactor, setTwoFactor] = useState<AdminTwoFactorChallenge | null>(null);
  const countdown = useCountdown(RESEND_SECONDS);

  const finish = (payload: SessionPayload) => {
    acceptSession(payload);
    navigate(next, { replace: true });
  };

  const login = useMutation({
    mutationFn: (body: { identifier: string; password: string }) =>
      api.post<DataEnvelope<SessionPayload | AdminTwoFactorChallenge>>('/auth/login', body, { skipAuthRetry: true }),
    onSuccess: (result) => {
      if ('requiresTwoFactor' in result.data) {
        setTwoFactor(result.data);
        setCode('');
        setCodeError(null);
        setMode('admin-2fa');
        return;
      }
      finish(result.data);
    },
  });

  const verifyAdminTwoFactor = useMutation({
    mutationFn: (body: { challengeToken: string; code: string }) =>
      api.post<DataEnvelope<SessionPayload>>('/auth/login/2fa', body, { skipAuthRetry: true }),
    onSuccess: (result) => finish(result.data),
  });

  const requestOtp = useMutation({
    mutationFn: (body: { phone: string }) => api.post('/auth/otp/request', body, { skipAuthRetry: true }),
    onSuccess: () => {
      setMode('otp-code');
      setCode('');
      countdown.start();
    },
  });

  const verifyOtp = useMutation({
    mutationFn: (body: { phone: string; code: string }) =>
      api.post<DataEnvelope<SessionPayload>>('/auth/otp/verify', body, { skipAuthRetry: true }),
    onSuccess: (result) => finish(result.data),
  });

  // Already signed in (a restored session, or the back button after signing in).
  if (status === 'signedIn') return <Navigate to={next} replace />;
  if (status === 'loading') return <Splash />;

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ identifier: identifier.trim(), password });
  };

  const submitPhone = (event: FormEvent) => {
    event.preventDefault();
    requestOtp.mutate({ phone: phone.trim() });
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (!isOtpCode(code)) {
      setCodeError('Enter the 6-digit code from the SMS.');
      return;
    }
    setCodeError(null);
    verifyOtp.mutate({ phone: phone.trim(), code: code.replace(/\s/g, '') });
  };

  const switchTo = (to: Mode) => {
    login.reset();
    requestOtp.reset();
    verifyOtp.reset();
    verifyAdminTwoFactor.reset();
    setCodeError(null);
    setMode(to);
  };

  if (mode === 'admin-2fa' && twoFactor) {
    const error = codeError ?? (verifyAdminTwoFactor.isError ? authErrorMessage(verifyAdminTwoFactor.error) : null);

    const submitAdminTwoFactor = (event: FormEvent) => {
      event.preventDefault();
      if (!isOtpCode(code)) {
        setCodeError('Enter the 6-digit verification code.');
        return;
      }
      setCodeError(null);
      verifyAdminTwoFactor.mutate({
        challengeToken: twoFactor.challengeToken,
        code: code.replace(/\s/g, ''),
      });
    };

    return (
      <AuthLayout>
        <form className="au__form" onSubmit={submitAdminTwoFactor} key="admin-2fa">
          <div className="au__step">
            <h1>Confirm admin sign-in</h1>
            <p className="au__lede">
              Enter the 6-digit verification code sent via {twoFactor.channel === 'SMS' ? 'SMS' : 'email'} to{' '}
              <strong>{twoFactor.destinationMasked}</strong>.
            </p>

            <div className="au__field">
              <div className="au__labelrow">
                <label htmlFor="admin-2fa-code">Verification code</label>
                <button type="button" className="au__link" onClick={() => switchTo('password')}>Back to sign in</button>
              </div>
              <CodeInput id="admin-2fa-code" value={code} onChange={setCode} autoFocus />
            </div>
          </div>

          {error ? <p className="au__error" role="alert">{error}</p> : null}

          <button className="au__submit" type="submit" disabled={verifyAdminTwoFactor.isPending}>
            {verifyAdminTwoFactor.isPending ? 'Verifying…' : 'Verify & sign in'}
          </button>
        </form>
      </AuthLayout>
    );
  }

  if (mode === 'otp-phone') {
    return (
      <AuthLayout>
        <form className="au__form" onSubmit={submitPhone} key="otp-phone">
          <div className="au__step">
            <h1>Sign in with a code</h1>
            <p className="au__lede">We will text a 6-digit code to your phone.</p>

            <div className="au__field">
              <div className="au__labelrow"><label htmlFor="phone">Phone number</label></div>
              <input
                id="phone"
                className="au__input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0712 345 678"
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          </div>

          {requestOtp.isError ? <p className="au__error" role="alert">{authErrorMessage(requestOtp.error)}</p> : null}

          <button className="au__submit" type="submit" disabled={requestOtp.isPending}>
            {requestOtp.isPending ? 'Sending…' : 'Send code'}
          </button>

          <p className="au__note">
            <button type="button" className="au__link" onClick={() => switchTo('password')}>Use a password instead</button>
          </p>
        </form>
      </AuthLayout>
    );
  }

  if (mode === 'otp-code') {
    const error = codeError ?? (verifyOtp.isError ? authErrorMessage(verifyOtp.error)
      : requestOtp.isError ? authErrorMessage(requestOtp.error) : null);

    return (
      <AuthLayout>
        <form className="au__form" onSubmit={submitCode} key="otp-code">
          <div className="au__step">
            <h1>Enter your code</h1>
            <p className="au__lede">
              If {phone.trim()} has a KodiHub account, a 6-digit code is on its way. It works for 5 minutes.
            </p>

            <div className="au__field">
              <div className="au__labelrow">
                <label htmlFor="code">Code</label>
                <button type="button" className="au__link" onClick={() => switchTo('otp-phone')}>Change number</button>
              </div>
              <CodeInput id="code" value={code} onChange={setCode} autoFocus />
            </div>
          </div>

          {error ? <p className="au__error" role="alert">{error}</p> : null}

          <button className="au__submit" type="submit" disabled={verifyOtp.isPending}>
            {verifyOtp.isPending ? 'Checking…' : 'Sign in'}
          </button>

          <p className="au__note">
            {countdown.left > 0 ? (
              <>Didn’t get it? You can send a new code in <span className="num">{countdown.left}</span>s.</>
            ) : (
              <button
                type="button"
                className="au__link"
                disabled={requestOtp.isPending}
                onClick={() => { verifyOtp.reset(); requestOtp.mutate({ phone: phone.trim() }); }}
              >
                {requestOtp.isPending ? 'Sending…' : 'Send a new code'}
              </button>
            )}
          </p>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form className="au__form" onSubmit={submitPassword} key="password">
        <div className="au__step">
          <h1>Welcome back</h1>
          <p className="au__lede">Sign in to manage your properties, tenants and rent.</p>

          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="identifier">Email or phone number</label>
            </div>
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

          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="password">Password</label>
              <Link to="/forgot-password" state={{ identifier: identifier.trim() }}>Forgot password?</Link>
            </div>
            <div className="au__pw">
              <input
                id="password"
                className="au__input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="au__eye"
                onClick={() => setShowPassword((on) => !on)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>
        </div>

        {handedOver.notice && !login.isError ? <p className="au__ok" role="status">{handedOver.notice}</p> : null}
        {login.isError ? <p className="au__error" role="alert">{authErrorMessage(login.error)}</p> : null}

        <button className="au__submit" type="submit" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="au__or"><span>or</span></div>

        <button type="button" className="au__alt" onClick={() => switchTo('otp-phone')}>
          Use a one-time code instead
        </button>
      </form>
    </AuthLayout>
  );
}
