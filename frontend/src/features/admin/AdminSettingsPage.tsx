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
import type {
  LandingFeatureItem,
  LandingHeroStat,
  LandingPageContent,
  LandingPortalItem,
  PlatformSettings,
} from '../platform/types';

type SettingsTab =
  | 'billing'
  | 'documents'
  | 'landing'
  | 'mpesa'
  | 'security'
  | 'locks'
  | 'sms'
  | 'app';

/**
 * Admin → Settings (`/admin/settings`):
 * - Billing rules: due days, grace days, default plan, KodiHub's paybill.
 * - Document instructions: system-wide footer/notice instructions for invoices and receipts.
 * - Landing page: environment-specific marketing site content (`kodihub.co.ke` in prod, `landing.kodihub.co.ke` in dev).
 * - M-Pesa (Daraja): KodiHub's Daraja keys & callback URLs.
 * - Admin 2FA: require 2FA for platform operators & channel (Email/SMS).
 * - Rate-limit locks: active OTP & login rate-limit lockouts.
 * - SMS (Africa's Talking): username, sender ID, API key (write-only).
 * - App & Maintenance: public signup toggle, mobile app minimum version floor, maintenance mode.
 */
export function AdminSettingsPage() {
  const filters = useListFilters();
  const rawTab = filters.get('tab');
  const tab: SettingsTab =
    rawTab === 'documents' ||
    rawTab === 'landing' ||
    rawTab === 'mpesa' ||
    rawTab === 'security' ||
    rawTab === 'locks' ||
    rawTab === 'sms' ||
    rawTab === 'app'
      ? rawTab
      : 'billing';
  const settings = usePlatformSettings();

  if (settings.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (settings.isError) return <div className="pg"><p className="ad__error" role="alert">{platformErrorMessage(settings.error)}</p></div>;

  const s = settings.data;

  return (
    <div className="pg">
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Platform settings">
          <button type="button" role="tab" aria-selected={tab === 'billing'} className="pf__tab" onClick={() => filters.setFilter({ tab: '' })}>
            Billing rules
          </button>
          <button type="button" role="tab" aria-selected={tab === 'documents'} className="pf__tab" onClick={() => filters.setFilter({ tab: 'documents' })}>
            Document instructions
          </button>
          <button type="button" role="tab" aria-selected={tab === 'landing'} className="pf__tab" onClick={() => filters.setFilter({ tab: 'landing' })}>
            Landing page
          </button>
          <button type="button" role="tab" aria-selected={tab === 'mpesa'} className="pf__tab" onClick={() => filters.setFilter({ tab: 'mpesa' })}>
            M-Pesa (Daraja)
          </button>
          <button type="button" role="tab" aria-selected={tab === 'security'} className="pf__tab" onClick={() => filters.setFilter({ tab: 'security' })}>
            Admin 2FA
          </button>
          <button type="button" role="tab" aria-selected={tab === 'locks'} className="pf__tab" onClick={() => filters.setFilter({ tab: 'locks' })}>
            Rate-limit locks
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
          <SettingsForm key={s.updatedAt ?? JSON.stringify(settingsDraft(s))} settings={s} />
        ) : tab === 'documents' ? (
          <DocumentInstructionsForm
            key={`${s.invoiceInstructions ?? ''}-${s.receiptInstructions ?? ''}`}
            settings={s}
          />
        ) : tab === 'landing' ? (
          <LandingPageForm key={s.updatedAt ?? 'landing'} settings={s} />
        ) : tab === 'mpesa' ? (
          <DarajaSection settings={s} />
        ) : tab === 'security' ? (
          <SecurityTwoFactorForm key={`${s.requireAdminTwoFactor}-${s.adminTwoFactorChannel}`} settings={s} />
        ) : tab === 'locks' ? (
          <SecurityLocksSection />
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
        <Field id="ps-paybill" label="KodiHub’s paybill" optional error={errors.paybill}
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
        <h2 id="ps-daraja">KodiHub’s M-Pesa connection</h2>
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
        KodiHub’s own Daraja app for its paybill: organisations’ “Pay now” prompts go out through it, and payments to the paybill
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
          <p className="hint mp__hint">Register the confirmation and validation URLs for KodiHub’s paybill with Safaricom. Keep them private.</p>
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
      toast.saved(configured ? 'KodiHub’s M-Pesa keys were changed.' : 'KodiHub’s paybill is connected to M-Pesa.');
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
      title={configured ? 'Change KodiHub’s M-Pesa keys' : 'Connect KodiHub’s paybill to M-Pesa'}
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
          From KodiHub’s app on the Safaricom Daraja portal. The keys are stored encrypted and never shown again —
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
            Enable maintenance mode banner across KodiHub
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

const DEFAULT_SYSTEM_INVOICE_INSTRUCTIONS =
  'Please quote your Account / Reference Code exactly when making payment so your account is credited automatically.';
const DEFAULT_SYSTEM_RECEIPT_INSTRUCTIONS =
  'This is an official computer-generated payment receipt. Retain this document as proof of payment.';

function DocumentInstructionsForm({ settings }: { settings: PlatformSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const initialInvoice = settings.invoiceInstructions ?? DEFAULT_SYSTEM_INVOICE_INSTRUCTIONS;
  const initialReceipt = settings.receiptInstructions ?? DEFAULT_SYSTEM_RECEIPT_INSTRUCTIONS;
  const [invoiceInstructions, setInvoiceInstructions] = useState(initialInvoice);
  const [receiptInstructions, setReceiptInstructions] = useState(initialReceipt);

  const dirty =
    invoiceInstructions !== initialInvoice || receiptInstructions !== initialReceipt;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<unknown>('/platform/settings', body),
    onSuccess: async () => {
      toast.saved('System document instructions saved.');
      await queryClient.invalidateQueries({ queryKey: keys.platform });
    },
    onError: (error) => toast.failed(platformErrorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({
      invoiceInstructions: invoiceInstructions.trim() || null,
      receiptInstructions: receiptInstructions.trim() || null,
    });
  };

  return (
    <form className="fm__section" onSubmit={submit} noValidate>
      <h2>System document instructions (PDFs)</h2>
      <p>
        System-wide notices printed at the bottom of every invoice and payment receipt PDF across
        all organisations. Each organisation can also add its own organisation-specific invoice and
        receipt instructions under <strong>Settings → Organisation → Billing</strong>.
      </p>

      <div className="fm__grid">
        <Field
          id="doc-inv-inst"
          label="System invoice instructions"
          optional
          wide
          hint="Printed under SYSTEM NOTICE on every tenant invoice and platform invoice PDF."
        >
          <textarea
            id="doc-inv-inst"
            rows={3}
            maxLength={1000}
            value={invoiceInstructions}
            onChange={(e) => setInvoiceInstructions(e.target.value)}
            placeholder={DEFAULT_SYSTEM_INVOICE_INSTRUCTIONS}
          />
        </Field>
        <Field
          id="doc-rct-inst"
          label="System receipt instructions"
          optional
          wide
          hint="Printed under SYSTEM NOTICE on every payment receipt PDF."
        >
          <textarea
            id="doc-rct-inst"
            rows={3}
            maxLength={1000}
            value={receiptInstructions}
            onChange={(e) => setReceiptInstructions(e.target.value)}
            placeholder={DEFAULT_SYSTEM_RECEIPT_INSTRUCTIONS}
          />
        </Field>
      </div>

      <div className="pg-actions">
        <button
          type="button"
          className="nx-btn"
          disabled={save.isPending}
          onClick={() => {
            setInvoiceInstructions(DEFAULT_SYSTEM_INVOICE_INSTRUCTIONS);
            setReceiptInstructions(DEFAULT_SYSTEM_RECEIPT_INSTRUCTIONS);
          }}
        >
          Restore defaults
        </button>
        <button
          type="submit"
          className="nx-btn nx-btn--primary"
          disabled={!dirty || save.isPending}
        >
          {save.isPending ? 'Saving…' : 'Save document instructions'}
        </button>
      </div>
    </form>
  );
}

const DEFAULT_LANDING_PAGE: LandingPageContent = {
  brandName: 'KodiHub',
  pageTitle: 'KodiHub — Property, Rent & M-Pesa Management for Kenyan Landlords & Agencies',
  metaDescription:
    'KodiHub helps Kenyan landlords and letting agencies automate rent invoicing, collect payments via M-Pesa Paybill/Till and bank, track water & power meters, manage unit maintenance, and remit to property owners.',
  signInLabel: 'Sign in',
  registerLabel: 'Create account',
  heroBadge: 'Built for Kenyan Landlords & Letting Agencies',
  heroTitle: 'Every unit, invoice, M-Pesa payment and payout in one place.',
  heroSubtitle:
    'Automate monthly rent and metered utility billing, reconcile M-Pesa Paybill/Till and bank statements automatically, track unit maintenance, and send branded PDF invoices and receipts.',
  heroPrimaryCta: 'Start free trial',
  heroSecondaryCta: 'Sign in to your account',
  heroStatsTitle: 'Sample portfolio snapshot',
  heroStats: [
    { label: 'Collected this month', value: 'KES 1,840,000.00' },
    { label: 'M-Pesa C2B auto-matched', value: '98.4%' },
    { label: 'Occupancy across 64 units', value: '95.3%' },
    { label: 'Receipts & PDF statements', value: 'Instant SMS + Email' },
  ],
  featuresTitle: 'Everything your property operations need',
  featuresSubtitle:
    'No spreadsheets or manual receipt books. KodiHub handles the full lifecycle from move-in to landlord remittance.',
  features: [
    {
      tag: 'M-Pesa & Banks',
      title: 'Real-time M-Pesa C2B, STK Push & Bank Imports',
      description:
        'Connect your Safaricom Paybill or Till. Payments match tenants by account reference or phone number automatically and allocate oldest-due first.',
    },
    {
      tag: 'Billing & Meters',
      title: 'Monthly Rent, Water & Power Meter Readings',
      description:
        'Record meter readings with photo proof and run an entire property’s monthly invoices in one click, complete with custom payment instructions.',
    },
    {
      tag: 'Communications',
      title: 'Branded PDF Invoices, Receipts & Reminders',
      description:
        'Every payment and invoice triggers an SMS and a detailed email with an official branded PDF receipt or invoice attached.',
    },
    {
      tag: 'Maintenance',
      title: 'Unit Repair Requests & Expense Conversion',
      description:
        'Tenants report issues with photos from their phone. Staff track progress, resolve tickets, and convert repair costs directly into property expenses.',
    },
    {
      tag: 'Letting Agencies',
      title: 'Management Agreements & Landlord Payouts',
      description:
        'Calculate agency commission, deduct approved property expenses, generate owner statements, and disburse net remittances via M-Pesa B2C.',
    },
    {
      tag: 'Web & Mobile',
      title: 'Staff, Owner & Tenant Portals',
      description:
        'Dedicated web and Android/iOS experiences for property managers, caretakers, landlords, and tenants—all backed by role-based permissions and audit logs.',
    },
  ],
  portalsTitle: 'Three tailored experiences',
  portalsSubtitle: 'Everyone sees only what belongs to them, on web or mobile.',
  portals: [
    {
      title: 'For Landlords & Property Staff',
      description:
        'Manage properties, units, tenancies, meter readings, invoice runs, payment reconciliation, maintenance tickets, and P&L reports.',
    },
    {
      title: 'For Tenants',
      description:
        'Sign in with a one-time SMS/email code, check current balance, trigger an M-Pesa STK prompt, download PDF receipts, and submit maintenance requests.',
    },
    {
      title: 'For Property Owners (Agencies)',
      description:
        'Read-only owner portal showing live occupancy, monthly owner statements, commission breakdowns, and remittance payout history.',
    },
  ],
  pricingBadge: 'Transparent per-unit pricing',
  pricingTitle: 'Pay only for occupied units',
  pricingSubtitle:
    'Vacant units are free. Every plan includes unlimited staff accounts, M-Pesa integration, PDF invoices & receipts, tenant and owner portals, and mobile app access.',
  pricingNote: 'Includes free trial for new organisations.',
  defaultSliderUnits: 25,
  fallbackRatePerUnit: 10000,
  fallbackMinimumMonthly: 150000,
  contactEmail: 'hello@kodihub.co.ke',
  contactPhone: null,
  footerCopyright: 'KodiHub Property Management. All rights reserved.',
  footerTagline: 'Built in Nairobi for landlords and letting agencies across Kenya.',
};

function LandingPageForm({ settings }: { settings: PlatformSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const initial: LandingPageContent = settings.landingPage ?? DEFAULT_LANDING_PAGE;
  const [draft, setDraft] = useState<LandingPageContent>(() => ({
    ...initial,
    heroStats: initial.heroStats.map((x) => ({ ...x })),
    features: initial.features.map((x) => ({ ...x })),
    portals: initial.portals.map((x) => ({ ...x })),
  }));

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<unknown>('/platform/landing', body),
    onSuccess: async () => {
      toast.saved('Landing page content published for this environment.');
      await queryClient.invalidateQueries({ queryKey: keys.platform });
    },
    onError: (error) => toast.failed(platformErrorMessage(error)),
  });

  const setField = <K extends keyof LandingPageContent>(key: K, value: LandingPageContent[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const updateHeroStat = (idx: number, patch: Partial<LandingHeroStat>) => {
    setDraft((prev) => ({
      ...prev,
      heroStats: prev.heroStats.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const updateFeature = (idx: number, patch: Partial<LandingFeatureItem>) => {
    setDraft((prev) => ({
      ...prev,
      features: prev.features.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    }));
  };

  const updatePortal = (idx: number, patch: Partial<LandingPortalItem>) => {
    setDraft((prev) => ({
      ...prev,
      portals: prev.portals.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({
      ...draft,
      contactEmail: draft.contactEmail?.trim() || null,
      contactPhone: draft.contactPhone?.trim() || null,
    });
  };

  return (
    <form className="fm__section" onSubmit={submit} noValidate>
      <h2>Landing page content</h2>
      <p>
        Controls the public marketing site for this environment (
        <strong>kodihub.co.ke</strong> in production, <strong>landing.kodihub.co.ke</strong> in
        development). Changes take effect immediately on the landing page.
      </p>

      <div className="fm__grid">
        <Field id="lp-brand" label="Brand name">
          <input
            id="lp-brand"
            value={draft.brandName}
            onChange={(e) => setField('brandName', e.target.value)}
          />
        </Field>
        <Field id="lp-signin" label="Nav sign-in button label">
          <input
            id="lp-signin"
            value={draft.signInLabel}
            onChange={(e) => setField('signInLabel', e.target.value)}
          />
        </Field>
        <Field
          id="lp-register"
          label="Nav sign-up button label"
          hint="Shown when public sign-up is enabled under App & Maintenance."
        >
          <input
            id="lp-register"
            value={draft.registerLabel}
            onChange={(e) => setField('registerLabel', e.target.value)}
          />
        </Field>
        <Field id="lp-title" label="Browser page title (SEO)" wide>
          <input
            id="lp-title"
            value={draft.pageTitle}
            onChange={(e) => setField('pageTitle', e.target.value)}
          />
        </Field>
        <Field id="lp-desc" label="Meta description (SEO)" wide>
          <textarea
            id="lp-desc"
            rows={2}
            value={draft.metaDescription}
            onChange={(e) => setField('metaDescription', e.target.value)}
          />
        </Field>
      </div>

      <h3 style={{ marginTop: 24 }}>Hero section</h3>
      <div className="fm__grid">
        <Field id="lp-hbadge" label="Hero badge" wide>
          <input
            id="lp-hbadge"
            value={draft.heroBadge}
            onChange={(e) => setField('heroBadge', e.target.value)}
          />
        </Field>
        <Field id="lp-htitle" label="Hero headline" wide>
          <input
            id="lp-htitle"
            value={draft.heroTitle}
            onChange={(e) => setField('heroTitle', e.target.value)}
          />
        </Field>
        <Field id="lp-hsub" label="Hero subtitle" wide>
          <textarea
            id="lp-hsub"
            rows={3}
            value={draft.heroSubtitle}
            onChange={(e) => setField('heroSubtitle', e.target.value)}
          />
        </Field>
        <Field id="lp-hpcta" label="Primary CTA label">
          <input
            id="lp-hpcta"
            value={draft.heroPrimaryCta}
            onChange={(e) => setField('heroPrimaryCta', e.target.value)}
          />
        </Field>
        <Field id="lp-hscta" label="Secondary CTA label">
          <input
            id="lp-hscta"
            value={draft.heroSecondaryCta}
            onChange={(e) => setField('heroSecondaryCta', e.target.value)}
          />
        </Field>
        <Field id="lp-hstitle" label="Snapshot card heading" wide>
          <input
            id="lp-hstitle"
            value={draft.heroStatsTitle}
            onChange={(e) => setField('heroStatsTitle', e.target.value)}
          />
        </Field>
      </div>

      {draft.heroStats.map((stat, idx) => (
        <div key={idx} className="fm__grid" style={{ marginTop: 10 }}>
          <Field id={`lp-stat-l-${idx}`} label={`Stat ${idx + 1} label`}>
            <input
              id={`lp-stat-l-${idx}`}
              value={stat.label}
              onChange={(e) => updateHeroStat(idx, { label: e.target.value })}
            />
          </Field>
          <Field id={`lp-stat-v-${idx}`} label={`Stat ${idx + 1} value`}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id={`lp-stat-v-${idx}`}
                value={stat.value}
                onChange={(e) => updateHeroStat(idx, { value: e.target.value })}
              />
              {draft.heroStats.length > 1 ? (
                <button
                  type="button"
                  className="nx-btn nx-btn--sm"
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      heroStats: p.heroStats.filter((_, i) => i !== idx),
                    }))
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          </Field>
        </div>
      ))}
      {draft.heroStats.length < 8 ? (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="nx-btn nx-btn--sm"
            onClick={() =>
              setDraft((p) => ({
                ...p,
                heroStats: [...p.heroStats, { label: 'New metric', value: '100%' }],
              }))
            }
          >
            + Add hero stat
          </button>
        </div>
      ) : null}

      <h3 style={{ marginTop: 28 }}>Features section</h3>
      <div className="fm__grid">
        <Field id="lp-ftitle" label="Section heading" wide>
          <input
            id="lp-ftitle"
            value={draft.featuresTitle}
            onChange={(e) => setField('featuresTitle', e.target.value)}
          />
        </Field>
        <Field id="lp-fsub" label="Section subtitle" wide>
          <textarea
            id="lp-fsub"
            rows={2}
            value={draft.featuresSubtitle}
            onChange={(e) => setField('featuresSubtitle', e.target.value)}
          />
        </Field>
      </div>
      {draft.features.map((feat, idx) => (
        <div
          key={idx}
          className="fm__grid"
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--nx-border, #e2e8f0)',
          }}
        >
          <Field id={`lp-ft-tag-${idx}`} label={`Feature ${idx + 1} tag`}>
            <input
              id={`lp-ft-tag-${idx}`}
              value={feat.tag}
              onChange={(e) => updateFeature(idx, { tag: e.target.value })}
            />
          </Field>
          <Field id={`lp-ft-t-${idx}`} label={`Feature ${idx + 1} title`}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id={`lp-ft-t-${idx}`}
                value={feat.title}
                onChange={(e) => updateFeature(idx, { title: e.target.value })}
              />
              {draft.features.length > 1 ? (
                <button
                  type="button"
                  className="nx-btn nx-btn--sm"
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      features: p.features.filter((_, i) => i !== idx),
                    }))
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          </Field>
          <Field id={`lp-ft-d-${idx}`} label={`Feature ${idx + 1} description`} wide>
            <textarea
              id={`lp-ft-d-${idx}`}
              rows={2}
              value={feat.description}
              onChange={(e) => updateFeature(idx, { description: e.target.value })}
            />
          </Field>
        </div>
      ))}
      {draft.features.length < 12 ? (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="nx-btn nx-btn--sm"
            onClick={() =>
              setDraft((p) => ({
                ...p,
                features: [
                  ...p.features,
                  { tag: 'Feature', title: 'New feature', description: 'Describe this feature.' },
                ],
              }))
            }
          >
            + Add feature card
          </button>
        </div>
      ) : null}

      <h3 style={{ marginTop: 28 }}>Portals section</h3>
      <div className="fm__grid">
        <Field id="lp-ptitle" label="Portals heading" wide>
          <input
            id="lp-ptitle"
            value={draft.portalsTitle}
            onChange={(e) => setField('portalsTitle', e.target.value)}
          />
        </Field>
        <Field id="lp-psub" label="Portals subtitle" wide>
          <input
            id="lp-psub"
            value={draft.portalsSubtitle}
            onChange={(e) => setField('portalsSubtitle', e.target.value)}
          />
        </Field>
      </div>
      {draft.portals.map((portal, idx) => (
        <div
          key={idx}
          className="fm__grid"
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--nx-border, #e2e8f0)',
          }}
        >
          <Field id={`lp-pt-t-${idx}`} label={`Portal ${idx + 1} title`} wide>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id={`lp-pt-t-${idx}`}
                value={portal.title}
                onChange={(e) => updatePortal(idx, { title: e.target.value })}
              />
              {draft.portals.length > 1 ? (
                <button
                  type="button"
                  className="nx-btn nx-btn--sm"
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      portals: p.portals.filter((_, i) => i !== idx),
                    }))
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          </Field>
          <Field id={`lp-pt-d-${idx}`} label={`Portal ${idx + 1} description`} wide>
            <textarea
              id={`lp-pt-d-${idx}`}
              rows={2}
              value={portal.description}
              onChange={(e) => updatePortal(idx, { description: e.target.value })}
            />
          </Field>
        </div>
      ))}
      {draft.portals.length < 6 ? (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="nx-btn nx-btn--sm"
            onClick={() =>
              setDraft((p) => ({
                ...p,
                portals: [
                  ...p.portals,
                  { title: 'New experience', description: 'Describe who this portal serves.' },
                ],
              }))
            }
          >
            + Add portal card
          </button>
        </div>
      ) : null}

      <h3 style={{ marginTop: 28 }}>Pricing & footer</h3>
      <div className="fm__grid">
        <Field id="lp-prbadge" label="Pricing badge">
          <input
            id="lp-prbadge"
            value={draft.pricingBadge}
            onChange={(e) => setField('pricingBadge', e.target.value)}
          />
        </Field>
        <Field id="lp-prunits" label="Calculator default occupied units">
          <input
            id="lp-prunits"
            inputMode="numeric"
            value={String(draft.defaultSliderUnits)}
            onChange={(e) =>
              setField('defaultSliderUnits', Math.max(1, Number.parseInt(e.target.value, 10) || 1))
            }
          />
        </Field>
        <Field id="lp-prtitle" label="Pricing heading" wide>
          <input
            id="lp-prtitle"
            value={draft.pricingTitle}
            onChange={(e) => setField('pricingTitle', e.target.value)}
          />
        </Field>
        <Field id="lp-prsub" label="Pricing description" wide>
          <textarea
            id="lp-prsub"
            rows={2}
            value={draft.pricingSubtitle}
            onChange={(e) => setField('pricingSubtitle', e.target.value)}
          />
        </Field>
        <Field
          id="lp-prnote"
          label="Pricing calculator footnote"
          wide
          hint="The calculator automatically uses your active Default Plan’s per-unit rate and monthly minimum."
        >
          <input
            id="lp-prnote"
            value={draft.pricingNote}
            onChange={(e) => setField('pricingNote', e.target.value)}
          />
        </Field>
        <Field id="lp-cemail" label="Public contact email" optional>
          <input
            id="lp-cemail"
            type="email"
            value={draft.contactEmail ?? ''}
            onChange={(e) => setField('contactEmail', e.target.value || null)}
          />
        </Field>
        <Field id="lp-cphone" label="Public contact phone" optional>
          <input
            id="lp-cphone"
            value={draft.contactPhone ?? ''}
            onChange={(e) => setField('contactPhone', e.target.value || null)}
          />
        </Field>
        <Field id="lp-fcopy" label="Footer copyright text" wide>
          <input
            id="lp-fcopy"
            value={draft.footerCopyright}
            onChange={(e) => setField('footerCopyright', e.target.value)}
          />
        </Field>
        <Field id="lp-ftag" label="Footer tagline" wide>
          <input
            id="lp-ftag"
            value={draft.footerTagline}
            onChange={(e) => setField('footerTagline', e.target.value)}
          />
        </Field>
      </div>

      <div className="pg-actions">
        <button
          type="button"
          className="nx-btn"
          disabled={save.isPending}
          onClick={() => {
            setDraft({
              ...DEFAULT_LANDING_PAGE,
              heroStats: DEFAULT_LANDING_PAGE.heroStats.map((x) => ({ ...x })),
              features: DEFAULT_LANDING_PAGE.features.map((x) => ({ ...x })),
              portals: DEFAULT_LANDING_PAGE.portals.map((x) => ({ ...x })),
            });
            save.mutate({ reset: true });
          }}
        >
          Reset to defaults
        </button>
        <button type="submit" className="nx-btn nx-btn--primary" disabled={save.isPending}>
          {save.isPending ? 'Publishing…' : 'Publish landing page'}
        </button>
      </div>
    </form>
  );
}
