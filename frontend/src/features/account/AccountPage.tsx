import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { PASSWORD_RULES_HINT, newPasswordErrors } from '../../lib/auth/passwordPolicy';
import { updateSessionDetails } from '../../lib/auth/session';
import type { SessionPayload } from '../../lib/auth/types';
import { useSession } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { settingsErrorMessage } from '../settings/api';

/**
 * `/app/account` — your own name and password. Email and phone are how you sign in, so
 * they are shown but changed by an organisation owner (or support), not here.
 */
export function AccountPage() {
  return (
    <div className="fm fm--single pg-narrow">
      <div className="fm__main">
        <ProfileSection />
        <PasswordSection />
      </div>
    </div>
  );
}

function ProfileSection() {
  const session = useSession();
  const toast = useToast();
  const [firstName, setFirstName] = useState(session.user.firstName);
  const [lastName, setLastName] = useState(session.user.lastName);
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string }>({});

  const dirty = firstName.trim() !== session.user.firstName || lastName.trim() !== session.user.lastName;

  const save = useMutation({
    mutationFn: async () => {
      await api.patch('/me', { firstName: firstName.trim(), lastName: lastName.trim() });
      // The response shape of PATCH /me is not pinned down; GET /me is the session.
      const me = await api.get<DataEnvelope<SessionPayload>>('/me');
      updateSessionDetails(me.data);
    },
    onSuccess: () => {
      setErrors({});
      toast.saved('Your name was saved.');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') setErrors(error.fieldErrors);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: typeof errors = {};
    if (!firstName.trim()) found.firstName = 'Required.';
    if (!lastName.trim()) found.lastName = 'Required.';
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  };

  return (
    <form className="fm__section" onSubmit={submit} noValidate>
      <h2>Your details</h2>
      <p>How you appear to others in this organisation and in the audit log.</p>

      <div className="fm__grid">
        <div className={`fld ${errors.firstName ? 'is-bad' : ''}`}>
          <label htmlFor="me-first">First name</label>
          <input id="me-first" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)}
            disabled={save.isPending} aria-invalid={Boolean(errors.firstName)} />
          {errors.firstName ? <span className="fld__err">{errors.firstName}</span> : null}
        </div>
        <div className={`fld ${errors.lastName ? 'is-bad' : ''}`}>
          <label htmlFor="me-last">Last name</label>
          <input id="me-last" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)}
            disabled={save.isPending} aria-invalid={Boolean(errors.lastName)} />
          {errors.lastName ? <span className="fld__err">{errors.lastName}</span> : null}
        </div>
        <div className="fld">
          <label htmlFor="me-email">Email</label>
          <input id="me-email" value={session.user.email ?? '—'} disabled readOnly />
        </div>
        <div className="fld">
          <label htmlFor="me-phone">Phone</label>
          <input id="me-phone" className="num" value={session.user.phone ?? '—'} disabled readOnly />
        </div>
      </div>

      {save.isError && !(save.error instanceof ApiError && save.error.code === 'VALIDATION_FAILED')
        ? <p className="ad__error pg-gap" role="alert">{settingsErrorMessage(save.error)}</p> : null}

      <div className="pg-actions pg-gap">
        <button type="submit" className="nx-btn nx-btn--primary" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save name'}
        </button>
      </div>
    </form>
  );
}

type PwField = 'currentPassword' | 'password' | 'confirm';

function PasswordSection() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Partial<Record<PwField, string>>>({});

  const change = useMutation({
    mutationFn: () => api.post('/me/password', { currentPassword: current, newPassword: password }),
    onSuccess: () => {
      setCurrent('');
      setPassword('');
      setConfirm('');
      setErrors({});
      toast.saved('Password changed. Your other devices have been signed out.');
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return;
      if (error.code === 'VALIDATION_FAILED') {
        const f = error.fieldErrors;
        setErrors({ currentPassword: f.currentPassword, password: f.newPassword ?? f.password });
      } else if (error.code === 'INVALID_CREDENTIALS') {
        setErrors({ currentPassword: 'That is not your current password.' });
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<PwField, string>> = { ...newPasswordErrors(password, confirm) };
    if (!current) found.currentPassword = 'Enter your current password.';
    else if (current === password && !found.password) found.password = 'Choose a password different from the current one.';
    setErrors(found);
    if (Object.keys(found).length === 0) change.mutate();
  };

  const pw = (name: PwField, id: string, label: string, value: string, set: (v: string) => void, autoComplete: string, hint?: string) => (
    <div className={`fld ${errors[name] ? 'is-bad' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="password" autoComplete={autoComplete} value={value} onChange={(e) => set(e.target.value)}
        disabled={change.isPending} aria-invalid={Boolean(errors[name])} />
      {errors[name] ? <span className="fld__err">{errors[name]}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );

  const handled = change.error instanceof ApiError && ['VALIDATION_FAILED', 'INVALID_CREDENTIALS'].includes(change.error.code);

  return (
    <form className="fm__section" onSubmit={submit} noValidate>
      <h2>Password</h2>
      <p>Changing it signs you out everywhere else.</p>

      <div className="fm__grid">
        <div className="fm__wide pg-half">{pw('currentPassword', 'me-current', 'Current password', current, setCurrent, 'current-password')}</div>
        {pw('password', 'me-new', 'New password', password, setPassword, 'new-password', PASSWORD_RULES_HINT)}
        {pw('confirm', 'me-confirm', 'New password again', confirm, setConfirm, 'new-password')}
      </div>

      {change.isError && !handled ? <p className="ad__error pg-gap" role="alert">{settingsErrorMessage(change.error)}</p> : null}

      <div className="pg-actions pg-gap">
        <button type="submit" className="nx-btn nx-btn--primary" disabled={change.isPending || !current || !password}>
          {change.isPending ? 'Changing…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}
