import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { CardSkeleton } from '../../components/Loading';
import { Sheet } from '../../components/Sheet';
import { CallbackUrl } from '../mpesa/DarajaPanel';
import { DARAJA_ENV } from '../mpesa/labels';
import type { DarajaEnvironment } from '../payments/types';
import { Badge, Fact, Field } from '../portfolio/ui';
import { bankKeys, banksErrorMessage, usePayoutAccounts } from './api';
import { checkPayoutAccount } from './rules';
import type { PayoutAccountBody, PayoutAccountDraft } from './rules';
import type { PayoutAccount } from './types';

/**
 * Settings → Payouts (`/app/settings/payouts`): the organisation's M-Pesa B2C account,
 * which sends landlords' remittances by M-Pesa from Hodi. Everyone with `settings:view`
 * sees whether it is set up and its callback addresses; `settings:update` sets it up,
 * changes it and removes it, each with a verification code. Keys and the security
 * credential are write-only.
 */
export function PayoutsPage() {
  const accounts = usePayoutAccounts();
  const canUpdate = useCan('settings:update');
  const [editing, setEditing] = useState<PayoutAccount | 'new' | null>(null);
  const b2c = accounts.data?.find((a) => a.kind === 'MPESA_B2C') ?? null;

  return (
    <div className="pg">
      <div className="ad__callout ad__callout--info bk__intro">
        <p>
          To send landlords their money by M-Pesa from KodiHub, connect a <strong>B2C (bulk disbursement) shortcode</strong>. This is a
          separate account you apply for with Safaricom — the paybill or till you collect rent on can’t send money. Payouts come
          out of the B2C account’s balance, so keep it topped up.
        </p>
        <p>
          You also need an app on the Safaricom Daraja portal with B2C enabled (for the consumer key and secret), the name of
          the API operator (initiator) set up in the M-Pesa org portal, and the <strong>security credential</strong>, which you
          generate on the Daraja portal from that operator’s password. KodiHub never sees the password itself.
        </p>
      </div>

      {accounts.isPending ? <CardSkeleton count={2} />
        : accounts.isError ? <p className="ad__error" role="alert">{banksErrorMessage(accounts.error)}</p>
          : <B2cCard account={b2c} canUpdate={canUpdate} onEdit={() => setEditing(b2c ?? 'new')} />}

      {editing ? <B2cSheet account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function B2cCard({ account, canUpdate, onEdit }: { account: PayoutAccount | null; canUpdate: boolean; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: () => api.delete<unknown>('/payout-accounts/b2c'),
    onSuccess: async () => {
      toast.saved('The M-Pesa payout account was removed.');
      await queryClient.invalidateQueries({ queryKey: bankKeys.payoutAccounts });
    },
    onError: (error) => toast.failed(banksErrorMessage(error)),
  });

  return (
    <section className="mp__card bk__payout" aria-labelledby="b2c-title">
      <header className="mp__cardhead">
        <div>
          <h2 id="b2c-title" className="bk__cardtitle">M-Pesa payouts (B2C)</h2>
          {account ? <span className="ad__sub">{account.name}</span> : null}
        </div>
        <div className="mp__badges">
          {account?.configured
            ? <span className="ad__badge ad__badge--ok">Set up</span>
            : account ? <span className="ad__badge ad__badge--warn">Keys missing</span>
              : <span className="ad__badge ad__badge--off">Not set up</span>}
          {account ? <Badge table={DARAJA_ENV} value={account.environment} /> : null}
        </div>
      </header>

      {account ? (
        <>
          <dl className="pf__facts">
            <Fact label="B2C shortcode"><span className="num">{account.shortcode}</span></Fact>
            <Fact label="Initiator name">{account.initiatorName}</Fact>
            <Fact label="Last changed">{formatDateTime(account.updatedAt)}</Fact>
          </dl>
          {account.callbackUrls ? (
            <>
              <dl className="mp__urls">
                <CallbackUrl label="Result URL" url={account.callbackUrls.result} />
                <CallbackUrl label="Queue timeout URL" url={account.callbackUrls.timeout} />
              </dl>
              <p className="hint mp__hint">KodiHub sends these to Safaricom with each payout. Copy them only if Safaricom support asks.</p>
            </>
          ) : null}
          {account.environment === 'SANDBOX' ? (
            <p className="ad__muted">Sandbox is Safaricom’s test system: payouts don’t move real money. Switch to production when you’re ready.</p>
          ) : null}
        </>
      ) : (
        <p className="ad__muted">
          Not set up: remittances are paid outside KodiHub and then marked paid.
          {canUpdate ? '' : ' Someone who can change settings can set it up.'}
        </p>
      )}

      {canUpdate ? (
        <div className="mp__actions">
          <button type="button" className={`nx-btn nx-btn--sm ${account ? '' : 'nx-btn--primary'}`} onClick={onEdit} disabled={remove.isPending}>
            {account ? 'Change' : 'Set up'}
          </button>
          {account ? (
            <ConfirmDelete size="sm" label="Remove" verb="Remove" what="the M-Pesa payout account" busy={remove.isPending}
              consequence="Deletes the saved keys and credential. Remittances can’t be sent by M-Pesa from KodiHub until it’s set up again. Payouts already sent stay as they are."
              onConfirm={() => remove.mutate()} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type DraftField = keyof PayoutAccountDraft;
const FIELDS: DraftField[] = ['name', 'shortcode', 'environment', 'consumerKey', 'consumerSecret', 'initiatorName', 'securityCredential'];

function B2cSheet({ account, onClose }: { account: PayoutAccount | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const configured = Boolean(account?.configured);
  const [draft, setDraft] = useState<PayoutAccountDraft>({
    name: account?.name ?? '',
    shortcode: account?.shortcode ?? '',
    environment: account?.environment ?? '',
    consumerKey: '',
    consumerSecret: '',
    initiatorName: account?.initiatorName ?? '',
    securityCredential: '',
  });
  const [errors, setErrors] = useState<Partial<Record<DraftField, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const set = (field: DraftField, value: string) => setDraft((d) => ({ ...d, [field]: value }));

  const save = useMutation({
    mutationFn: (body: PayoutAccountBody) => api.put<unknown>('/payout-accounts/b2c', body),
    onSuccess: async () => {
      toast.saved(account ? 'The M-Pesa payout account was changed.' : 'M-Pesa payouts are set up.');
      await queryClient.invalidateQueries({ queryKey: bankKeys.payoutAccounts });
      onClose();
    },
    onError: (error) => {
      const fieldErrors: Partial<Record<DraftField, string>> = {};
      if (error instanceof ApiError && error.status === 422) {
        for (const f of FIELDS) if (error.fieldErrors[f]) fieldErrors[f] = error.fieldErrors[f];
      }
      setErrors(fieldErrors);
      setGeneral(Object.keys(fieldErrors).length > 0 ? null : banksErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const checked = checkPayoutAccount(draft, configured);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    save.mutate(checked.body);
  };

  const envs: DarajaEnvironment[] = ['SANDBOX', 'PRODUCTION'];
  const keepHint = configured ? 'Leave blank to keep the saved one.' : undefined;
  const secret = (field: 'consumerKey' | 'consumerSecret' | 'securityCredential', label: string, hint?: string, wide = false) => (
    <Field id={`b2c-${field}`} label={label} optional={configured} error={errors[field]} hint={[hint, keepHint].filter(Boolean).join(' ') || undefined} wide={wide}>
      <input id={`b2c-${field}`} type="password" autoComplete="new-password" spellCheck={false} value={draft[field]}
        aria-invalid={Boolean(errors[field])} onChange={(e) => set(field, e.target.value)} />
    </Field>
  );

  return (
    <Sheet
      title={account ? 'Change the M-Pesa payout account' : 'Set up M-Pesa payouts'}
      wide
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="b2c-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      <form id="b2c-form" className="sheet-form" onSubmit={submit} noValidate autoComplete="off">
        <p className="ad__muted">
          The keys and the security credential are stored encrypted and never shown again
          {configured ? '; leave any of them blank to keep the saved one.' : '. Keep your own copy.'} Saving asks for a verification code.
        </p>
        <div className={`fld ${errors.environment ? 'is-bad' : ''}`}>
          <span className="fld__label">Environment</span>
          <div className="pf__radios" role="radiogroup" aria-label="Environment">
            {envs.map((env) => (
              <label key={env} className="fld__check">
                <input type="radio" name="b2c-env" checked={draft.environment === env} onChange={() => set('environment', env)} />
                {DARAJA_ENV[env].label}
              </label>
            ))}
          </div>
          {errors.environment ? <span className="fld__err">{errors.environment}</span>
            : <span className="hint">Sandbox is Safaricom’s test system — no real money moves.</span>}
        </div>
        <div className="fm__grid sheet-grid">
          <Field id="b2c-name" label="Name" error={errors.name} hint="For your own reference.">
            <input id="b2c-name" value={draft.name} maxLength={80} placeholder="e.g. Landlord payouts" aria-invalid={Boolean(errors.name)}
              onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field id="b2c-shortcode" label="B2C shortcode" error={errors.shortcode} hint="The bulk disbursement number from Safaricom — not your collection paybill.">
            <input id="b2c-shortcode" inputMode="numeric" maxLength={7} value={draft.shortcode} aria-invalid={Boolean(errors.shortcode)}
              onChange={(e) => set('shortcode', e.target.value)} />
          </Field>
          {secret('consumerKey', 'Consumer key', 'From your Daraja app with B2C enabled.')}
          {secret('consumerSecret', 'Consumer secret')}
          <Field id="b2c-initiator" label="Initiator name" error={errors.initiatorName} hint="The API operator’s user name in the M-Pesa org portal.">
            <input id="b2c-initiator" autoComplete="off" spellCheck={false} value={draft.initiatorName} aria-invalid={Boolean(errors.initiatorName)}
              onChange={(e) => set('initiatorName', e.target.value)} />
          </Field>
          {secret('securityCredential', 'Security credential',
            'Generated on the Daraja portal from the initiator’s password (encrypted with Safaricom’s certificate). Paste the whole text.', true)}
        </div>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}
