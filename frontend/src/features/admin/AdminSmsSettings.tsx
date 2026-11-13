import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { formatKES, parseAmount } from '../../lib/money';
import { unwrap } from '../payments/rules';
import { useToast } from '../../lib/useToast';
import { Field } from '../portfolio/ui';
import { keys, platformErrorMessage } from '../platform/api';
import type { PlatformSettings } from '../platform/types';
import { PROVIDER_LABEL } from '../sms/rules';
import type { SmsProvider } from '../sms/types';
import { parseBundles } from './smsAdmin';
import type { SmsTestResult } from './smsLog';

/**
 * Admin → Settings → SMS: which provider sends KodiHub's own SMS (login codes and
 * organisations on KodiHub SMS), its credentials (write-only), and the price and bundles of
 * SMS units organisations buy.
 */
export function AdminSmsSettings({ settings }: { settings: PlatformSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const sms = settings.sms;
  const [provider, setProvider] = useState<SmsProvider>(sms?.provider ?? 'AFRICASTALKING');
  const [atUser, setAtUser] = useState(sms?.username ?? '');
  const [atSender, setAtSender] = useState(sms?.senderId ?? '');
  const [atKey, setAtKey] = useState('');
  const [tsPartner, setTsPartner] = useState(sms?.textsms?.partnerId ?? '');
  const [tsSender, setTsSender] = useState(sms?.textsms?.senderId ?? '');
  const [tsKey, setTsKey] = useState('');
  const [hpUser, setHpUser] = useState(sms?.hostpinnacle?.userId ?? '');
  const [hpSender, setHpSender] = useState(sms?.hostpinnacle?.senderId ?? '');
  const [hpKey, setHpKey] = useState('');
  const [hpPassword, setHpPassword] = useState('');
  const [price, setPrice] = useState(((Number(sms?.unitPrice ?? 80)) / 100).toFixed(2));
  const [bundles, setBundles] = useState((sms?.bundles ?? [500, 1000, 5000]).join(', '));
  const [minUnits, setMinUnits] = useState(String(sms?.minUnits ?? 100));
  const [freeUnits, setFreeUnits] = useState(String(sms?.freeUnits ?? 100));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<unknown>('/platform/settings', body),
    onSuccess: async () => {
      toast.saved('SMS settings saved.');
      setAtKey('');
      setTsKey('');
      setHpKey('');
      setHpPassword('');
      await queryClient.invalidateQueries({ queryKey: keys.platform });
    },
    onError: (error) => {
      const byField = error instanceof ApiError && error.status === 422 ? error.fieldErrors : {};
      toast.failed(byField.smsProvider ?? byField.smsBundles ?? platformErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    const parsedPrice = parseAmount(price);
    if (!parsedPrice.ok || parsedPrice.minor <= 0) found.price = 'Enter a price above KES 0, e.g. 0.80';
    const min = Number(minUnits);
    if (!Number.isInteger(min) || min < 1) found.minUnits = 'Enter a whole number, 1 or more';
    const free = Number(freeUnits);
    if (!Number.isInteger(free) || free < 0) found.freeUnits = 'Enter a whole number, 0 or more';
    const parsedBundles = parseBundles(bundles, Number.isInteger(min) && min > 0 ? min : 1);
    if (!parsedBundles.ok) found.bundles = parsedBundles.error;
    setErrors(found);
    if (Object.keys(found).length || !parsedPrice.ok || !parsedBundles.ok) return;
    save.mutate({
      smsProvider: provider,
      atUsername: atUser.trim() || null,
      atSenderId: atSender.trim() || null,
      ...(atKey ? { atApiKey: atKey } : {}),
      textsmsPartnerId: tsPartner.trim() || null,
      textsmsSenderId: tsSender.trim() || null,
      ...(tsKey ? { textsmsApiKey: tsKey } : {}),
      hostpinnacleUserId: hpUser.trim() || null,
      hostpinnacleSenderId: hpSender.trim() || null,
      ...(hpKey ? { hostpinnacleApiKey: hpKey } : {}),
      ...(hpPassword ? { hostpinnaclePassword: hpPassword } : {}),
      smsUnitPrice: parsedPrice.minor,
      smsBundles: parsedBundles.bundles,
      smsMinUnits: min,
      smsFreeUnits: free,
    });
  };

  const keyHint = (saved: boolean | undefined) =>
    saved ? 'Saved — enter a new key to replace it.' : 'Stored encrypted and never shown again.';

  return (
    <>
    <form className="fm__section" onSubmit={submit} noValidate autoComplete="off">
      <h2>SMS</h2>
      <p>
        KodiHub’s provider sends sign-in and security codes, and the messages of organisations on KodiHub SMS (paid with
        their SMS units). Organisations with their own SMS account are set up on their page.
      </p>

      <fieldset className="sms__bundles">
        <legend>KodiHub’s SMS provider</legend>
        {(Object.keys(PROVIDER_LABEL) as SmsProvider[]).map((p) => (
          <label key={p} className="sms__bundle">
            <input type="radio" name="sms-provider" checked={provider === p} onChange={() => setProvider(p)} />
            <span>{PROVIDER_LABEL[p]}</span>
            <span />
          </label>
        ))}
      </fieldset>

      {provider === 'AFRICASTALKING' ? (
        <div className="fm__grid">
          <Field id="at-user" label="Username" hint="e.g. sandbox, or your Africa’s Talking username">
            <input id="at-user" value={atUser} onChange={(e) => setAtUser(e.target.value)} />
          </Field>
          <Field id="at-sender" label="Sender ID" optional hint="e.g. KODIHUB">
            <input id="at-sender" value={atSender} onChange={(e) => setAtSender(e.target.value)} />
          </Field>
          <Field id="at-key" label="API key" wide hint={keyHint(sms?.apiKeySet)}>
            <input id="at-key" type="password" autoComplete="new-password" value={atKey} onChange={(e) => setAtKey(e.target.value)} />
          </Field>
        </div>
      ) : provider === 'TEXTSMS' ? (
        <div className="fm__grid">
          <Field id="ts-partner" label="Partner ID">
            <input id="ts-partner" value={tsPartner} onChange={(e) => setTsPartner(e.target.value)} />
          </Field>
          <Field id="ts-sender" label="Sender ID (shortcode)">
            <input id="ts-sender" value={tsSender} onChange={(e) => setTsSender(e.target.value)} />
          </Field>
          <Field id="ts-key" label="API key" wide hint={keyHint(sms?.textsms?.apiKeySet)}>
            <input id="ts-key" type="password" autoComplete="new-password" value={tsKey} onChange={(e) => setTsKey(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="fm__grid">
          <Field id="hp-user" label="User ID">
            <input id="hp-user" value={hpUser} onChange={(e) => setHpUser(e.target.value)} />
          </Field>
          <Field id="hp-sender" label="Sender ID">
            <input id="hp-sender" value={hpSender} onChange={(e) => setHpSender(e.target.value)} />
          </Field>
          <Field id="hp-password" label="Password" hint={sms?.hostpinnacle?.passwordSet ? 'Saved — enter a new one to replace it.' : 'Stored encrypted and never shown again.'}>
            <input id="hp-password" type="password" autoComplete="new-password" value={hpPassword} onChange={(e) => setHpPassword(e.target.value)} />
          </Field>
          <Field id="hp-key" label="API key" hint={keyHint(sms?.hostpinnacle?.apiKeySet)}>
            <input id="hp-key" type="password" autoComplete="new-password" value={hpKey} onChange={(e) => setHpKey(e.target.value)} />
          </Field>
        </div>
      )}

      <h3>SMS units</h3>
      <div className="fm__grid">
        <Field id="sms-price" label="Price per unit (KES)" error={errors.price}
          hint={`Organisations on KodiHub SMS pay this per SMS part. Now ${formatKES(Number(sms?.unitPrice ?? 80))}.`}>
          <input id="sms-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field id="sms-bundles" label="Bundles (units)" error={errors.bundles} hint="Up to 6, separated by commas, e.g. 500, 1000, 5000">
          <input id="sms-bundles" value={bundles} onChange={(e) => setBundles(e.target.value)} />
        </Field>
        <Field id="sms-min" label="Smallest purchase (units)" error={errors.minUnits}>
          <input id="sms-min" inputMode="numeric" value={minUnits} onChange={(e) => setMinUnits(e.target.value)} />
        </Field>
        <Field id="sms-free" label="Free units for new organisations" error={errors.freeUnits}>
          <input id="sms-free" inputMode="numeric" value={freeUnits} onChange={(e) => setFreeUnits(e.target.value)} />
        </Field>
      </div>

      <div className="pg-actions">
        <button type="submit" className="nx-btn nx-btn--primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save SMS settings'}
        </button>
      </div>
    </form>
    <TestSms saved={sms?.provider ?? null} chosen={provider} />
    </>
  );
}

/**
 * One real SMS through KodiHub's saved provider — only that provider, never a fallback — so
 * "sent" proves it works. The result shows the provider's own words when it refuses.
 */
function TestSms({ saved, chosen }: { saved: SmsProvider | null; chosen: SmsProvider }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const test = useMutation({
    mutationFn: async (body: { phone: string }) =>
      unwrap<SmsTestResult>(await api.post<unknown>('/platform/sms/test', body)),
    onError: (e) => {
      const byField = e instanceof ApiError && e.status === 422 ? e.fieldErrors : {};
      setError(byField.phone ?? platformErrorMessage(e));
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    test.reset();
    if (phone.replace(/\D/g, '').length < 9) {
      setError('Enter a phone number, e.g. 0722 000 111');
      return;
    }
    setError(null);
    test.mutate({ phone: phone.trim() });
  };
  const r = test.data;
  return (
    <form className="fm__section" onSubmit={submit} noValidate aria-labelledby="sms-test-h">
      <h2 id="sms-test-h">Send a test SMS</h2>
      <p>
        Sends one real message through {saved ? PROVIDER_LABEL[saved] : 'the saved provider'}, using the saved details.
        {saved && saved !== chosen ? ` Save first to test ${PROVIDER_LABEL[chosen]} instead.` : ' Save any changes first.'}
      </p>
      <div className="fm__grid">
        <Field id="sms-test-phone" label="Phone number" error={error ?? undefined}>
          <input id="sms-test-phone" type="tel" inputMode="tel" autoComplete="off" placeholder="0722 000 111"
            value={phone} aria-invalid={Boolean(error)} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      {r ? (
        r.sent ? (
          <p className="sms__result sms__result--ok" role="status">
            Sent through {r.provider ? PROVIDER_LABEL[r.provider] : 'the provider'}
            {r.messageId ? ` (message ID ${r.messageId})` : ''}. Check the phone; it is also listed under Reports → SMS → All
            messages.
          </p>
        ) : (
          <p className="sms__result sms__result--bad" role="alert">
            Not sent: {r.reason ?? 'the provider refused it'}
          </p>
        )
      ) : null}
      <div className="pg-actions">
        <button type="submit" className="nx-btn" disabled={test.isPending}>
          {test.isPending ? 'Sending…' : 'Send test SMS'}
        </button>
      </div>
    </form>
  );
}
