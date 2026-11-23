import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { clearSession } from '../../lib/auth/session';
import { useAuthState } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { settingsErrorMessage } from '../settings/api';
import { AuthLayout } from '../auth/AuthLayout';

/** KodiHQ's terms and privacy policy are Cloudva Solutions' (cloudvalabs.com). */
export const TERMS_URL = 'https://www.cloudvalabs.com/terms';
export const PRIVACY_URL = 'https://www.cloudvalabs.com/privacy';
export const PRIVACY_EMAIL = 'privacy@cloudvalabs.com';

function WhatHappens() {
  return (
    <ul className="del__points">
      <li>You’re signed out on every phone and computer, and can’t sign in to this account again.</li>
      <li>
        Your email, phone number and password are removed from the account, so they’re free to use for a new
        one later.
      </li>
      <li>
        Landlords, agencies and hosts you deal with keep their own records about you, like invoices, receipts,
        payments and bookings, as the law requires.
      </li>
      <li>If you’re the only owner of an organisation, make someone else an owner first.</li>
      <li>
        Our <a href={PRIVACY_URL} target="_blank" rel="noreferrer">privacy policy</a> explains how long the rest
        is kept. To ask for a copy of your data, or for it to be erased, email{' '}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
      </li>
    </ul>
  );
}

/**
 * Deleting your own account (soft delete on the server). The server asks for a one-time code
 * (STEP_UP_REQUIRED); the app-wide StepUpProvider prompts for it and sends the request again.
 */
export function DeleteAccountSection() {
  const toast = useToast();
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [understood, setUnderstood] = useState(false);

  const remove = useMutation({
    mutationFn: () => api.post('/me/delete', reason.trim() ? { reason: reason.trim() } : {}),
    onSuccess: () => {
      // The server already ended every session: forget it here without a logout call.
      clearSession();
      toast.saved('Your KodiHQ account has been deleted.');
      navigate('/login', { replace: true });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (understood) remove.mutate();
  };

  return (
    <form className="fm__section" onSubmit={submit} noValidate>
      <h2>Delete account</h2>
      <p>Close your KodiHQ login. We’ll send a code to your phone or email to confirm it’s you.</p>
      <WhatHappens />

      <div className="fld">
        <label htmlFor="del-reason">Why are you leaving? (optional)</label>
        <textarea id="del-reason" rows={3} maxLength={500} value={reason}
          onChange={(e) => setReason(e.target.value)} disabled={remove.isPending} />
      </div>
      <label className="del__confirm">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)}
          disabled={remove.isPending} />
        <span>I understand this can’t be undone.</span>
      </label>

      {remove.isError ? <p className="ad__error pg-gap" role="alert">{settingsErrorMessage(remove.error)}</p> : null}

      <div className="pg-actions pg-gap">
        <button type="submit" className="nx-btn nx-btn--danger-solid" disabled={!understood || remove.isPending}>
          {remove.isPending ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </form>
  );
}

/**
 * `/delete-account`: public, for the Play Store listing's "delete account" link. Signed out, it
 * says how; signed in, it is the delete form itself, whoever you are (staff, tenant, owner).
 */
export function DeleteAccountPage() {
  const { session } = useAuthState();
  return (
    <AuthLayout>
      <div className="au__form">
        <div className="au__step">
          <h1>Delete your KodiHQ account</h1>
          {session ? (
            <p className="au__lede">
              Signed in as {session.user.firstName} {session.user.lastName}
              {session.user.email ? ` (${session.user.email})` : session.user.phone ? ` (${session.user.phone})` : ''}.
            </p>
          ) : (
            <p className="au__lede">
              You can delete your account yourself, in the KodiHQ app (Account, then Delete account) or here once
              you sign in.
            </p>
          )}
        </div>
        {session ? (
          <DeleteAccountSection />
        ) : (
          <>
            <WhatHappens />
            <Link className="au__submit del__signin" to="/login?next=%2Fdelete-account">
              Sign in to delete your account
            </Link>
            <p className="au__note">
              Can’t sign in any more? Email <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> from the email
              on your account, or tell us its phone number, and we’ll delete it for you.
            </p>
          </>
        )}
        <p className="au__note">
          <a href={TERMS_URL} target="_blank" rel="noreferrer">Terms of service</a>
          {' · '}
          <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy policy</a>
        </p>
      </div>
    </AuthLayout>
  );
}
