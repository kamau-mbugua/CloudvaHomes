import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { PASSWORD_RULES_HINT, newPasswordErrors } from '../../lib/auth/passwordPolicy';
import { acceptSession } from '../../lib/auth/session';
import type { InvitationPreview, SessionPayload } from '../../lib/auth/types';
import { AuthLayout } from './AuthLayout';
import { AuthField } from './AuthField';
import { EyeIcon } from './EyeIcon';
import { authErrorMessage } from './authErrors';

/**
 * `/invite/:token` — join an organisation from an emailed or texted link.
 *
 * Someone new to Hodi chooses a password here; someone who already has an account just
 * accepts. Either way they come out signed in to the organisation that invited them.
 */
export function AcceptInvitationPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.get<DataEnvelope<InvitationPreview>>(`/auth/invitations/${encodeURIComponent(token)}`),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: (body: { token: string; password?: string }) =>
      api.post<DataEnvelope<SessionPayload>>('/auth/invitations/accept', body, { skipAuthRetry: true }),
    onSuccess: (result) => {
      acceptSession(result.data);
      navigate('/app', { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
        setErrors({ password: error.fieldErrors.password });
      }
    },
  });

  const invalid = (preview.error instanceof ApiError && preview.error.code === 'INVITATION_INVALID')
    || (accept.error instanceof ApiError && accept.error.code === 'INVITATION_INVALID');

  if (invalid) {
    return (
      <AuthLayout>
        <div className="au__form au__step">
          <h1>This invitation can’t be used</h1>
          <p className="au__lede">
            The link has expired or has already been used. Ask the person who invited you to send a
            new invitation. If you already accepted it, sign in instead.
          </p>
          <Link className="au__submit au__submit--link" to="/login">Go to sign in</Link>
        </div>
      </AuthLayout>
    );
  }

  if (preview.isPending) {
    return (
      <AuthLayout>
        <div className="au__form au__step"><p className="au__lede" role="status">Opening your invitation…</p></div>
      </AuthLayout>
    );
  }

  if (preview.isError) {
    return (
      <AuthLayout>
        <div className="au__form au__step">
          <h1>We couldn’t open this invitation</h1>
          <p className="au__error" role="alert">{authErrorMessage(preview.error)}</p>
          <button type="button" className="au__submit" onClick={() => preview.refetch()}>Try again</button>
        </div>
      </AuthLayout>
    );
  }

  const invite = preview.data.data;
  const needsPassword = !invite.hasPassword;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (needsPassword) {
      const found = newPasswordErrors(password, confirm);
      setErrors(found);
      if (Object.keys(found).length > 0) return;
      accept.mutate({ token, password });
    } else {
      accept.mutate({ token });
    }
  };

  const showServerError = accept.isError
    && !(accept.error instanceof ApiError && accept.error.code === 'VALIDATION_FAILED' && errors.password);

  return (
    <AuthLayout>
      <form className="au__form" onSubmit={submit} noValidate>
        <div className="au__step">
          <h1>Join {invite.organizationName}</h1>
          <p className="au__lede">
            {invite.firstName ? `Hi ${invite.firstName}. ` : ''}
            {invite.inviterName ? `${invite.inviterName} invited you` : 'You have been invited'} to
            manage {invite.organizationName} on KodiHub
            {invite.email || invite.phone ? ` as ${invite.email ?? invite.phone}` : ''}.
          </p>

          {needsPassword ? (
            <>
              <AuthField id="password" label="Choose a password" error={errors.password} hint={PASSWORD_RULES_HINT}>
                <div className="au__pw">
                  <input
                    id="password"
                    className="au__input"
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoFocus
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

              <AuthField id="confirm" label="Password again" error={errors.confirm}>
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
            </>
          ) : (
            <p className="au__ok">You already have a KodiHub account, so there is no password to choose.</p>
          )}
        </div>

        {showServerError ? <p className="au__error" role="alert">{authErrorMessage(accept.error)}</p> : null}

        <button className="au__submit" type="submit" disabled={accept.isPending}>
          {accept.isPending ? 'Joining…' : `Join ${invite.organizationName}`}
        </button>
      </form>
    </AuthLayout>
  );
}
