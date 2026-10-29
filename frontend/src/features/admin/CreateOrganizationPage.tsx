import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { isSuperAdmin } from '../../lib/auth/portals';
import type { OrgKind } from '../../lib/auth/types';
import { useSession } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { unwrap } from '../payments/rules';
import { Breadcrumbs, Field } from '../portfolio/ui';
import { keys, platformErrorMessage, usePlans, usePlatformOperators } from '../platform/api';

interface CreateOrgResponse {
  id?: string;
  name?: string;
  invitationDelivered?: boolean;
  organization?: { id: string; name: string; kind: OrgKind; status: string };
  ownerInvitation?: { id: string; email: string; phone: string; expiresAt: string };
}

/**
 * Admin → New organisation (`/admin/organizations/new`): provisions an organisation
 * (Landlord or Agency), assigns its initial plan and salesperson, seeds its built-in
 * roles, and sends an invitation to its owner.
 */
export function CreateOrganizationPage() {
  const { user } = useSession();
  const superAdmin = isSuperAdmin(user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const plans = usePlans(superAdmin);
  const operators = usePlatformOperators(superAdmin);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<OrgKind>('LANDLORD');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [kraPin, setKraPin] = useState('');
  const [planId, setPlanId] = useState('');
  const [onboardedById, setOnboardedById] = useState('');

  const [ownerFirstName, setOwnerFirstName] = useState('');
  const [ownerLastName, setOwnerLastName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [tab, setTab] = useState<'org' | 'owner'>('org');

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<unknown>('/platform/organizations', body).then((res) => unwrap<CreateOrgResponse>(res)),
    onSuccess: async (res) => {
      const orgId = res.id ?? res.organization?.id ?? '';
      const orgName = res.name ?? res.organization?.name ?? name.trim();
      const targetEmail = res.ownerInvitation?.email ?? ownerEmail.trim();
      toast.saved(
        res.invitationDelivered === false
          ? `${orgName} created (invitation email could not be delivered — check Email settings).`
          : `${orgName} created and owner invitation sent to ${targetEmail}.`,
      );
      await queryClient.invalidateQueries({ queryKey: keys.platform });
      navigate(`/admin/organizations/${encodeURIComponent(orgId)}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422 && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors);
        const hasOrgErr = ['name', 'kind', 'phone', 'email', 'kraPin', 'planId', 'onboardedById'].some((k) => k in error.fieldErrors);
        setTab(hasOrgErr ? 'org' : 'owner');
        return;
      }
      setGeneral(platformErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const nextErrors: Record<string, string> = {};
    if (name.trim().length < 2) nextErrors.name = 'Enter the organisation name (at least 2 characters).';
    if (!phone.trim()) nextErrors.phone = 'Enter the organisation phone number.';
    if (!email.trim() || !email.includes('@')) nextErrors.email = 'Enter a valid organisation email.';
    if (!ownerFirstName.trim()) nextErrors['owner.firstName'] = 'Enter the owner’s first name.';
    if (!ownerLastName.trim()) nextErrors['owner.lastName'] = 'Enter the owner’s last name.';
    if (!ownerEmail.trim() || !ownerEmail.includes('@')) nextErrors['owner.email'] = 'Enter a valid email for the owner.';
    if (!ownerPhone.trim()) nextErrors['owner.phone'] = 'Enter the owner’s phone number.';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const hasOrgErr = ['name', 'kind', 'phone', 'email', 'kraPin', 'planId', 'onboardedById'].some((k) => k in nextErrors);
      setTab(hasOrgErr ? 'org' : 'owner');
      return;
    }
    setErrors({});

    create.mutate({
      name: name.trim(),
      kind,
      phone: phone.trim(),
      email: email.trim(),
      ...(kraPin.trim() ? { kraPin: kraPin.trim().toUpperCase() } : {}),
      ...(planId ? { planId } : {}),
      ...(superAdmin && onboardedById ? { onboardedById } : {}),
      owner: {
        firstName: ownerFirstName.trim(),
        lastName: ownerLastName.trim(),
        email: ownerEmail.trim(),
        phone: ownerPhone.trim(),
      },
    });
  };

  const activePlans = (plans.data ?? []).filter((p) => p.active);
  const allOperators = (operators.data ?? []).filter((op) => op.status === 'ACTIVE');

  return (
    <div className="pg pg-narrow">
      <Breadcrumbs trail={[{ label: 'Organisations', to: '/admin/organizations' }, { label: 'New organisation' }]} />

      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="New organisation steps">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'org'}
            className="pf__tab"
            onClick={() => setTab('org')}
          >
            1. Organisation details
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'owner'}
            className="pf__tab"
            onClick={() => setTab('owner')}
          >
            2. Primary owner
          </button>
        </div>
      </div>

      <form className="fm__section" onSubmit={submit} noValidate>
        {tab === 'org' ? (
          <>
            <h2>Organisation details</h2>
            <p>Create a Landlord or Property Agency account on KodiHub. Its billing reference (e.g. H00001) and built-in roles are set up automatically.</p>

            <div className="fm__grid">
              <Field id="co-name" label="Organisation name" error={errors.name}>
                <input id="co-name" value={name} aria-invalid={Boolean(errors.name)} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Kilimani Heights Ltd" />
              </Field>

              <Field id="co-kind" label="Account type" error={errors.kind}>
                <select id="co-kind" value={kind} onChange={(e) => setKind(e.target.value as OrgKind)}>
                  <option value="LANDLORD">Landlord (manages own properties)</option>
                  <option value="AGENCY">Agency (manages properties for landlords)</option>
                </select>
              </Field>

              <Field id="co-phone" label="Organisation phone" error={errors.phone} hint="Kenyan number, e.g. 0712345678 or +254712345678.">
                <input id="co-phone" type="tel" value={phone} aria-invalid={Boolean(errors.phone)} onChange={(e) => setPhone(e.target.value)} />
              </Field>

              <Field id="co-email" label="Organisation email" error={errors.email}>
                <input id="co-email" type="email" value={email} aria-invalid={Boolean(errors.email)} onChange={(e) => setEmail(e.target.value)} />
              </Field>

              <Field id="co-kra" label="KRA PIN" optional error={errors.kraPin} hint="Format: A000000000B">
                <input id="co-kra" value={kraPin} aria-invalid={Boolean(errors.kraPin)} onChange={(e) => setKraPin(e.target.value)} maxLength={11} />
              </Field>

              {superAdmin ? (
                <Field id="co-plan" label="Initial plan" optional error={errors.planId} hint="Leave on default to use KodiHub’s default plan and trial.">
                  <select id="co-plan" value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={plans.isPending}>
                    <option value="">Default plan</option>
                    {activePlans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.trialDays}d trial)</option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {superAdmin ? (
                <Field id="co-sales" label="Salesperson / account owner" optional wide error={errors.onboardedById}
                  hint="Assigns this organisation to a salesperson’s book of business.">
                  <select id="co-sales" value={onboardedById} onChange={(e) => setOnboardedById(e.target.value)} disabled={operators.isPending}>
                    <option value="">Unassigned</option>
                    {allOperators.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.firstName} {op.lastName} ({op.email}) — {(op.role ?? op.platformRole) === 'SALESPERSON' ? 'Salesperson' : 'Superadmin'}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </div>

            {general ? <p className="ad__error" role="alert">{general}</p> : null}

            <div className="pg-actions">
              <Link className="nx-btn" to="/admin/organizations">Cancel</Link>
              <button type="button" className="nx-btn nx-btn--primary" onClick={() => setTab('owner')}>
                Next: Primary owner
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Primary owner</h2>
            <p>We will send an invitation link to this person to set their password and sign in as the organisation’s Owner.</p>

            <div className="fm__grid">
              <Field id="co-ofirst" label="First name" error={errors['owner.firstName']}>
                <input id="co-ofirst" value={ownerFirstName} aria-invalid={Boolean(errors['owner.firstName'])}
                  onChange={(e) => setOwnerFirstName(e.target.value)} />
              </Field>

              <Field id="co-olast" label="Last name" error={errors['owner.lastName']}>
                <input id="co-olast" value={ownerLastName} aria-invalid={Boolean(errors['owner.lastName'])}
                  onChange={(e) => setOwnerLastName(e.target.value)} />
              </Field>

              <Field id="co-oemail" label="Owner email" error={errors['owner.email']}>
                <input id="co-oemail" type="email" value={ownerEmail} aria-invalid={Boolean(errors['owner.email'])}
                  onChange={(e) => setOwnerEmail(e.target.value)} />
              </Field>

              <Field id="co-ophone" label="Owner phone" error={errors['owner.phone']}>
                <input id="co-ophone" type="tel" value={ownerPhone} aria-invalid={Boolean(errors['owner.phone'])}
                  onChange={(e) => setOwnerPhone(e.target.value)} />
              </Field>
            </div>

            {general ? <p className="ad__error" role="alert">{general}</p> : null}

            <div className="pg-actions">
              <button type="button" className="nx-btn" onClick={() => setTab('org')}>
                Back
              </button>
              <button type="submit" className="nx-btn nx-btn--primary" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create organisation & invite owner'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
