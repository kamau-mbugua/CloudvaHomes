import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { acceptSession } from '../../lib/auth/session';
import { useAuthState } from '../../lib/auth/useAuth';
import type { OrgKind, SessionPayload } from '../../lib/auth/types';
import { formatKES } from '../../lib/money';
import { Splash } from '../../components/Splash';
import { AuthLayout } from './AuthLayout';
import { EyeIcon } from './EyeIcon';
import { authErrorMessage } from './authErrors';
import { useAppConfig } from './useAppConfig';

export function RegisterPage() {
  const navigate = useNavigate();
  const { status } = useAuthState();
  const config = useAppConfig();

  const [organizationName, setOrganizationName] = useState('');
  const [organizationKind, setOrganizationKind] = useState<OrgKind>('LANDLORD');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const register = useMutation({
    mutationFn: (body: {
      organizationName: string;
      organizationKind: OrgKind;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      password: string;
    }) => api.post<DataEnvelope<SessionPayload>>('/auth/register', body, { skipAuthRetry: true }),
    onSuccess: (result) => {
      acceptSession(result.data);
      navigate('/app', { replace: true });
    },
  });

  if (status === 'signedIn') return <Navigate to="/app" replace />;
  if (status === 'loading' || config.isPending) return <Splash />;

  const cfg = config.data;
  if (cfg && !cfg.allowPublicSignup) {
    return (
      <AuthLayout>
        <div className="au__form">
          <div className="au__step">
            <h1>Registration is by invitation</h1>
            <p className="au__lede">
              Public self-service signup is currently turned off. Contact our team to onboard your
              organisation, or sign in if you already have an account.
            </p>
          </div>
          <Link className="au__submit" to="/login" style={{ textAlign: 'center', textDecoration: 'none' }}>
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    register.mutate({
      organizationName: organizationName.trim(),
      organizationKind,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      password,
    });
  };

  return (
    <AuthLayout>
      <form className="au__form" onSubmit={submit}>
        <div className="au__step">
          <h1>Create your organisation</h1>
          <p className="au__lede">
            {cfg?.defaultPlan
              ? `Start your ${cfg.defaultPlan.trialDays}-day free trial on the ${cfg.defaultPlan.name} plan (${formatKES(cfg.defaultPlan.pricePerUnit)}/let unit, min ${formatKES(cfg.defaultPlan.minimumMonthly)}/month).`
              : 'Set up your landlord or letting agency workspace in under a minute.'}
          </p>

          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="org-name">Organisation or portfolio name</label>
            </div>
            <input
              id="org-name"
              className="au__input"
              type="text"
              placeholder="e.g. Kilimani Heights or Sunrise Letting"
              autoFocus
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              required
            />
          </div>

          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="org-kind">How do you manage property?</label>
            </div>
            <select
              id="org-kind"
              className="au__input"
              value={organizationKind}
              onChange={(e) => setOrganizationKind(e.target.value as OrgKind)}
            >
              <option value="LANDLORD">Landlord (managing our own properties)</option>
              <option value="AGENCY">Letting agency (managing for property owners)</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="au__field">
              <div className="au__labelrow">
                <label htmlFor="first-name">First name</label>
              </div>
              <input
                id="first-name"
                className="au__input"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="au__field">
              <div className="au__labelrow">
                <label htmlFor="last-name">Last name</label>
              </div>
              <input
                id="last-name"
                className="au__input"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="reg-email">Email address</label>
            </div>
            <input
              id="reg-email"
              className="au__input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="reg-phone">Phone number (M-Pesa / SMS)</label>
            </div>
            <input
              id="reg-phone"
              className="au__input"
              type="tel"
              autoComplete="tel"
              placeholder="0712 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="reg-password">Password (at least 10 characters)</label>
            </div>
            <div className="au__pw">
              <input
                id="reg-password"
                className="au__input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Choose a strong password"
                minLength={10}
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

        {register.isError ? (
          <p className="au__error" role="alert">
            {authErrorMessage(register.error)}
          </p>
        ) : null}

        <button className="au__submit" type="submit" disabled={register.isPending}>
          {register.isPending ? 'Creating organisation…' : 'Create organisation & sign in'}
        </button>

        <p className="au__note">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
