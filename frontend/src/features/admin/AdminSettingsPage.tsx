import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { Sheet } from '../../components/Sheet';
import { CallbackUrl } from '../mpesa/DarajaPanel';
import { DARAJA_ENV } from '../mpesa/labels';
import { checkDaraja } from '../mpesa/rules';
import type { DarajaDraft } from '../mpesa/rules';
import { useListFilters } from '../portfolio/hooks';
import { Badge, Field } from '../portfolio/ui';
import { keys, platformErrorMessage, usePlans, usePlatformLocks, usePlatformSettings } from '../platform/api';
import { checkSettings, darajaSettingsBody, settingsDraft } from '../platform/rules';
import type { SettingsBody, SettingsDraft } from '../platform/rules';
import type { PlatformSettings } from '../platform/types';

type SettingsTab = 'billing' | 'security' | 'sms' | 'app';

/**
 * Admin → Settings (`/admin/settings`):
 * - Billing & M-Pesa: due days, grace days, default plan, Hodi's paybill & Daraja keys.
 * - Security & 2FA: require 2FA for platform operators, channel (Email/SMS), and rate-limit lockouts.
 * - SMS (Africa's Talking): username, sender ID, API key (write-only).
 * - App & Maintenance: public signup toggle, mobile app minimum version floor, maintenance mode.
 */
