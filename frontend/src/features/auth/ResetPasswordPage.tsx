import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { PASSWORD_RULES_HINT, isOtpCode, newPasswordErrors } from '../../lib/auth/passwordPolicy';
import { AuthLayout } from './AuthLayout';
import { CodeInput } from './CodeInput';
import { EyeIcon } from './EyeIcon';
import { authErrorMessage } from './authErrors';
import { useCountdown } from './useCountdown';
import { AuthField } from './AuthField';

/**
 * Step 2 of a password reset: the code, and the new password twice. Success signs every
 * device out (server side) and sends the person to sign in with the new password.
 */

type Field = 'identifier' | 'code' | 'password' | 'confirm';

const RESEND_SECONDS = 60;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [identifier, setIdentifier] = useState(params.get('identifier') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  // Arrived straight from "Send code": the first resend waits like any other.
  const sentAt = ((location.state ?? {}) as { sentAt?: number }).sentAt;
  const countdown = useCountdown(RESEND_SECONDS, typeof sentAt === 'number' ? sentAt : undefined);

  const reset = useMutation({
    mutationFn: (body: { identifier: string; code: string; newPassword: string }) =>
      api.post('/auth/password/reset', body, { skipAuthRetry: true }),
    onSuccess: (_result, body) => {
      navigate('/login', {
        replace: true,
        state: { notice: 'Password changed. Sign in with your new password.', identifier: body.identifier },
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
        const fields = error.fieldErrors;
        setErrors({
          identifier: fields.identifier,
          code: fields.code,
          password: fields.newPassword ?? fields.password,
        });
      }
    },
  });

  const resend = useMutation({
    mutationFn: () => api.post('/auth/password/forgot', { identifier: identifier.trim() }, { skipAuthRetry: true }),
    onSuccess: () => countdown.start(),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<Field, string>> = { ...newPasswordErrors(password, confirm) };
    if (!identifier.trim()) found.identifier = 'Enter the email or phone number the code was sent to.';
    if (!isOtpCode(code)) found.code = 'Enter the 6-digit code.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    reset.mutate({ identifier: identifier.trim(), code: code.replace(/\s/g, ''), newPassword: password });
  };

  const fieldErrorShown = Object.values(errors).some(Boolean);
  const serverError = reset.isError && !(reset.error instanceof ApiError && reset.error.code === 'VALIDATION_FAILED' && fieldErrorShown)
    ? authErrorMessage(reset.error) : null;

  return (
    <AuthLayout>
      <form className="au__form" onSubmit={submit} noValidate>
        <div className="au__step">
          <h1>Choose a new password</h1>
          <p className="au__lede">Enter the 6-digit code we sent, then your new password.</p>

          <AuthField id="identifier" label="Email or phone number" error={errors.identifier}>
            <input
              id="identifier"
              className="au__input"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              aria-invalid={Boolean(errors.identifier)}
            />
          </AuthField>

          <AuthField id="code" label="Code" error={errors.code}>
            <CodeInput id="code" value={code} onChange={setCode} autoFocus={Boolean(identifier)} />
          </AuthField>

          <AuthField id="password" label="New password" error={errors.password} hint={PASSWORD_RULES_HINT}>
            <div className="au__pw">
              <input
                id="password"
                className="au__input"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(errors.password)}
              />
              <button type="button" className="au__eye" onClick={() => setShow((on) => !on)}
                aria-label={show ? 'Hide password' : 'Show password'}>
                <EyeIcon open={show} />
              </button>
            </div>
          </AuthField>

          <AuthField id="confirm" label="New password again" error={errors.confirm}>
            <input
              id="confirm"
              className="au__input"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={Boolean(errors.confirm)}
            />
          </AuthField>
        </div>

        {serverError ? <p className="au__error" role="alert">{serverError}</p> : null}
        {resend.isError ? <p className="au__error" role="alert">{authErrorMessage(resend.error)}</p> : null}
        {resend.isSuccess && countdown.left > 0 ? <p className="au__ok" role="status">A new code is on its way.</p> : null}

        <button className="au__submit" type="submit" disabled={reset.isPending}>
          {reset.isPending ? 'Saving…' : 'Set new password'}
        </button>

        <p className="au__note">
          {countdown.left > 0 ? (
            <>You can send a new code in <span className="num">{countdown.left}</span>s.</>
          ) : (
            <button type="button" className="au__link" disabled={resend.isPending || !identifier.trim()}
              onClick={() => resend.mutate()}>
              {resend.isPending ? 'Sending…' : 'Send a new code'}
            </button>
          )}
          {' · '}
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
