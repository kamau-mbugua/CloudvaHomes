import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { copyText } from '../../lib/clipboard';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { TableSkeleton } from '../../components/Loading';
import { Sheet } from '../../components/Sheet';
import { CallbackUrl } from '../mpesa/DarajaPanel';
import { keys as paymentKeys } from '../payments/api';
import { channelDetails, unwrap } from '../payments/rules';
import type { PaymentChannel } from '../payments/types';
import { banksErrorMessage, useStatementImports } from './api';
import { StatementImportSheet } from './StatementImportSheet';
import type { BankWebhookSecret, StatementImport } from './types';

/**
 * The "Bank accounts" section of Payment channels (phase 10): for each bank account
 * channel, import a CSV statement from the bank (`reconciliation:update`), see past
 * imports (`reconciliation:view`), and turn bank notifications on or off
 * (`channels:manage`, with a verification code). The notification secret is shown once,
 * when it is made; turning notifications on again replaces it.
 */
export function BankPanel({ channels, canManage }: { channels: PaymentChannel[]; canManage: boolean }) {
  const [importing, setImporting] = useState<PaymentChannel | null>(null);
  const [revealed, setRevealed] = useState<{ channel: PaymentChannel; secret: BankWebhookSecret } | null>(null);

  return (
    <section className="fm__section mp__daraja" aria-labelledby="banks-title">
      <div className="pf__sectionhead"><h2 id="banks-title">Bank accounts</h2></div>
      <p className="ad__muted mp__lead">
        Bring money paid into your bank accounts into KodiHub: import the statement your bank lets you download, or have the
        bank (or your integration partner) notify KodiHub of each deposit. Tenants found in the narrative — a tenant code like
        T00001 or an invoice number — are recorded as paid; the rest wait on Reconciliation.
      </p>
      <div className="mp__cards">
        {channels.map((c) => (
          <BankCard key={c.id} channel={c} canManage={canManage} onImport={() => setImporting(c)}
            onSecret={(secret) => setRevealed({ channel: c, secret })} />
        ))}
      </div>
      {importing ? <StatementImportSheet channel={importing} onClose={() => setImporting(null)} /> : null}
      {revealed ? <SecretSheet channel={revealed.channel} secret={revealed.secret} onClose={() => setRevealed(null)} /> : null}
    </section>
  );
}

