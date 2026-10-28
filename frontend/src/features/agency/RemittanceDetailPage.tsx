import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan, useSession } from '../../lib/auth/useAuth';
import { formatDateTime, todayInNairobi } from '../../lib/dates';
import { formatPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { Sheet } from '../../components/Sheet';
import { SignedAmount } from '../payments/ui';
import { Badge, Breadcrumbs, Fact, Field } from '../portfolio/ui';
import { AFTER_LEDGER_KEYS, agencyErrorMessage, useLandlordAccount, useRemittance } from './api';
import { PAYOUT_METHOD, REMITTANCE_DIRECTION, REMITTANCE_STATUS } from './labels';
import { checkPaid, describeNet, personLabel, remittanceActions } from './rules';
import type { PaidDraft } from './rules';
import type { PayoutMethod, Remittance } from './types';

/**
 * One remittance: the breakdown behind its net, who drafted, approved and paid it, and
 * the next step — Approve (never offered to whoever drafted it), Mark paid (with the
 * landlord's masked payout details, method and reference) or Cancel.
 */
export function RemittanceDetailPage() {
  const { remittanceId = '' } = useParams();
  const session = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const remittance = useRemittance(remittanceId);
  const [dialog, setDialog] = useState<'pay' | 'cancel' | null>(null);
  const refresh = () => Promise.all(AFTER_LEDGER_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

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
          {actions.approve ? (
            <button type="button" className="nx-btn nx-btn--primary" disabled={approve.isPending} onClick={() => approve.mutate()}>
              {approve.isPending ? 'Approving…' : 'Approve'}
            </button>
          ) : null}
          {actions.pay ? <button type="button" className="nx-btn nx-btn--primary" onClick={() => setDialog('pay')}>{toLandlord ? 'Mark paid' : 'Mark received'}</button> : null}
          {actions.cancel ? <button type="button" className="nx-btn nx-btn--danger" onClick={() => setDialog('cancel')}>Cancel remittance</button> : null}
        </div>
      </div>

      {actions.approveBlocked ? <p className="ad__callout ad__callout--note ag__warnnote" role="note">{actions.approveBlocked}</p> : null}
      {r.status === 'DRAFT' && !actions.approve && !actions.approveBlocked ? (
        <p className="ad__muted">Waiting for someone who can approve remittances.</p>
      ) : null}
      {r.status === 'APPROVED' && !actions.pay ? <p className="ad__muted">Approved — waiting for someone who can pay remittances to record the payment.</p> : null}

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
          <Fact label="Paid">{r.paidAt ? `${personLabel(r.paidBy)} · ${formatDateTime(r.paidAt)}` : null}</Fact>
          <Fact label="Method">{r.method ? PAYOUT_METHOD[r.method] ?? r.method : null}</Fact>
          <Fact label="Reference">{r.reference ? <span className="num">{r.reference}</span> : null}</Fact>
          <Fact label="Paid to">{r.payoutMasked ? <span className="num">{r.payoutMasked}</span> : null}</Fact>
          {r.status === 'CANCELLED' ? <Fact label="Cancelled because" wide>{r.cancelledReason}</Fact> : null}
        </dl>
      </section>

      {dialog === 'pay' ? <MarkPaidSheet remittance={r} onClose={() => setDialog(null)} /> : null}
      {dialog === 'cancel' ? <CancelSheet remittance={r} onClose={() => setDialog(null)} /> : null}
    </div>
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
