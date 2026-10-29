import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { useCan, useSession } from '../../lib/auth/useAuth';
import { formatDateTime, formatDay, todayInNairobi } from '../../lib/dates';
import { formatPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { Sheet } from '../../components/Sheet';
import { SignedAmount } from '../payments/ui';
import { Badge, Breadcrumbs, Fact, Field } from '../portfolio/ui';
import { formatKES } from '../../lib/money';
import { newKey } from '../mpesa/rules';
import { unwrap } from '../payments/rules';
import { AFTER_LEDGER_KEYS, agencyErrorMessage, agencyKeys, payoutErrorMessage, useLandlordAccount, useRemittance } from './api';
import { PAYOUT_METHOD, PAYOUT_STATE, REMITTANCE_DIRECTION, REMITTANCE_STATUS } from './labels';
import {
  PAYOUT_WAIT_MS, canSendByMpesa, checkPaid, checkResolve, describeNet, describePayout, isWholeShillings, payoutInFlight,
  payoutPollDelay, personLabel, remittanceActions,
} from './rules';
import type { PaidDraft, ResolveDraft } from './rules';
import type { PayoutMethod, PayoutSummary, Remittance } from './types';

/**
 * One remittance: the breakdown behind its net, who drafted, approved and paid it, and
 * the next step — Approve (never offered to whoever drafted it), Mark paid (with the
 * landlord's masked payout details, method and reference) or Cancel.
 *
 * Phase 10: an approved remittance to a landlord paid by M-Pesa can be **sent by M-Pesa**
 * (B2C) from here. While it is sending, the page asks for its state every 3 s for about
 * three minutes. A payout M-Pesa never confirmed (`UNCERTAIN`) is never retried: a
 * person checks the B2C statement and resolves it as paid or not paid.
 */
export function RemittanceDetailPage() {
  const { remittanceId = '' } = useParams();
  const session = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [followFrom, setFollowFrom] = useState(() => Date.now());
  const [gaveUp, setGaveUp] = useState(false);
  const remittance = useRemittance(remittanceId, (r) => payoutPollDelay(r, followFrom, Date.now()));
  const canSeeLandlord = useCan('landlords:view');
  const landlordId = remittance.data?.landlord.id ?? '';
  // How the landlord is paid: from the remittance when the server says, else their account.
  const account = useLandlordAccount(landlordId, canSeeLandlord && remittance.data?.payoutTo === undefined);
  const [dialog, setDialog] = useState<'pay' | 'cancel' | 'send' | 'resolve' | null>(null);
  const refresh = () => Promise.all(AFTER_LEDGER_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

  const status = remittance.data?.status;
  const inFlight = remittance.data ? payoutInFlight(remittance.data) : false;

  // Stop saying "waiting" after about three minutes; "Check again" starts another three.
  useEffect(() => {
    if (!inFlight) return undefined;
    const timer = setTimeout(() => setGaveUp(true), Math.max(0, followFrom + PAYOUT_WAIT_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [inFlight, followFrom]);

  // When a payout settles, the ledger, balances and list move too. Only an answer the
  // page was waiting for is announced; a resolve announces itself.
  const payoutState = remittance.data?.payout?.state;
  const last = useRef({ status, payoutState });
  useEffect(() => {
    const before = last.current;
    last.current = { status, payoutState };
    if (before.status !== 'SENDING' || !status || status === 'SENDING') return;
    if (before.payoutState === 'PENDING' && payoutState === 'SUCCESS') {
      toast.saved(`${remittance.data?.number ?? 'The remittance'} was sent by M-Pesa and marked paid.`);
    } else if (before.payoutState === 'PENDING' && payoutState === 'FAILED') {
      toast.failed('M-Pesa didn’t send the payout. The reason is on the page.');
    }
    void Promise.all(AFTER_LEDGER_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  }, [status, payoutState, remittance.data?.number, queryClient, toast]);

  const follow = (next?: Remittance) => {
    if (next) queryClient.setQueryData([...agencyKeys.remittances, remittanceId], next);
    setGaveUp(false);
    setFollowFrom(Date.now());
  };

  const approve = useMutation({
    mutationFn: () => api.post<unknown>(`/remittances/${remittanceId}/approve`),
    onSuccess: async () => {
      toast.saved(`${remittance.data?.number ?? 'The remittance'} was approved. It can now be paid.`);
      await refresh();
    },
    onError: (error) => toast.failed(agencyErrorMessage(error)),
  });

  if (remittance.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (remittance.isError) {
    return (
      <div className="ph">
        <EmptyState title="Remittance not available" detail={agencyErrorMessage(remittance.error)}
          action={<Link className="nx-btn nx-btn--sm" to="/app/remittances">Back to remittances</Link>} />
      </div>
    );
  }

  const r = remittance.data;
  const actions = remittanceActions(r, { id: session.user.id, permissions: session.permissions });
  const toLandlord = r.direction !== 'FROM_LANDLORD';
  const payoutTo: Pick<PayoutSummary, 'method'> & { masked: string | null } | null = r.payoutTo !== undefined ? r.payoutTo : account.data?.payout ?? null;
  const canSend = canSendByMpesa(r, payoutTo?.method, session.permissions);
  const canResolve = r.payout?.state === 'UNCERTAIN' && session.permissions.includes('remittances:pay');

  return (
    <div className="pg pf__page">
      <Breadcrumbs trail={[{ label: 'Remittances', to: '/app/remittances' }, { label: r.number }]} />

      <div className="pf__head">
        <div>
          <h1><span className="num">{r.number}</span> <Badge table={REMITTANCE_STATUS} value={r.status} /></h1>
          <p>
            <Link to={`/app/landlords/${r.landlord.id}`}>{r.landlord.name}</Link> · {formatPeriod(r.period, true)} ·{' '}
            {REMITTANCE_DIRECTION[r.direction] ?? r.direction}
          </p>
        </div>
        <div className="sl__headactions">
          {canSend ? <button type="button" className="nx-btn nx-btn--primary" onClick={() => setDialog('send')}>Send by M-Pesa</button> : null}
          {canResolve ? <button type="button" className="nx-btn nx-btn--primary" onClick={() => setDialog('resolve')}>Resolve</button> : null}
          {actions.approve ? (
            <button type="button" className="nx-btn nx-btn--primary" disabled={approve.isPending} onClick={() => approve.mutate()}>
              {approve.isPending ? 'Approving…' : 'Approve'}
            </button>
          ) : null}
          {actions.pay ? (
            <button type="button" className={`nx-btn ${canSend ? '' : 'nx-btn--primary'}`} onClick={() => setDialog('pay')}>
              {toLandlord ? 'Mark paid' : 'Mark received'}
            </button>
          ) : null}
          {actions.cancel ? <button type="button" className="nx-btn nx-btn--danger" onClick={() => setDialog('cancel')}>Cancel remittance</button> : null}
        </div>
      </div>

      {actions.approveBlocked ? <p className="ad__callout ad__callout--note ag__warnnote" role="note">{actions.approveBlocked}</p> : null}
      {r.status === 'DRAFT' && !actions.approve && !actions.approveBlocked ? (
        <p className="ad__muted">Waiting for someone who can approve remittances.</p>
      ) : null}
      {r.status === 'APPROVED' && !actions.pay ? <p className="ad__muted">Approved — waiting for someone who can pay remittances to record the payment.</p> : null}

      {r.payout ? (
        <PayoutStatus remittance={r} inFlight={inFlight} gaveUp={gaveUp} canResolve={canResolve}
          onCheckAgain={() => { follow(); void remittance.refetch(); }} onResolve={() => setDialog('resolve')} />
      ) : r.status === 'SENDING' ? (
        <section className="ag__card bk__payoutstate" aria-live="polite"><p className="bk__live"><span className="mp__spinner" aria-hidden="true" />Sending by M-Pesa…</p></section>
      ) : null}

      <section className="ag__card ag__breakdown" aria-labelledby="rm-breakdown">
        <h3 id="rm-breakdown">How the amount was worked out</h3>
        <ul className="ag__lines">
          {typeof r.broughtForward === 'number' ? <Line label="Brought forward" minor={r.broughtForward} /> : null}
          <Line label="Collected from tenants" minor={r.collections} />
          <Line label="Commission" minor={-Math.abs(r.commission)} />
          <Line label="Expenses" minor={-Math.abs(r.expenses)} />
          {r.adjustments ? <Line label="Adjustments" minor={r.adjustments} /> : null}
          <li className="ag__line ag__line--edge">
            <span className="ag__linelabel">{toLandlord ? 'To pay the landlord' : 'Landlord owes the agency'}</span>
            <SignedAmount minor={r.net} />
          </li>
        </ul>
        <p className="hint ag__note">{describeNet(r)}. Amounts in red reduce what the landlord is paid.</p>
      </section>

      <section className="fm__section">
        <h2>History</h2>
        <dl className="pf__facts">
          <Fact label="Drafted">{r.draftedBy ? `${personLabel(r.draftedBy)} · ` : 'Automatically · '}{formatDateTime(r.createdAt)}</Fact>
          <Fact label="Approved">{r.approvedAt ? `${personLabel(r.approvedBy)} · ${formatDateTime(r.approvedAt)}` : null}</Fact>
          <Fact label="Paid">{r.paidAt ? `${personLabel(r.paidBy)} · ${formatDay(r.paidAt.slice(0, 10))}` : null}</Fact>
          <Fact label="Method">{r.method ? PAYOUT_METHOD[r.method] ?? r.method : null}</Fact>
          <Fact label="Reference">{r.reference ? <span className="num">{r.reference}</span> : null}</Fact>
          <Fact label="Paid to">{r.payoutMasked ? <span className="num">{r.payoutMasked}</span> : null}</Fact>
          {r.status === 'CANCELLED' ? <Fact label="Cancelled because" wide>{r.cancelledReason}</Fact> : null}
        </dl>
      </section>

      {dialog === 'pay' ? <MarkPaidSheet remittance={r} onClose={() => setDialog(null)} /> : null}
      {dialog === 'cancel' ? <CancelSheet remittance={r} onClose={() => setDialog(null)} /> : null}
      {dialog === 'send' ? (
        <SendSheet remittance={r} payout={payoutTo} onClose={() => setDialog(null)}
          onSent={(next) => { follow(next); setDialog(null); }} />
      ) : null}
      {dialog === 'resolve' ? (
        <ResolveSheet remittance={r} onClose={() => setDialog(null)}
          onResolved={async (next) => { if (next) queryClient.setQueryData([...agencyKeys.remittances, remittanceId], next); setDialog(null); await refresh(); }} />
      ) : null}
    </div>
  );
}

/** The M-Pesa payout's state: live while sending, the receipt once sent, the reason on a failure. */
function PayoutStatus({ remittance: r, inFlight, gaveUp, canResolve, onCheckAgain, onResolve }: {
  remittance: Remittance;
  inFlight: boolean;
  gaveUp: boolean;
  canResolve: boolean;
  onCheckAgain: () => void;
  onResolve: () => void;
}) {
  const p = r.payout;
  if (!p) return null;
  const uncertain = p.state === 'UNCERTAIN';
  return (
    <section className={`ag__card bk__payoutstate ${uncertain ? 'bk__payoutstate--warn' : p.state === 'FAILED' ? 'bk__payoutstate--bad' : ''}`}
      aria-labelledby="rm-payout" aria-live="polite">
      <div className="bk__payouthead">
        <h3 id="rm-payout">M-Pesa payout</h3>
        <Badge table={PAYOUT_STATE} value={p.state} />
      </div>
      {uncertain ? (
        <div role="alert" className="bk__uncertain">
          <p><strong>M-Pesa didn’t confirm. Check the B2C account’s M-Pesa statement before doing anything.</strong></p>
          <p>Don’t send it again or pay it another way until you know. If the money left the account, resolve it as paid with the receipt; if not, resolve it as not paid and it goes back to approved.</p>
          {canResolve ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={onResolve}>Resolve</button> : null}
        </div>
      ) : (
        <p className={inFlight ? 'bk__live' : undefined}>
          {inFlight && !gaveUp ? <span className="mp__spinner" aria-hidden="true" /> : null}
          {describePayout(p)}
        </p>
      )}
      {inFlight && gaveUp ? (
        <p className="hint">
          Still no answer from M-Pesa. It can take a few minutes; if there’s none within 30 minutes KodiHub marks it not confirmed.{' '}
          <button type="button" className="nx-btn nx-btn--sm" onClick={onCheckAgain}>Check again</button>
        </p>
      ) : null}
      <dl className="pf__facts">
        <Fact label="Amount"><span className="num">{formatKES(p.amount)}</span></Fact>
        <Fact label="To">{p.phone ? <span className="num">{p.phone}</span> : null}</Fact>
        <Fact label="M-Pesa receipt">{p.receipt ? <span className="num">{p.receipt}</span> : null}</Fact>
        <Fact label="Sent">{formatDateTime(p.createdAt)}</Fact>
        {p.completedAt ? <Fact label="Settled">{formatDateTime(p.completedAt)}</Fact> : null}
        {p.resolvedNote ? <Fact label="Resolved with the note" wide>{p.resolvedNote}</Fact> : null}
      </dl>
    </section>
  );
}

/**
 * Confirm and send by M-Pesa B2C. One `Idempotency-Key` per dialog: pressing Send again
 * after a dropped answer can't send the money twice.
 */
function SendSheet({ remittance: r, payout, onClose, onSent }: {
  remittance: Remittance;
  payout: { method: PayoutMethod; masked: string | null } | null;
  onClose: () => void;
  onSent: (next: Remittance | undefined) => void;
}) {
  const [key] = useState(newKey);
  const [error, setError] = useState<unknown>(null);
  const amount = Math.abs(r.net);
  const whole = isWholeShillings(amount);

  const send = useMutation({
    mutationFn: () => api.post<unknown>(`/remittances/${r.id}/send`, undefined, { headers: { 'Idempotency-Key': key } })
      .then((body) => unwrap<Remittance | undefined>(body)),
    onSuccess: (next) => onSent(next && typeof next === 'object' && 'id' in next ? next : undefined),
    onError: (e) => setError(e),
  });

  const noAccount = error instanceof ApiError && error.code === 'NO_PAYOUT_ACCOUNT';

  return (
    <Sheet
      title={`Send ${r.number} by M-Pesa`}
      busy={send.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={send.isPending}>Cancel</button>
          <button type="button" className="nx-btn nx-btn--primary" disabled={send.isPending || !whole} onClick={() => { setError(null); send.mutate(); }}>
            {send.isPending ? 'Sending…' : `Send ${formatKES(amount)}`}
          </button>
        </>
      )}
    >
      <div className="pf__dialogform">
        <p className="ag__amountdue num">{formatKES(amount)}</p>
        <p>
          To <strong>{r.landlord.name}</strong>
          {payout?.method === 'MPESA' && payout.masked ? <> on <strong className="num">{payout.masked}</strong></> : ' on their M-Pesa number on file'}.
          {' '}It comes out of your M-Pesa payout (B2C) account and can’t be called back once sent.
        </p>
        {!whole ? (
          <p className="ad__callout ad__callout--note ag__warnnote" role="note">
            M-Pesa can only send whole shillings, and this amount has cents. Pay it outside KodiHub and mark it paid instead.
          </p>
        ) : (
          <p className="hint">Sending asks for a verification code. The page then follows the payout until M-Pesa confirms it.</p>
        )}
        {error ? (
          <p className="nx-sheet__error" role="alert">
            {payoutErrorMessage(error)}
            {noAccount ? <> <Link to="/app/settings/payouts">Go to Settings → Payouts</Link></> : null}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

/** Settle a payout M-Pesa never confirmed, after checking the B2C account's statement. */
function ResolveSheet({ remittance: r, onClose, onResolved }: {
  remittance: Remittance;
  onClose: () => void;
  onResolved: (next: Remittance | undefined) => Promise<void> | void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<ResolveDraft>({ outcome: '', receipt: '', note: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof ResolveDraft, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);

  const resolve = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<unknown>(`/remittances/${r.id}/payout/resolve`, body)
      .then((res) => unwrap<Remittance | undefined>(res)),
    onSuccess: async (next) => {
      toast.saved(draft.outcome === 'PAID' ? `${r.number} was marked paid.` : `${r.number} is back to approved. Nothing was paid.`);
      await onResolved(next && typeof next === 'object' && 'id' in next ? next : undefined);
    },
    onError: (e) => setGeneral(payoutErrorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const checked = checkResolve(draft);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    resolve.mutate(checked.body);
  };

  return (
    <Sheet
      title={`Resolve the payout for ${r.number}`}
      busy={resolve.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={resolve.isPending}>Cancel</button>
          <button type="submit" form="resolve-payout" className="nx-btn nx-btn--primary" disabled={resolve.isPending}>
            {resolve.isPending ? 'Saving…' : 'Resolve'}
          </button>
        </>
      )}
    >
      <form id="resolve-payout" className="pf__dialogform" onSubmit={submit} noValidate>
        <p>Check the B2C account’s M-Pesa statement for {r.payout ? <strong className="num">{formatKES(r.payout.amount)}</strong> : 'this payout'}{r.payout?.phone ? <> to <span className="num">{r.payout.phone}</span></> : null}, then say what you found.</p>
        <div className={`fld ${errors.outcome ? 'is-bad' : ''}`}>
          <span className="fld__label">On the statement</span>
          <div className="pf__radios" role="radiogroup" aria-label="On the statement">
            <label className="fld__check">
              <input type="radio" name="rs-outcome" checked={draft.outcome === 'PAID'} onChange={() => setDraft((d) => ({ ...d, outcome: 'PAID' }))} />
              The money was sent
            </label>
            <label className="fld__check">
              <input type="radio" name="rs-outcome" checked={draft.outcome === 'NOT_PAID'} onChange={() => setDraft((d) => ({ ...d, outcome: 'NOT_PAID' }))} />
              It wasn’t sent
            </label>
          </div>
          {errors.outcome ? <span className="fld__err">{errors.outcome}</span> : null}
        </div>
        {draft.outcome === 'PAID' ? (
          <Field id="rs-receipt" label="M-Pesa receipt" error={errors.receipt} hint="From the statement line, e.g. SJR4XK2L9P.">
            <input id="rs-receipt" value={draft.receipt} autoComplete="off" spellCheck={false} aria-invalid={Boolean(errors.receipt)}
              onChange={(e) => setDraft((d) => ({ ...d, receipt: e.target.value }))} />
          </Field>
        ) : null}
        <Field id="rs-note" label="Note" error={errors.note} hint={draft.outcome === 'NOT_PAID' ? 'It goes back to approved, so it can be sent again or paid another way.' : undefined}>
          <textarea id="rs-note" value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} aria-invalid={Boolean(errors.note)} />
        </Field>
        <p className="hint">Resolving asks for a verification code.</p>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

function Line({ label, minor }: { label: string; minor: number }) {
  return (
    <li className="ag__line">
      <span className="ag__linelabel">{label}</span>
      <SignedAmount minor={minor} />
    </li>
  );
}

function MarkPaidSheet({ remittance: r, onClose }: { remittance: Remittance; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const today = todayInNairobi();
  const canSeeLandlord = useCan('landlords:view');
  const account = useLandlordAccount(r.landlord.id, canSeeLandlord);
  const payout = account.data?.payout ?? null;
  const toLandlord = r.direction !== 'FROM_LANDLORD';
  const [draft, setDraft] = useState<PaidDraft>({ method: payout?.method ?? 'BANK', reference: '', paidAt: today });
  const [touchedMethod, setTouchedMethod] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'reference' | 'paidAt', string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  // Follow the payout method on file until the person picks one themselves.
  const method = touchedMethod ? draft.method : payout?.method ?? draft.method;

  const pay = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<unknown>(`/remittances/${r.id}/pay`, body),
    onSuccess: async () => {
      toast.saved(`${r.number} was marked ${toLandlord ? 'paid' : 'received'}.`);
      await Promise.all(AFTER_LEDGER_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
    onError: (error) => setGeneral(agencyErrorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const checked = checkPaid({ ...draft, method }, today);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    pay.mutate(checked.body);
  };

  return (
    <Sheet
      title={toLandlord ? `Mark ${r.number} paid` : `Mark ${r.number} received`}
      busy={pay.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={pay.isPending}>Cancel</button>
          <button type="submit" form="pay-remittance" className="nx-btn nx-btn--primary" disabled={pay.isPending}>
            {pay.isPending ? 'Saving…' : toLandlord ? 'Mark paid' : 'Mark received'}
          </button>
        </>
      )}
    >
      <form id="pay-remittance" className="sheet-form" onSubmit={submit} noValidate>
        <p className="ag__amountdue num"><SignedAmount minor={Math.abs(r.net)} /></p>
        {toLandlord ? (
          <div className="ad__callout ad__callout--note ag__warnnote">
            {!canSeeLandlord ? 'Check the landlord’s payout details on their page before paying.'
              : account.isPending ? 'Loading payout details…'
                : payout ? <>Pay to <strong>{PAYOUT_METHOD[payout.method] ?? String(payout.method)}</strong> <strong className="num">{payout.masked}</strong>. Check it matches before sending money.</>
                  : <>{r.landlord.name} has no payout details on file. Add them on the landlord’s page first, or confirm with them where to pay.</>}
          </div>
        ) : (
          <p className="hint">The landlord owes the agency this amount (commission or expenses beyond what was collected). Record it once they’ve paid.</p>
        )}
        <div className="fm__grid sheet-grid">
          <Field id="pay-method" label="Method">
            <select id="pay-method" value={method} onChange={(e) => { setTouchedMethod(true); setDraft((d) => ({ ...d, method: e.target.value as PayoutMethod })); }}>
              {(Object.keys(PAYOUT_METHOD) as PayoutMethod[]).map((m) => <option key={m} value={m}>{PAYOUT_METHOD[m]}</option>)}
            </select>
          </Field>
          <Field id="pay-ref" label={method === 'MPESA' ? 'M-Pesa code' : method === 'CHEQUE' ? 'Cheque number' : 'Transfer reference'} error={errors.reference}>
            <input id="pay-ref" value={draft.reference} onChange={(e) => setDraft((d) => ({ ...d, reference: e.target.value }))} autoComplete="off" aria-invalid={Boolean(errors.reference)} />
          </Field>
          <Field id="pay-date" label={toLandlord ? 'Paid on' : 'Received on'} error={errors.paidAt}>
            <input id="pay-date" type="date" max={today} value={draft.paidAt} onChange={(e) => setDraft((d) => ({ ...d, paidAt: e.target.value }))} aria-invalid={Boolean(errors.paidAt)} />
          </Field>
        </div>
        <p className="hint">This records the payout in the landlord’s ledger. It doesn’t move any money — send it from your bank or M-Pesa first.</p>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

function CancelSheet({ remittance: r, onClose }: { remittance: Remittance; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cancel = useMutation({
    mutationFn: () => api.post<unknown>(`/remittances/${r.id}/cancel`, { reason: reason.trim() }),
    onSuccess: async () => {
      toast.saved(`${r.number} was cancelled.`);
      await Promise.all(AFTER_LEDGER_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
    onError: (e) => setError(agencyErrorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 3) { setError('Say why it’s being cancelled.'); return; }
    setError(null);
    cancel.mutate();
  };

  return (
    <Sheet
      title={`Cancel ${r.number}?`}
      busy={cancel.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={cancel.isPending}>Keep it</button>
          <button type="submit" form="cancel-remittance" className="nx-btn nx-btn--danger" disabled={cancel.isPending}>
            {cancel.isPending ? 'Cancelling…' : 'Cancel remittance'}
          </button>
        </>
      )}
    >
      <form id="cancel-remittance" className="pf__dialogform" onSubmit={submit} noValidate>
        <p>Nothing has been paid, so the ledger doesn’t change. A new remittance can be drafted for {formatPeriod(r.period, true)} afterwards.</p>
        <Field id="rm-reason" label="Reason" error={error ?? undefined}>
          <textarea id="rm-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}