function BankCard({ channel, canManage, onImport, onSecret }: {
  channel: PaymentChannel;
  canManage: boolean;
  onImport: () => void;
  onSecret: (secret: BankWebhookSecret) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canImport = useCan('reconciliation:update');
  const canSeeHistory = useCan('reconciliation:view');
  const webhook = channel.bankWebhook ?? null;
  const active = channel.status === 'ACTIVE';
  const refresh = () => queryClient.invalidateQueries({ queryKey: paymentKeys.channels });

  const turnOn = useMutation({
    mutationFn: () => api.put<unknown>(`/payment-channels/${channel.id}/bank-webhook`, { adapter: 'HODI_JSON' }).then((body) => unwrap<BankWebhookSecret>(body)),
    onSuccess: async (secret) => {
      onSecret(secret);
      await refresh();
    },
    onError: (error) => toast.failed(banksErrorMessage(error)),
  });
  const turnOff = useMutation({
    mutationFn: () => api.delete<unknown>(`/payment-channels/${channel.id}/bank-webhook`),
    onSuccess: async () => {
      toast.saved(`Bank notifications for ${channel.name} are off.`);
      await refresh();
    },
    onError: (error) => toast.failed(banksErrorMessage(error)),
  });
  const busy = turnOn.isPending || turnOff.isPending;

  return (
    <article className="mp__card" aria-label={channel.name}>
      <header className="mp__cardhead">
        <div>
          <strong>{channel.name}</strong>
          {channelDetails(channel) ? <span className="ad__sub num">{channelDetails(channel)}</span> : null}
        </div>
        <div className="mp__badges">
          {webhook
            ? <span className="ad__badge ad__badge--ok">Notifications on</span>
            : <span className="ad__badge ad__badge--off">Notifications off</span>}
        </div>
      </header>

      {!active ? <p className="ad__muted">This channel is inactive, so it can’t take new payments.</p> : null}

      <div className="bk__block">
        <h3 className="bk__h">Statements</h3>
        <p className="ad__muted">Download the statement from your internet banking as CSV and import it. Importing the same statement twice adds nothing.</p>
        {canImport || canSeeHistory ? (
          <div className="mp__actions">
            {canImport ? (
              <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={onImport} disabled={!active}>Import statement</button>
            ) : null}
            {canSeeHistory ? (
              <Link className="nx-btn nx-btn--sm" to={`/app/reconciliation?channelId=${encodeURIComponent(channel.id)}`}>Unmatched money</Link>
            ) : null}
          </div>
        ) : null}
        {canSeeHistory ? <ImportHistory channelId={channel.id} /> : null}
      </div>

      <div className="bk__block">
        <h3 className="bk__h">Bank notifications</h3>
        {webhook ? (
          <>
            <p className="ad__muted">On: deposits your bank (or integration partner) sends to this address are recorded as they happen.</p>
            <dl className="mp__urls"><CallbackUrl label="Notification address" url={webhook.url} /></dl>
          </>
        ) : (
          <p className="ad__muted">
            Off. If your bank or an integration partner can send each deposit to a web address, KodiHub records it straight away.
            {canManage ? ' Turning it on gives you the address and a secret to sign with.' : ' Someone who can manage payment channels can turn it on.'}
          </p>
        )}
        {canManage ? (
          <div className="mp__actions">
            {webhook ? (
              <>
                <ConfirmDelete size="sm" label="New secret" verb="Replace the secret of" what={`${channel.name}’s notifications`} busy={turnOn.isPending}
                  consequence="Makes a new secret and the old one stops working at once. Notifications signed with the old secret are refused until the sender uses the new one."
                  onConfirm={() => turnOn.mutate()} />
                <ConfirmDelete size="sm" label="Turn off" verb="Turn off" what={`bank notifications for ${channel.name}`} busy={turnOff.isPending}
                  consequence="KodiHub stops accepting notifications for this account. Payments already recorded stay. You can still import statements."
                  onConfirm={() => turnOff.mutate()} />
              </>
            ) : (
              <button type="button" className="nx-btn nx-btn--sm" disabled={busy || !active} onClick={() => turnOn.mutate()}>
                {turnOn.isPending ? 'Turning on…' : 'Turn on'}
              </button>
            )}
          </div>
        ) : null}
        {webhook || canManage ? <SigningHelp /> : null}
      </div>
    </article>
  );
}

/** Past imports, fetched only once opened. */
function ImportHistory({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  const history = useStatementImports(channelId, open);
  const rows = history.data ?? [];

  return (
    <details className="bk__details" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Past imports</summary>
      {!open ? null
        : history.isPending ? <TableSkeleton rows={2} />
          : history.isError ? <p className="ad__error" role="alert">{banksErrorMessage(history.error)}</p>
            : rows.length === 0 ? <p className="ad__muted">No statements imported yet.</p>
              : (
                <ul className="bk__history">
                  {rows.map((row) => <ImportRow key={row.id} row={row} />)}
                </ul>
              )}
    </details>
  );
}

function ImportRow({ row }: { row: StatementImport }) {
  const by = row.createdBy?.name ?? ([row.createdBy?.firstName, row.createdBy?.lastName].filter(Boolean).join(' ') || null);
  const unmatched = Math.max(0, row.created - row.matched);
  return (
    <li className="bk__historyrow">
      <div className="bk__historyhead">
        <strong className="bk__filename">{row.filename || 'Statement'}</strong>
        <span className="ad__sub">{formatDateTime(row.createdAt)}{by ? ` · ${by}` : ''}</span>
      </div>
      <span className="ad__sub num">
        {row.credits} credits · {row.created} new · {row.matched} matched{unmatched ? ` · ${unmatched} to match` : ''}{row.duplicates ? ` · ${row.duplicates} already in` : ''}
      </span>
    </li>
  );
}

/** How a sender signs a notification. Short, for the person who sets up the integration. */
function SigningHelp() {
  return (
    <details className="bk__details">
      <summary>How to send a notification</summary>
      <div className="bk__help">
        <p>POST JSON to the notification address with two headers:</p>
        <ul>
          <li><code>X-Hodi-Timestamp</code>: the time in Unix seconds. KodiHub refuses one more than 5 minutes off.</li>
          <li><code>X-Hodi-Signature</code>: <code>sha256=</code> then the HMAC-SHA256 (hex) of <code>timestamp + "." + raw body</code>, keyed with the secret.</li>
        </ul>
        <p>The body:</p>
        <pre className="bk__code">{`{ "transactions": [ {
  "id": "BANK-TXN-0001",
  "amount": "1500.00",
  "reference": "T00001 rent",
  "payerName": "Test Payer",
  "payerAccount": "0000000000",
  "occurredAt": "2026-10-28T09:30:00+03:00"
} ] }`}</pre>
        <p className="hint">
          <code>amount</code> is in shillings, as text. <code>payerName</code> and <code>payerAccount</code> are optional. The bank’s
          <code> id</code> is the key: sending the same transaction again adds nothing.
        </p>
      </div>
    </details>
  );
}

/** The new secret, shown once: copy it now, it can’t be shown again. */
function SecretSheet({ channel, secret, onClose }: { channel: PaymentChannel; secret: BankWebhookSecret; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const copySecret = async () => {
    try {
      await copyText(secret.secret);
      setCopied(true);
    } catch {
      toast.failed('Couldn’t copy. Select the secret and copy it by hand.');
    }
  };

  return (
    <Sheet
      title={`Bank notifications — ${channel.name}`}
      wide
      onClose={onClose}
      footer={<button type="button" className="nx-btn nx-btn--primary" onClick={onClose}>{copied ? 'Done' : 'I’ve stored it'}</button>}
    >
      <div className="sheet-form">
        <p className="ad__callout ad__callout--note ag__warnnote" role="note">
          <strong>Store the secret now.</strong> KodiHub keeps it encrypted and won’t show it again. If it’s lost, make a new
          one with “New secret” — the old one then stops working.
        </p>
        <dl className="mp__urls">
          <CallbackUrl label="Notification address" url={secret.url} />
          <div className="mp__url">
            <dt>Secret</dt>
            <dd>
              <code className="num">{secret.secret}</code>
              <button type="button" className="nx-btn nx-btn--sm" onClick={copySecret} aria-label="Copy the secret">{copied ? 'Copied' : 'Copy'}</button>
            </dd>
          </div>
        </dl>
        <p className="hint">Give both to whoever sets up the bank’s notifications. Keep the secret private: anyone with it could send fake deposits.</p>
        <SigningHelp />
      </div>
    </Sheet>
  );
}
