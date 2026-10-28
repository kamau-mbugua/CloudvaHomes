import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { CallbackUrl } from '../mpesa/DarajaPanel';
import { DARAJA_ENV } from '../mpesa/labels';
import { checkDaraja } from '../mpesa/rules';
import type { DarajaDraft } from '../mpesa/rules';
import { Badge, Field } from '../portfolio/ui';
import { keys, platformErrorMessage, usePlans, usePlatformSettings } from '../platform/api';
import { checkSettings, darajaSettingsBody, settingsDraft } from '../platform/rules';
import type { SettingsBody, SettingsDraft } from '../platform/rules';
import type { PlatformSettings } from '../platform/types';

/**
 * Admin → Settings (`/admin/settings`): when Hodi invoices fall due and when an unpaid
 * organisation becomes read-only, the default plan for new organisations, Hodi's paybill
 * and its own Daraja app (keys write-only; saving them asks for a verification code) with
 * the callback URLs Safaricom sends results to.
 */
export function AdminSettingsPage() {
  const settings = usePlatformSettings();
  if (settings.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (settings.isError) return <div className="pg"><p className="ad__error" role="alert">{platformErrorMessage(settings.error)}</p></div>;
  return (
    <div className="pg pg-narrow">
      <SettingsForm key={settings.data.updatedAt ?? JSON.stringify(settingsDraft(settings.data))} settings={settings.data} />
      <DarajaSection settings={settings.data} />
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
  // Never prefilled: the keys are not returned. Only the environment is known.
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
