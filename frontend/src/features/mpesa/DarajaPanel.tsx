import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { copyText } from '../../lib/clipboard';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { Sheet } from '../../components/Sheet';
import { keys as paymentKeys } from '../payments/api';
import { channelDetails } from '../payments/rules';
import type { DarajaEnvironment, PaymentChannel } from '../payments/types';
import { Badge, Field } from '../portfolio/ui';
import { mpesaErrorMessage } from './api';
import { DARAJA_ENV } from './labels';
import { checkDaraja, mpesaNoun } from './rules';
import type { DarajaBody, DarajaDraft } from './rules';

/**
 * The "M-Pesa connection" section of Payment channels: for each M-Pesa paybill or till,
 * whether its Daraja app keys are saved, the callback URLs Safaricom sends results to,
 * and — with `channels:manage` — set up, register the paybill URLs, rotate the URLs and
 * remove. Saving keys, rotating and removing ask for a verification code (step-up); the
 * app-wide StepUpProvider opens that dialog and repeats the request.
 *
 * Keys are write-only: the API never returns them and the form never shows them.
 */
export function DarajaPanel({ channels, canManage }: { channels: PaymentChannel[]; canManage: boolean }) {
  const [settingUp, setSettingUp] = useState<PaymentChannel | null>(null);

  return (
    <section className="fm__section mp__daraja" aria-labelledby="daraja-title">
      <div className="pf__sectionhead"><h2 id="daraja-title">M-Pesa connection</h2></div>
      <p className="ad__muted mp__lead">
        Connect a paybill or till to your own Safaricom Daraja app and M-Pesa payments are recorded and receipted
        automatically — and you can send payment prompts to tenants’ phones. The money goes straight to your
        paybill or till, never through Hodi.
      </p>
      <div className="mp__cards">
        {channels.map((c) => <DarajaCard key={c.id} channel={c} canManage={canManage} onSetUp={() => setSettingUp(c)} />)}
      </div>
      {settingUp ? <DarajaSetupSheet channel={settingUp} onClose={() => setSettingUp(null)} /> : null}
    </section>
  );
}