export function AdminSettingsPage() {
  const filters = useListFilters();
  const rawTab = filters.get('tab');
  const tab: SettingsTab = rawTab === 'security' || rawTab === 'sms' || rawTab === 'app' ? rawTab : 'billing';
  const settings = usePlatformSettings();

  if (settings.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (settings.isError) return <div className="pg"><p className="ad__error" role="alert">{platformErrorMessage(settings.error)}</p></div>;

  const s = settings.data;

  return (
    <div className="pg">
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Platform settings">
          <button type="button" role="tab" aria-selected={tab === 'billing'} className="pf__tab" onClick={() => filters.setFilter({ tab: '' })}>
            Billing & M-Pesa
          </button>
          <button type="button" role="tab" aria-selected={tab === 'security'} className="pf__tab" onClick={() => filters.setFilter({ tab: 'security' })}>
            Security & 2FA
          </button>
          <button type="button" role="tab" aria-selected={tab === 'sms'} className="pf__tab" onClick={() => filters.setFilter({ tab: 'sms' })}>
            SMS (Africa’s Talking)
          </button>
          <button type="button" role="tab" aria-selected={tab === 'app'} className="pf__tab" onClick={() => filters.setFilter({ tab: 'app' })}>
            App & Maintenance
          </button>
        </div>
      </div>

      <div className="pg-narrow">
        {tab === 'billing' ? (
          <>
            <SettingsForm key={s.updatedAt ?? JSON.stringify(settingsDraft(s))} settings={s} />
            <DarajaSection settings={s} />
          </>
        ) : tab === 'security' ? (
          <>
            <SecurityTwoFactorForm key={`${s.requireAdminTwoFactor}-${s.adminTwoFactorChannel}`} settings={s} />
            <SecurityLocksSection />
          </>
        ) : tab === 'sms' ? (
          <SmsSettingsForm key={`${s.sms?.username ?? ''}-${s.sms?.senderId ?? ''}-${s.sms?.apiKey}`} settings={s} />
        ) : (
          <AppAndMaintenanceForm
            key={`${s.allowPublicSignup}-${s.minAppVersionCode}-${s.minAppVersionName}-${s.maintenanceMode}`}
            settings={s}
          />
        )}
      </div>
    </div>
  );
}

function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const plans = usePlans();
  const initial = settingsDraft(settings);
  const [draft, setDraft] = useState<SettingsDraft>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsDraft, string>>>({});
  const set = (field: keyof SettingsDraft, value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const dirty = (Object.keys(initial) as (keyof SettingsDraft)[]).some((k) => draft[k] !== initial[k]);

  const save = useMutation({
    mutationFn: (body: SettingsBody) => api.put<unknown>('/platform/settings', body),
    onSuccess: async () => {
      toast.saved('Platform settings saved.');
      await queryClient.invalidateQueries({ queryKey: keys.platform });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) {
        const found: Partial<Record<keyof SettingsDraft, string>> = {};
        for (const f of Object.keys(initial) as (keyof SettingsDraft)[]) if (error.fieldErrors[f]) found[f] = error.fieldErrors[f];
        if (Object.keys(found).length > 0) setErrors(found);
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkSettings(draft);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    save.mutate(checked.body);
  };

  const offered = (plans.data ?? []).filter((p) => p.active || p.id === settings.defaultPlanId);
  const showServerError = save.isError && !(save.error instanceof ApiError && save.error.status === 422 && Object.keys(errors).length > 0);

  return (
    <form className="fm__section" onSubmit={submit} noValidate>
      <h2>Billing rules</h2>
      <p>Invoices are issued on the 1st for the month before. Apply to invoices issued from now on.</p>
      <div className="fm__grid">
        <Field id="ps-due" label="Due after (days)" error={errors.dueDays} hint="Days from the 1st to the due date. 0 to 60.">
          <input id="ps-due" inputMode="numeric" autoComplete="off" maxLength={2} value={draft.dueDays} aria-invalid={Boolean(errors.dueDays)}
            onChange={(e) => set('dueDays', e.target.value)} />
        </Field>
        <Field id="ps-suspend" label="Read-only after (days overdue)" error={errors.suspendAfterDays}
          hint="Until then an overdue organisation only sees a banner. 1 to 180.">
          <input id="ps-suspend" inputMode="numeric" autoComplete="off" maxLength={3} value={draft.suspendAfterDays} aria-invalid={Boolean(errors.suspendAfterDays)}
            onChange={(e) => set('suspendAfterDays', e.target.value)} />
        </Field>
        <Field id="ps-plan" label="Default plan" error={errors.defaultPlanId} hint="What new organisations start on, with its trial.">
          <select id="ps-plan" value={draft.defaultPlanId} onChange={(e) => set('defaultPlanId', e.target.value)} disabled={plans.isPending}>
            <option value="">{plans.isPending ? 'Loading…' : 'None'}</option>
            {offered.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field id="ps-paybill" label="Hodi’s paybill" optional error={errors.paybill}
          hint="Organisations pay to it with their billing account number (H00001).">
          <input id="ps-paybill" inputMode="numeric" autoComplete="off" maxLength={7} value={draft.paybill} aria-invalid={Boolean(errors.paybill)}
            onChange={(e) => set('paybill', e.target.value)} />
        </Field>
      </div>
      {showServerError ? <p className="ad__error" role="alert">{platformErrorMessage(save.error)}</p> : null}
      <div className="pg-actions">
        <button type="button" className="nx-btn" disabled={!dirty || save.isPending} onClick={() => { setDraft(initial); setErrors({}); save.reset(); }}>
          Discard changes
        </button>
        <button type="submit" className="nx-btn nx-btn--primary" disabled={!dirty || save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  );
}

function DarajaSection({ settings }: { settings: PlatformSettings }) {
  const [settingUp, setSettingUp] = useState(false);
  const daraja = settings.daraja;
  const urls = daraja?.callbackUrls;

  return (
    <section className="fm__section" aria-labelledby="ps-daraja">
      <div className="mp__cardhead">
        <h2 id="ps-daraja">Hodi’s M-Pesa connection</h2>
        <div className="mp__badges">
          {daraja?.configured ? <span className="ad__badge ad__badge--ok">Connected</span> : <span className="ad__badge ad__badge--off">Not connected</span>}
          {daraja?.configured && daraja.environment ? <Badge table={DARAJA_ENV} value={daraja.environment} /> : null}
          {daraja?.configured ? (
            daraja.passkey === false
              ? <span className="ad__badge ad__badge--warn">No passkey</span>
              : daraja.passkey ? <span className="ad__badge ad__badge--ok">Passkey saved</span> : null
          ) : null}
        </div>
      </div>
      <p>
        Hodi’s own Daraja app for its paybill: organisations’ “Pay now” prompts go out through it, and payments to the paybill
        with a billing account number are matched automatically. Without it, organisations pay to the paybill and you record the payment.
      </p>
      {daraja?.configured && daraja.passkey === false ? (
        <p className="hint">Without the passkey, organisations can’t pay from the app; paybill payments are still matched.</p>
      ) : null}
      {urls ? (
        <>
          <dl className="mp__urls">
            <CallbackUrl label="Payment prompts (STK) results" url={urls.stk} />
            <CallbackUrl label="Paybill confirmation" url={urls.c2bConfirm} />
            <CallbackUrl label="Paybill validation" url={urls.c2bValidate} />
          </dl>
          <p className="hint mp__hint">Register the confirmation and validation URLs for Hodi’s paybill with Safaricom. Keep them private.</p>
        </>
      ) : null}
      {settings.updatedAt ? <p className="hint">Settings last changed {formatDateTime(settings.updatedAt)}.</p> : null}
      <div className="mp__actions">
        <button type="button" className={`nx-btn ${daraja?.configured ? '' : 'nx-btn--primary'}`} onClick={() => setSettingUp(true)}>
          {daraja?.configured ? 'Change keys' : 'Set up'}
        </button>
      </div>
      {settingUp ? <DarajaKeysSheet settings={settings} onClose={() => setSettingUp(false)} /> : null}
    </section>
  );
}

function DarajaKeysSheet({ settings, onClose }: { settings: PlatformSettings; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const configured = Boolean(settings.daraja?.configured);
  const [draft, setDraft] = useState<DarajaDraft>({
    environment: settings.daraja?.environment ?? '', consumerKey: '', consumerSecret: '', passkey: '', storeNumber: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof DarajaDraft, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const set = (field: keyof DarajaDraft, value: string) => setDraft((d) => ({ ...d, [field]: value }));

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<unknown>('/platform/settings', body),
    onSuccess: async () => {
      toast.saved(configured ? 'Hodi’s M-Pesa keys were changed.' : 'Hodi’s paybill is connected to M-Pesa.');
      await queryClient.invalidateQueries({ queryKey: keys.platform });
      onClose();
    },
    onError: (error) => {
      const found: Partial<Record<keyof DarajaDraft, string>> = {};
      if (error instanceof ApiError && error.status === 422) {
        const byField = error.fieldErrors;
        if (byField.darajaEnvironment) found.environment = byField.darajaEnvironment;
        for (const f of ['consumerKey', 'consumerSecret', 'passkey'] as const) if (byField[f]) found[f] = byField[f];
      }
      setErrors(found);
      setGeneral(Object.keys(found).length > 0 ? null : platformErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const checked = checkDaraja(draft);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    save.mutate(darajaSettingsBody(checked.body));
  };

  return (
    <Sheet
      title={configured ? 'Change Hodi’s M-Pesa keys' : 'Connect Hodi’s paybill to M-Pesa'}
      wide
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="hodi-daraja" className="nx-btn nx-btn--primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save keys'}</button>
        </>
      )}
    >
      <form id="hodi-daraja" className="sheet-form" onSubmit={submit} noValidate autoComplete="off">
        <p className="ad__muted">
          From Hodi’s app on the Safaricom Daraja portal. The keys are stored encrypted and never shown again —
          {configured ? ' enter all of them again to change any one.' : ' keep your own copy.'} Saving asks for a verification code.
        </p>
        <div className={`fld ${errors.environment ? 'is-bad' : ''}`}>
          <span className="fld__label">Environment</span>
          <div className="pf__radios" role="radiogroup" aria-label="Environment">
            {(['SANDBOX', 'PRODUCTION'] as const).map((env) => (
              <label key={env} className="fld__check">
                <input type="radio" name="hodi-env" checked={draft.environment === env} onChange={() => set('environment', env)} />
                {DARAJA_ENV[env].label}
              </label>
            ))}
          </div>
          {errors.environment ? <span className="fld__err">{errors.environment}</span> : null}
        </div>
        <div className="fm__grid sheet-grid">
          <Field id="hd-key" label="Consumer key" error={errors.consumerKey}>
            <input id="hd-key" type="password" autoComplete="new-password" spellCheck={false} value={draft.consumerKey}
              aria-invalid={Boolean(errors.consumerKey)} onChange={(e) => set('consumerKey', e.target.value)} />
          </Field>
          <Field id="hd-secret" label="Consumer secret" error={errors.consumerSecret}>
            <input id="hd-secret" type="password" autoComplete="new-password" spellCheck={false} value={draft.consumerSecret}
              aria-invalid={Boolean(errors.consumerSecret)} onChange={(e) => set('consumerSecret', e.target.value)} />
          </Field>
          <Field id="hd-passkey" label="Passkey" optional wide error={errors.passkey}
            hint="Lipa na M-Pesa Online passkey. Needed for organisations to pay from the app.">
            <input id="hd-passkey" type="password" autoComplete="new-password" spellCheck={false} value={draft.passkey}
              aria-invalid={Boolean(errors.passkey)} onChange={(e) => set('passkey', e.target.value)} />
          </Field>
        </div>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

function SecurityTwoFactorForm({ settings }: { settings: PlatformSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [require2fa, setRequire2fa] = useState(Boolean(settings.requireAdminTwoFactor));
  const [channel, setChannel] = useState<'EMAIL' | 'SMS'>(settings.adminTwoFactorChannel ?? 'EMAIL');

  const dirty = require2fa !== Boolean(settings.requireAdminTwoFactor) || channel !== (settings.adminTwoFactorChannel ?? 'EMAIL');

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<unknown>('/platform/settings', body),
    onSuccess: async () => {
      toast.saved('Admin two-factor authentication settings saved.');
      await queryClient.invalidateQueries({ queryKey: keys.platform });
    },
    onError: (error) => toast.failed(platformErrorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({
      requireAdminTwoFactor: require2fa,
      adminTwoFactorChannel: channel,
    });
  };

  return (
    <form className="fm__section" onSubmit={submit} noValidate>
      <div className="mp__cardhead">
        <h2>Admin two-factor authentication (2FA)</h2>
        <span className={`ad__badge ${require2fa ? 'ad__badge--ok' : 'ad__badge--off'}`}>
          {require2fa ? 'Required' : 'Optional'}
        </span>
      </div>
      <p>
        When enabled, every Superadmin and Salesperson signing in with a password must also enter a 6-digit one-time verification code.
      </p>

      <div className="fm__grid">
        <div className="fld fld--wide">
          <label className="fld__check">
            <input
              type="checkbox"
              checked={require2fa}
              onChange={(e) => setRequire2fa(e.target.checked)}
            />
            Require a 6-digit verification code on password sign-in for all platform operators
          </label>
        </div>
        <Field id="s2-channel" label="Delivery channel" hint="Falls back to email if an operator has no phone number on file.">
          <select id="s2-channel" value={channel} onChange={(e) => setChannel(e.target.value as 'EMAIL' | 'SMS')}>
            <option value="EMAIL">Email</option>
            <option value="SMS">SMS (falls back to Email)</option>
          </select>
        </Field>
      </div>

      <div className="pg-actions">
        <button type="submit" className="nx-btn nx-btn--primary" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save 2FA settings'}
        </button>
      </div>
    </form>
  );
}

function SecurityLocksSection() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const locks = usePlatformLocks();

  const clear = useMutation({
    mutationFn: (key?: string) =>
      api.post<unknown>('/platform/security/locks/clear', key ? { key } : {}),
    onSuccess: async () => {
      toast.saved('Rate-limit locks cleared.');
      await queryClient.invalidateQueries({ queryKey: keys.locks });
    },
    onError: (error) => toast.failed(platformErrorMessage(error)),
  });

  const rows = locks.data ?? [];

  return (
    <section className="fm__section" aria-labelledby="sl-title">
      <div className="mp__cardhead">
        <h2 id="sl-title">Active OTP & login rate-limit counters</h2>
        {rows.length > 0 ? (
          <button
            type="button"
            className="nx-btn nx-btn--sm nx-btn--danger"
            disabled={clear.isPending}
            onClick={() => clear.mutate(undefined)}
          >
            Clear all locks
          </button>
        ) : null}
      </div>
      <p>
        Accounts or IP addresses that repeatedly enter wrong passwords or OTP codes are temporarily throttled.
        You can clear a counter here if a legitimate user is locked out.
      </p>

      {locks.isPending ? (
        <p className="ad__muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No active lockouts" detail="No accounts or IP addresses are currently throttled." />
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table ad__table--compact">
            <thead>
              <tr>
                <th>Bucket key</th>
                <th className="num">Attempts</th>
                <th>Expires at</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td><strong className="num">{row.key}</strong></td>
                  <td className="num">{row.count}</td>
                  <td>{formatDateTime(row.expiresAt)}</td>
                  <td className="ad__rowactions">
                    <div>
                      <button
                        type="button"
                        className="nx-btn nx-btn--sm"
                        disabled={clear.isPending}
                        onClick={() => clear.mutate(row.key)}
                      >
                        Clear
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SmsSettingsForm({ settings }: { settings: PlatformSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [username, setUsername] = useState(settings.sms?.username ?? '');
  const [senderId, setSenderId] = useState(settings.sms?.senderId ?? '');
  const [apiKey, setApiKey] = useState('');
  const apiKeySet = Boolean(settings.sms?.apiKeySet ?? settings.sms?.apiKey);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<unknown>('/platform/settings', body),
    onSuccess: async () => {
      toast.saved('Africa’s Talking SMS settings saved.');
      setApiKey('');
      await queryClient.invalidateQueries({ queryKey: keys.platform });
    },
    onError: (error) => toast.failed(platformErrorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({
      atUsername: username.trim() || null,
      atSenderId: senderId.trim() || null,
      ...(apiKey ? { atApiKey: apiKey } : {}),
    });
  };

  return (
    <form className="fm__section" onSubmit={submit} noValidate autoComplete="off">
      <div className="mp__cardhead">
        <h2>Africa’s Talking SMS gateway</h2>
        <div className="mp__badges">
          {settings.sms?.configured
            ? <span className="ad__badge ad__badge--ok">Configured</span>
            : <span className="ad__badge ad__badge--off">Using environment / log</span>}
          {apiKeySet ? <span className="ad__badge ad__badge--info">API key saved</span> : null}
        </div>
      </div>
      <p>
        Used for OTP verification codes, owner invitations, and tenant rent receipts sent by SMS.
      </p>

      <div className="fm__grid">
        <Field id="at-user" label="Username" hint="e.g. sandbox or your production Africa’s Talking username">
          <input id="at-user" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field id="at-sender" label="Sender ID / shortcode" optional hint="e.g. HODI">
          <input id="at-sender" value={senderId} onChange={(e) => setSenderId(e.target.value)} />
        </Field>
        <Field id="at-key" label="API key" optional wide
          hint={apiKeySet ? 'Stored encrypted. Leave blank to keep the current API key.' : 'Stored encrypted and never shown again.'}>
          <input id="at-key" type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </Field>
      </div>

      <div className="pg-actions">
        <button type="submit" className="nx-btn nx-btn--primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save SMS settings'}
        </button>
      </div>
    </form>
  );
}

function AppAndMaintenanceForm({ settings }: { settings: PlatformSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [allowPublicSignup, setAllowPublicSignup] = useState(settings.allowPublicSignup ?? true);
  const [minVersionCode, setMinVersionCode] = useState(String(settings.minAppVersionCode ?? 1));
  const [minVersionName, setMinVersionName] = useState(settings.minAppVersionName ?? '1.0.0');
  const [appStoreUrl, setAppStoreUrl] = useState(settings.appStoreUrl ?? '');
  const [appUpdateMessage, setAppUpdateMessage] = useState(settings.appUpdateMessage ?? '');
  const [maintenanceMode, setMaintenanceMode] = useState(Boolean(settings.maintenanceMode));
  const [maintenanceMessage, setMaintenanceMessage] = useState(settings.maintenanceMessage ?? '');

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<unknown>('/platform/settings', body),
    onSuccess: async () => {
      toast.saved('App & maintenance settings saved.');
      await queryClient.invalidateQueries({ queryKey: keys.platform });
    },
    onError: (error) => toast.failed(platformErrorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsedCode = Math.max(1, Number.parseInt(minVersionCode, 10) || 1);
    save.mutate({
      allowPublicSignup,
      minAppVersionCode: parsedCode,
      minAppVersionName: minVersionName.trim() || '1.0.0',
      appStoreUrl: appStoreUrl.trim() || null,
      appUpdateMessage: appUpdateMessage.trim() || null,
      maintenanceMode,
      maintenanceMessage: maintenanceMessage.trim() || null,
    });
  };

  return (
    <form className="fm__section" onSubmit={submit} noValidate>
      <h2>Signup, mobile app version & maintenance</h2>
      <p>Control self-service organisation registration, enforce a minimum mobile app version, or display a maintenance notice.</p>

      <div className="fm__grid">
        <div className="fld fld--wide">
          <label className="fld__check">
            <input type="checkbox" checked={allowPublicSignup} onChange={(e) => setAllowPublicSignup(e.target.checked)} />
            Allow public organisation sign-up (when unchecked, only platform operators can create organisations)
          </label>
        </div>

        <Field id="am-vcode" label="Minimum app version code" hint="Integer build number, e.g. 1">
          <input id="am-vcode" inputMode="numeric" value={minVersionCode} onChange={(e) => setMinVersionCode(e.target.value)} />
        </Field>
        <Field id="am-vname" label="Minimum app version name" hint="e.g. 1.0.0">
          <input id="am-vname" value={minVersionName} onChange={(e) => setMinVersionName(e.target.value)} />
        </Field>
        <Field id="am-store" label="App store URL" optional wide>
          <input id="am-store" value={appStoreUrl} onChange={(e) => setAppStoreUrl(e.target.value)} placeholder="https://play.google.com/store/apps/details?id=..." />
        </Field>
        <Field id="am-upmsg" label="Update required message" optional wide>
          <input id="am-upmsg" value={appUpdateMessage} onChange={(e) => setAppUpdateMessage(e.target.value)} />
        </Field>

        <div className="fld fld--wide">
          <label className="fld__check">
            <input type="checkbox" checked={maintenanceMode} onChange={(e) => setMaintenanceMode(e.target.checked)} />
            Enable maintenance mode banner across Hodi
          </label>
        </div>
        <Field id="am-maint" label="Maintenance message" optional wide>
          <textarea id="am-maint" rows={2} value={maintenanceMessage} onChange={(e) => setMaintenanceMessage(e.target.value)} />
        </Field>
      </div>

      <div className="pg-actions">
        <button type="submit" className="nx-btn nx-btn--primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save app & maintenance settings'}
        </button>
      </div>
    </form>
  );
}
