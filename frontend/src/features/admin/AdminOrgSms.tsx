import { useState } from 'react';
import type { FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { formatDateTime } from '../../lib/dates';
import { formatKES, parseAmount } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { CardSkeleton, TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { unwrap } from '../payments/rules';
import { Fact, Field } from '../portfolio/ui';
import { keys, platformErrorMessage } from '../platform/api';
import { PROVIDER_LABEL, smsModeLabel, usageStatusLabel } from '../sms/rules';
import { SmsLogSheet } from './SmsLogSheet';
import { smsTypeLabel } from './smsLog';
import type { SmsAccountView, SmsProvider, SmsTopUpRow, SmsUsageRow } from '../sms/types';
import { adjustProblem } from './smsAdmin';

type AdminSmsView = SmsAccountView & {
  providerUser: string | null;
  sandbox: boolean;
  hasApiKey: boolean;
  hasPassword: boolean;
  unitPriceOverride: string | null;
};

/**
 * Admin → Organisation → SMS: how this organisation's messages are sent (KodiHub SMS or its
 * own TextSMS / Africa's Talking / HostPinnacle account), a test SMS through its account, its
 * own unit price, and its units (add or remove with a reason), usage and top-ups.
 */
export function AdminOrgSms({ orgId }: { orgId: string }) {
  const base = `/platform/organizations/${encodeURIComponent(orgId)}/sms`;
  const account = useQuery({
    queryKey: [...keys.organizations, orgId, 'sms'],
    queryFn: () => api.get<unknown>(base).then((b) => unwrap<AdminSmsView>(b)),
  });
  if (account.isPending) return <CardSkeleton count={2} />;
  if (account.isError) return <p className="ad__error" role="alert">{platformErrorMessage(account.error)}</p>;
  const a = account.data;
  return (
    <div className="hb">
      <div className="hb__top">
        <section className="ag__card" aria-labelledby="osms-now">
          <h3 id="osms-now">SMS now</h3>
          <p className="ad__muted">{a.mode === 'PLATFORM' ? 'KodiHub sends its SMS' : smsModeLabel(a).replace('Your own', 'Its own')}</p>
          <dl className="pf__facts hb__facts">
            <Fact label="Units left">{a.balance.toLocaleString('en-KE')}</Fact>
            <Fact label="Bought">{a.unitsBought.toLocaleString('en-KE')}</Fact>
            <Fact label="Used">{a.unitsUsed.toLocaleString('en-KE')}</Fact>
            <Fact label="Price per unit">{formatKES(Number(a.unitPrice))}{a.unitPriceOverride ? ' (own price)' : ''}</Fact>
          </dl>
          {a.failing ? <p className="hb__overdue">Failing since {formatDateTime(a.failing.since)}: {a.failing.reason}</p> : null}
        </section>
        <AdjustCard orgId={orgId} base={base} balance={a.balance} />
      </div>
      <SetupForm key={`${a.mode}-${a.provider}-${a.senderId}-${a.unitPriceOverride}`} orgId={orgId} base={base} account={a} />
      <AdminLists base={base} orgId={orgId} />
    </div>
  );
}

function SetupForm({ orgId, base, account }: { orgId: string; base: string; account: AdminSmsView }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState(account.mode);
  const [provider, setProvider] = useState<SmsProvider>(account.provider ?? 'TEXTSMS');
  const [user, setUser] = useState(account.providerUser ?? '');
  const [senderId, setSenderId] = useState(account.senderId ?? '');
  const [apiKey, setApiKey] = useState('');
  const [password, setPassword] = useState('');
  const [sandbox, setSandbox] = useState(account.sandbox);
  const [price, setPrice] = useState(account.unitPriceOverride ? (Number(account.unitPriceOverride) / 100).toFixed(2) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const sameProvider = provider === account.provider;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<unknown>(base, body),
    onSuccess: async () => {
      toast.saved('Organisation SMS saved.');
      await queryClient.invalidateQueries({ queryKey: [...keys.organizations, orgId, 'sms'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) {
        setErrors(error.fieldErrors as Record<string, string>);
        return;
      }
      toast.failed(platformErrorMessage(error));
    },
  });
  const test = useMutation({
    mutationFn: () => api.post<unknown>(`${base}/test`, { phone: testPhone }).then((b) => unwrap<{ sent: boolean; reason: string | null }>(b)),
    onSuccess: (r) => setTestResult(r.sent ? 'Sent. Check the phone.' : `Not sent: ${r.reason ?? 'the provider refused it'}`),
    onError: (error) => setTestResult(platformErrorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    let unitPrice: string | null = null;
    if (price.trim()) {
      const parsed = parseAmount(price);
      if (!parsed.ok || parsed.minor <= 0) found.unitPrice = 'Enter a price above KES 0, or leave it empty';
      else unitPrice = String(parsed.minor);
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    save.mutate({
      mode,
      unitPrice,
      ...(mode === 'OWN'
        ? {
            provider,
            providerUser: user.trim(),
            senderId: senderId.trim(),
            sandbox,
            ...(apiKey ? { apiKey } : {}),
            ...(password ? { password } : {}),
          }
        : {}),
    });
  };

  const userLabel = { AFRICASTALKING: 'Username', TEXTSMS: 'Partner ID', HOSTPINNACLE: 'User ID' }[provider];

  return (
    <form className="fm__section" onSubmit={submit} noValidate autoComplete="off">
      <h2>How this organisation’s SMS is sent</h2>
      <fieldset className="sms__bundles">
        <legend className="sr-only">SMS mode</legend>
        <label className="sms__bundle">
          <input type="radio" name="osms-mode" checked={mode === 'PLATFORM'} onChange={() => setMode('PLATFORM')} />
          <span>KodiHub sends its SMS (paid with SMS units)</span>
          <span />
        </label>
        <label className="sms__bundle">
          <input type="radio" name="osms-mode" checked={mode === 'OWN'} onChange={() => setMode('OWN')} />
          <span>Its own SMS account and sender ID</span>
          <span />
        </label>
      </fieldset>

      {mode === 'OWN' ? (
        <div className="fm__grid">
          <Field id="osms-provider" label="Provider" error={errors.provider}>
            <select id="osms-provider" value={provider} onChange={(e) => setProvider(e.target.value as SmsProvider)}>
              {(Object.keys(PROVIDER_LABEL) as SmsProvider[]).map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
            </select>
          </Field>
          <Field id="osms-user" label={userLabel} error={errors.providerUser}>
            <input id="osms-user" value={user} onChange={(e) => setUser(e.target.value)} />
          </Field>
          <Field id="osms-sender" label="Sender ID" error={errors.senderId} hint="As approved by the provider, e.g. MAKINI">
            <input id="osms-sender" value={senderId} maxLength={20} onChange={(e) => setSenderId(e.target.value)} />
          </Field>
          <Field id="osms-key" label="API key" error={errors.apiKey}
            hint={account.hasApiKey && sameProvider ? 'Saved — enter a new key to replace it.' : 'Stored encrypted and never shown again.'}>
            <input id="osms-key" type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </Field>
          {provider === 'HOSTPINNACLE' ? (
            <Field id="osms-password" label="Password" error={errors.password}
              hint={account.hasPassword && sameProvider ? 'Saved — enter a new one to replace it.' : 'Stored encrypted and never shown again.'}>
              <input id="osms-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          ) : null}
          {provider === 'AFRICASTALKING' ? (
            <div className="fld">
              <label className="fld__check">
                <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} /> Sandbox
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="fm__grid">
        <Field id="osms-price" label="Own price per unit (KES)" optional error={errors.unitPrice}
          hint="Leave empty to use KodiHub’s price.">
          <input id="osms-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>

      <div className="pg-actions">
        <button type="submit" className="nx-btn nx-btn--primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {account.mode === 'OWN' ? (
        <div className="sms__test">
          <Field id="osms-test" label="Send a test SMS through its account" hint={testResult ?? 'Uses the saved details. Save first if you changed them.'}>
            <input id="osms-test" type="tel" inputMode="tel" placeholder="0712 345 678" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
          </Field>
          <button type="button" className="nx-btn" disabled={test.isPending || !testPhone.trim()} onClick={() => { setTestResult(null); test.mutate(); }}>
            {test.isPending ? 'Sending…' : 'Send test SMS'}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function AdjustCard({ orgId, base, balance }: { orgId: string; base: string; balance: number }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [units, setUnits] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const adjust = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<unknown>(`${base}/adjust`, body),
    onSuccess: async () => {
      toast.saved('Units updated.');
      setUnits('');
      setReason('');
      await queryClient.invalidateQueries({ queryKey: [...keys.organizations, orgId, 'sms'] });
    },
    onError: (e) => setError(platformErrorMessage(e)),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const n = Number(units);
    const problem = adjustProblem(n, balance, reason);
    setError(problem);
    if (!problem) adjust.mutate({ units: n, reason: reason.trim() });
  };
  return (
    <section className="ag__card" aria-labelledby="osms-adjust">
      <h3 id="osms-adjust">Add or remove units</h3>
      <form onSubmit={submit} noValidate className="sms__form">
        <div className="fld">
          <label htmlFor="osms-units">Units (negative removes)</label>
          <input id="osms-units" inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} />
        </div>
        <div className="fld">
          <label htmlFor="osms-reason">Reason</label>
          <input id="osms-reason" value={reason} maxLength={200} placeholder="e.g. Paid by bank transfer" onChange={(e) => setReason(e.target.value)} />
        </div>
        {error ? <p className="fld__err" role="alert">{error}</p> : null}
        <button type="submit" className="nx-btn nx-btn--sm" disabled={adjust.isPending}>{adjust.isPending ? 'Saving…' : 'Apply'}</button>
      </form>
    </section>
  );
}

function AdminLists({ base, orgId }: { base: string; orgId: string }) {
  const [list, setList] = useState<'usage' | 'top-ups'>('usage');
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<string | null>(null);
  const query = useQuery({
    queryKey: [...keys.organizations, orgId, 'sms', list, page],
    queryFn: () => api.get<PageEnvelope<SmsUsageRow | SmsTopUpRow>>(`${base}/${list}`, { page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  return (
    <section className="fm__section">
      {opened ? <SmsLogSheet id={opened} onClose={() => setOpened(null)} /> : null}
      <div className="pf__tabs" role="tablist" aria-label="SMS lists">
        <button type="button" role="tab" aria-selected={list === 'usage'} className="pf__tab" onClick={() => { setList('usage'); setPage(1); }}>Messages sent</button>
        <button type="button" role="tab" aria-selected={list === 'top-ups'} className="pf__tab" onClick={() => { setList('top-ups'); setPage(1); }}>Top-ups</button>
      </div>
      {query.isPending ? <TableSkeleton rows={4} /> : query.isError ? (
        <p className="ad__error" role="alert">{platformErrorMessage(query.error)}</p>
      ) : query.data.data.length === 0 ? (
        <EmptyState title="Nothing yet" detail={list === 'usage' ? 'Messages this organisation sends show here.' : 'Units bought or added show here.'} />
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              {list === 'usage'
                ? <tr><th>When</th><th>To</th><th>Message</th><th className="num">Units</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
                : <tr><th>When</th><th className="num">Units</th><th className="num">Paid</th><th>How</th><th className="num">Balance after</th></tr>}
            </thead>
            <tbody>
              {list === 'usage'
                ? (query.data.data as SmsUsageRow[]).map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.at)}</td><td className="num">{r.to}</td><td>{smsTypeLabel(r.type)}</td>
                    <td className="num">{r.units}</td>
                    <td>{usageStatusLabel(r.status)}{r.reason ? <span className="ad__sub">{r.reason}</span> : null}</td>
                    <td className="ad__rowactions"><div>
                      <button type="button" className="nx-btn nx-btn--sm" onClick={() => setOpened(r.id)}
                        aria-label={`Open the ${smsTypeLabel(r.type).toLowerCase()} SMS to ${r.to}`}>Open</button>
                    </div></td>
                  </tr>
                ))
                : (query.data.data as SmsTopUpRow[]).map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.at)}</td>
                    <td className="num">{r.units > 0 ? `+${r.units}` : r.units}</td>
                    <td className="num">{r.amount ? formatKES(Number(r.amount)) : '—'}</td>
                    <td>{r.kind === 'PURCHASE' ? 'M-Pesa' : 'Added by KodiHub'}{r.reason ? <span className="ad__sub">{r.reason}</span> : null}</td>
                    <td className="num">{r.balanceAfter}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={query.data?.meta} onPage={setPage} />
    </section>
  );
}