function DarajaCard({ channel, canManage, onSetUp }: { channel: PaymentChannel; canManage: boolean; onSetUp: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const daraja = channel.daraja ?? null;
  const configured = Boolean(daraja?.configured);
  const noun = mpesaNoun(channel.kind);
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  const refresh = () => queryClient.invalidateQueries({ queryKey: paymentKeys.channels });

  const register = useMutation({
    mutationFn: () => api.post<unknown>(`/payment-channels/${channel.id}/daraja/register-c2b`),
    onSuccess: async () => {
      toast.saved(`Safaricom will now send ${channel.name}’s payments to Hodi.`);
      await refresh();
    },
    onError: (error) => toast.failed(mpesaErrorMessage(error)),
  });
  const rotate = useMutation({
    mutationFn: () => api.post<unknown>(`/payment-channels/${channel.id}/daraja/rotate-token`),
    onSuccess: async () => {
      toast.saved(`${channel.name} has new callback URLs. Register the ${noun} URLs again.`);
      await refresh();
    },
    onError: (error) => toast.failed(mpesaErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete<unknown>(`/payment-channels/${channel.id}/daraja`),
    onSuccess: async () => {
      toast.saved(`${channel.name} is no longer connected to M-Pesa.`);
      await refresh();
    },
    onError: (error) => toast.failed(mpesaErrorMessage(error)),
  });
  const busy = register.isPending || rotate.isPending || remove.isPending;

  return (
    <article className="mp__card" aria-label={channel.name}>
      <header className="mp__cardhead">
        <div>
          <strong>{channel.name}</strong>
          <span className="ad__sub num">{channelDetails(channel)}</span>
        </div>
        <div className="mp__badges">
          {configured
            ? <span className="ad__badge ad__badge--ok">Connected</span>
            : <span className="ad__badge ad__badge--off">Not connected</span>}
          {configured && daraja?.environment ? <Badge table={DARAJA_ENV} value={daraja.environment} /> : null}
          {configured ? (
            daraja?.c2bRegisteredAt
              ? <span className="ad__badge ad__badge--ok">{Noun} URLs registered</span>
              : <span className="ad__badge ad__badge--warn">{Noun} URLs not registered</span>
          ) : null}
        </div>
      </header>

      {channel.status !== 'ACTIVE' ? (
        <p className="ad__muted">This channel is inactive, so it can’t take payments or send payment prompts.</p>
      ) : null}

      {!configured ? (
        <p className="ad__muted">
          Not connected: M-Pesa payments to this {noun} are entered by hand with their code.
          {canManage ? ' Set up adds your Daraja app’s keys.' : ' Someone who can manage payment channels can set it up.'}
        </p>
      ) : (
        <>
          {daraja?.c2bRegisteredAt ? (
            <p className="ad__muted">Payments to this {noun} are recorded automatically. URLs registered with Safaricom {formatDateTime(daraja.c2bRegisteredAt)}.</p>
          ) : (
            <p className="ad__muted">
              Payment prompts work. Payments people make to the {noun} themselves are only recorded automatically once its
              URLs are registered with Safaricom.
            </p>
          )}
          {daraja?.callbackUrls ? (
            <dl className="mp__urls">
              <CallbackUrl label="Payment prompts (STK) results" url={daraja.callbackUrls.stk} />
              <CallbackUrl label={`${Noun} confirmation`} url={daraja.callbackUrls.c2bConfirm} />
              <CallbackUrl label={`${Noun} validation`} url={daraja.callbackUrls.c2bValidate} />
            </dl>
          ) : null}
          <p className="hint mp__hint">
            Safaricom sends results to these addresses. Hodi gives them to Safaricom for you; copy them only if Safaricom
            support asks. Keep them private — anyone with them could send fake notices (Hodi double-checks prompts with Safaricom).
          </p>
        </>
      )}

      {canManage ? (
        <div className="mp__actions">
          <button type="button" className={`nx-btn nx-btn--sm ${configured ? '' : 'nx-btn--primary'}`} onClick={onSetUp} disabled={busy}>
            {configured ? 'Change keys' : 'Set up'}
          </button>
          {configured ? (
            <>
              <button type="button" className="nx-btn nx-btn--sm" disabled={busy} onClick={() => register.mutate()}
                title={`Tell Safaricom to send every payment to this ${noun} to Hodi`}>
                {register.isPending ? 'Registering…' : `Register ${noun} URLs`}
              </button>
              <ConfirmDelete size="sm" label="Rotate URLs" verb="Rotate the URLs of" what={channel.name} busy={rotate.isPending}
                consequence={`Gives this channel new callback URLs and the old ones stop working at once. Money still reaches your ${noun}, but Hodi isn’t told about it — so register the ${noun} URLs again straight after. Do this if the URLs may have leaked. In production Safaricom may only accept a ${noun}’s URLs once; changing them can need a request to Safaricom support.`}
                onConfirm={() => rotate.mutate()} />
              <ConfirmDelete size="sm" label="Remove" verb="Disconnect" what={`${channel.name} from M-Pesa`} busy={remove.isPending}
                consequence={`Deletes the saved Daraja keys. Payment prompts can’t be sent from this ${noun} and Hodi can no longer check payments with Safaricom; enter M-Pesa payments by hand instead. Payments already recorded stay as they are. You can set it up again at any time.`}
                onConfirm={() => remove.mutate()} />
            </>
          ) : null}
        </div>
      ) : null}
      {canManage && configured ? (
        <ul className="hint mp__explain">
          <li><strong>Register {noun} URLs</strong>: tells Safaricom to send every payment to this {noun} to Hodi. Do it after setting up, after rotating, and after moving to production.</li>
          <li><strong>Rotate URLs</strong>: old links stop working; register the {noun} URLs again.</li>
          <li><strong>Remove</strong>: deletes the keys; payments go back to being entered by hand.</li>
        </ul>
      ) : null}
    </article>
  );
}

/** A callback URL with a copy button. */
export function CallbackUrl({ label, url }: { label: string; url: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await copyText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.failed('Couldn’t copy. Select the address and copy it by hand.');
    }
  };
  return (
    <div className="mp__url">
      <dt>{label}</dt>
      <dd>
        <code className="num">{url}</code>
        <button type="button" className="nx-btn nx-btn--sm" onClick={copy} aria-label={`Copy ${label} URL`}>{copied ? 'Copied' : 'Copy'}</button>
      </dd>
    </div>
  );
}

function DarajaSetupSheet({ channel, onClose }: { channel: PaymentChannel; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const configured = Boolean(channel.daraja?.configured);
  // Never prefilled: the keys are not returned. Only the environment is known.
  const [draft, setDraft] = useState<DarajaDraft>({
    environment: channel.daraja?.environment ?? '',
    consumerKey: '',
    consumerSecret: '',
    passkey: '',
    storeNumber: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof DarajaDraft, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const set = (field: keyof DarajaDraft, value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const noun = mpesaNoun(channel.kind);

  const save = useMutation({
    mutationFn: (body: DarajaBody) => api.put<unknown>(`/payment-channels/${channel.id}/daraja`, body),
    onSuccess: async () => {
      toast.saved(configured ? `${channel.name}’s M-Pesa keys were changed.` : `${channel.name} is connected to M-Pesa. Now register the ${noun} URLs.`);
      await queryClient.invalidateQueries({ queryKey: paymentKeys.channels });
      onClose();
    },
    onError: (error) => {
      const fieldErrors: Partial<Record<keyof DarajaDraft, string>> = {};
      if (error instanceof ApiError && error.status === 422) {
        const byField = error.fieldErrors;
        for (const f of ['environment', 'consumerKey', 'consumerSecret', 'passkey', 'storeNumber'] as const) if (byField[f]) fieldErrors[f] = byField[f];
      }
      setErrors(fieldErrors);
      // The channel itself needs its paybill / till number before it can be connected.
      const noShortcode = error instanceof ApiError && error.status === 422 && Boolean(error.fieldErrors.shortcode);
      setGeneral(noShortcode
        ? `Add the ${noun} number to ${channel.name} first (Edit in the table above), then connect it.`
        : Object.keys(fieldErrors).length > 0 ? null : mpesaErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkDaraja(draft, channel.kind);
    setGeneral(null);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    save.mutate(checked.body);
  };

  const envs: DarajaEnvironment[] = ['SANDBOX', 'PRODUCTION'];

  return (
    <Sheet
      title={configured ? `Change M-Pesa keys — ${channel.name}` : `Connect ${channel.name} to M-Pesa`}
      wide
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="daraja-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save keys'}
          </button>
        </>
      )}
    >
      <form id="daraja-form" className="sheet-form" onSubmit={submit} noValidate autoComplete="off">
        <p className="ad__muted">
          From your app on the Safaricom Daraja portal (developer.safaricom.co.ke). The keys are stored encrypted and are never
          shown again — {configured ? 'enter all of them again to change any one.' : 'keep your own copy.'} Saving asks for a
          verification code.
        </p>
        <div className={`fld ${errors.environment ? 'is-bad' : ''}`}>
          <span className="fld__label">Environment</span>
          <div className="pf__radios" role="radiogroup" aria-label="Environment">
            {envs.map((env) => (
              <label key={env} className="fld__check">
                <input type="radio" name="daraja-env" checked={draft.environment === env} onChange={() => set('environment', env)} />
                {DARAJA_ENV[env].label}
              </label>
            ))}
          </div>
          {errors.environment ? <span className="fld__err">{errors.environment}</span>
            : <span className="hint">Sandbox is Safaricom’s test system — no real money moves. Use production for real payments.</span>}
        </div>
        <div className="fm__grid sheet-grid">
          <Field id="dj-key" label="Consumer key" error={errors.consumerKey}>
            <input id="dj-key" type="password" autoComplete="new-password" spellCheck={false} value={draft.consumerKey}
              aria-invalid={Boolean(errors.consumerKey)} onChange={(e) => set('consumerKey', e.target.value)} />
          </Field>
          <Field id="dj-secret" label="Consumer secret" error={errors.consumerSecret}>
            <input id="dj-secret" type="password" autoComplete="new-password" spellCheck={false} value={draft.consumerSecret}
              aria-invalid={Boolean(errors.consumerSecret)} onChange={(e) => set('consumerSecret', e.target.value)} />
          </Field>
          <Field id="dj-passkey" label="Passkey" optional error={errors.passkey} wide
            hint={`Lipa na M-Pesa Online passkey, from Safaricom. Needed to send payment prompts; without it the ${noun} only receives payments.`}>
            <input id="dj-passkey" type="password" autoComplete="new-password" spellCheck={false} value={draft.passkey}
              aria-invalid={Boolean(errors.passkey)} onChange={(e) => set('passkey', e.target.value)} />
          </Field>
          {channel.kind === 'MPESA_TILL' ? (
            <Field id="dj-store" label="Store number" optional error={errors.storeNumber}
              hint="The head office (store) number Safaricom gave for this till, if payment prompts go to it rather than the till number.">
              <input id="dj-store" inputMode="numeric" autoComplete="off" maxLength={7} value={draft.storeNumber}
                aria-invalid={Boolean(errors.storeNumber)} onChange={(e) => set('storeNumber', e.target.value)} />
            </Field>
          ) : null}
        </div>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}
