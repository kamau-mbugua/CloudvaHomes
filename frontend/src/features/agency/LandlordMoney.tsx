import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime, formatDay, todayInNairobi } from '../../lib/dates';
import { currentPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { Pager } from '../../components/Pager';
import { Sheet } from '../../components/Sheet';
import { SignedAmount } from '../payments/ui';
import { checkStatementRange } from '../payments/rules';
import { personName } from '../portfolio/labels';
import { Field } from '../portfolio/ui';
import { checkMonthRange } from '../reports/rules';
import {
  AFTER_LEDGER_KEYS, agencyErrorMessage, agencyKeys, downloadLandlordStatement, useAgreements, useLandlordStatement, useLedger,
} from './api';
import { LEDGER_BUCKET, LEDGER_KIND, PAYOUT_METHOD } from './labels';
import { PayoutSheet } from './PayoutSheet';
import { checkAdjustment, describeRate, ordinal, withRunningBalance } from './rules';
import type { AdjustmentDraft } from './rules';
import type { LandlordAccount, LedgerBucket, LedgerEntry } from './types';
import { MonthRangeBar, StatementView } from './ui';

/**
 * The money parts of a landlord's page (phase 6b): the agreement in force (or a warning
 * that there is none), payout details, owner-portal access, the ledger and the statement.
 */

type LandlordBasics = { id: string; code: string; name: string; phone: string; email: string | null };

// ---------------------------------------------------------------- agreement

/** The active agreement in one line, or a warning that money is recorded without commission. */
export function AgreementNotice({ landlordId, hasActiveAgreement }: { landlordId: string; hasActiveAgreement: boolean | undefined }) {
  const canView = useCan('agreements:view');
  const canCreate = useCan('agreements:create');
  const list = useAgreements({ landlordId, active: true }, canView);
  // Without agreements:view the account's flag still says whether there is one.
  const active = canView && list.data ? list.data : [];
  const none = canView && list.data ? active.length === 0 : hasActiveAgreement === false;

  if (none) {
    return (
      <div className="ad__callout ag__warn" role="note">
        <p>
          <strong>No active management agreement.</strong> Money collected on this landlord’s properties is still recorded in
          their ledger, but no commission is charged until an agreement is in place.
        </p>
        {canCreate ? <Link className="nx-btn nx-btn--sm nx-btn--primary" to={`/app/agreements?landlordId=${encodeURIComponent(landlordId)}`}>Add agreement</Link> : null}
      </div>
    );
  }

  if (active.length === 0) return null;

  return (
    <div className="ad__callout ag__agreement">
      <p>
        <strong>Agreement:</strong>{' '}
        {active.map((a) => `${describeRate(a)}, remitted on the ${ordinal(a.remittanceDay)}${a.collection === 'LANDLORD_COLLECTS' ? ', landlord collects rent' : ''}${a.propertyIds.length ? ` (${a.propertyIds.length} ${a.propertyIds.length === 1 ? 'property' : 'properties'})` : ''}`).join('; ')}
      </p>
      <Link className="nx-btn nx-btn--sm" to={`/app/agreements?landlordId=${encodeURIComponent(landlordId)}&show=all`}>Agreements</Link>
    </div>
  );
}

// ---------------------------------------------------------------- payout + portal

export function PayoutCard({ landlord, account }: { landlord: LandlordBasics; account: LandlordAccount }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canUpdate = useCan('landlords:update');
  const [editing, setEditing] = useState(false);
  const payout = account.payout ?? null;

  const remove = useMutation({
    mutationFn: () => api.delete<unknown>(`/landlords/${landlord.id}/payout`),
    onSuccess: async () => {
      toast.saved(`${landlord.name}’s payout details were removed. They have been told.`);
      await queryClient.invalidateQueries({ queryKey: agencyKeys.accounts });
    },
    onError: (error) => toast.failed(agencyErrorMessage(error)),
  });

  return (
    <section className="ag__card" aria-labelledby="payout-title">
      <h3 id="payout-title">Payout details</h3>
      {payout ? (
        <p className="ag__masked">
          <span>{PAYOUT_METHOD[payout.method] ?? String(payout.method)}</span>
          <strong className="num">{payout.masked}</strong>
          {payout.updatedAt ? <span className="ad__sub">Changed {formatDateTime(payout.updatedAt)}</span> : null}
        </p>
      ) : (
        <p className="ad__muted">None on file. Add where remittances are paid before the first payout.</p>
      )}
      {canUpdate ? (
        <div className="ag__cardactions">
          <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(true)}>{payout ? 'Change' : 'Add payout details'}</button>
          {payout ? (
            <ConfirmDelete size="sm" label="Remove" verb="Remove" what={`${landlord.name}’s payout details`} busy={remove.isPending}
              consequence="Remittances can’t be marked paid until new details are added. You’ll be asked for a verification code, and the landlord is told."
              onConfirm={() => remove.mutate()} />
          ) : null}
        </div>
      ) : null}
      <p className="hint">Changing them needs a verification code, and the landlord is told by SMS and e-mail.</p>
      {editing ? <PayoutSheet landlord={landlord} current={payout} onClose={() => setEditing(false)} /> : null}
    </section>
  );
}

export function PortalCard({ landlord, account }: { landlord: LandlordBasics; account: LandlordAccount }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canUpdate = useCan('landlords:update');
  const [asking, setAsking] = useState(false);
  const portal = account.portal ?? { hasAccess: false, invitedAt: null };
  const refresh = () => queryClient.invalidateQueries({ queryKey: agencyKeys.accounts });

  const give = useMutation({
    mutationFn: () => api.post<unknown>(`/landlords/${landlord.id}/portal-access`),
    onSuccess: async () => {
      toast.saved(`${landlord.name} can now sign in to the owner portal. They’ve been sent how.`);
      setAsking(false);
      await refresh();
    },
    onError: (error) => toast.failed(agencyErrorMessage(error)),
  });
  const revoke = useMutation({
    mutationFn: () => api.delete<unknown>(`/landlords/${landlord.id}/portal-access`),
    onSuccess: async () => {
      toast.saved(`${landlord.name} can no longer open the owner portal.`);
      await refresh();
    },
    onError: (error) => toast.failed(agencyErrorMessage(error)),
  });
  const contact = [landlord.phone, landlord.email].filter(Boolean).join(' and ');

  return (
    <section className="ag__card" aria-labelledby="portal-title">
      <h3 id="portal-title">Owner portal</h3>
      {portal.hasAccess ? (
        <p className="ag__masked">
          <span className="ad__badge ad__badge--ok">Has access</span>
          {portal.invitedAt ? <span className="ad__sub">Invited {formatDateTime(portal.invitedAt)}</span> : null}
        </p>
      ) : (
        <p className="ad__muted">They can’t sign in yet. With access, they see their own balances, statements and payouts on their phone — read only.</p>
      )}
      {canUpdate ? (
        <div className="ag__cardactions">
          {portal.hasAccess ? (
            <ConfirmDelete size="sm" label="Remove access" verb="Remove portal access for" what={landlord.name} busy={revoke.isPending}
              consequence="They can no longer sign in to see their statements and payouts. Nothing in their ledger changes; you can give access again later."
              onConfirm={() => revoke.mutate()} />
          ) : (
            <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setAsking(true)}>Give portal access</button>
          )}
        </div>
      ) : null}

      {asking ? (
        <Sheet
          title={`Give ${landlord.name} portal access?`}
          busy={give.isPending}
          onClose={() => setAsking(false)}
          footer={(
            <>
              <button type="button" className="nx-btn" onClick={() => setAsking(false)} disabled={give.isPending}>Cancel</button>
              <button type="button" className="nx-btn nx-btn--primary" onClick={() => give.mutate()} disabled={give.isPending}>
                {give.isPending ? 'Sending…' : 'Give access'}
              </button>
            </>
          )}
        >
          <p>
            KodiHub sends a message to <span className="num">{contact || 'their contact'}</span> explaining how to sign in with a one-time
            code — no password. They’ll see only this landlord’s properties, statements and payouts, and can’t change anything.
          </p>
        </Sheet>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- ledger

/** Where a ledger row links. */
function entrySource(e: LedgerEntry) {
  if (e.payment) return { to: `/app/payments/${e.payment.id}`, text: e.payment.number };
  if (e.invoice) return { to: `/app/invoices/${e.invoice.id}`, text: e.invoice.number };
  if (e.remittance) return { to: `/app/remittances/${e.remittance.id}`, text: e.remittance.number };
  if (e.expense) return { to: '/app/expenses', text: e.expense.name };
  return null;
}

export function LedgerTab({ landlord, account }: { landlord: LandlordBasics; account: LandlordAccount | undefined }) {
  const canAdjust = useCan('remittances:approve');
  const today = todayInNairobi();
  const [bucket, setBucket] = useState<LedgerBucket>('PAYABLE');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState(false);
  const rangeError = checkStatementRange(from, to);
  const ledger = useLedger(landlord.id, { bucket, from: from || undefined, to: to || undefined, page }, !rangeError);
  const rows = ledger.data?.data ?? [];
  const balances = account?.balances;
  // Each row carries its running balance; were one ever missing, it is worked back from
  // today's balance — only on the newest page with no end date.
  const closing = page === 1 && !to && balances ? (bucket === 'PAYABLE' ? balances.payable : balances.depositHeld) : null;
  const shown = withRunningBalance(rows, closing);

  const pick = (next: LedgerBucket) => { setBucket(next); setPage(1); };

  return (
    <section className="ag__ledger">
      <div className="ad__filters">
        <div className="pf__tabs" role="tablist" aria-label="Ledger">
          {(['PAYABLE', 'DEPOSIT_HELD'] as LedgerBucket[]).map((b) => (
            <button key={b} type="button" role="tab" aria-selected={bucket === b} className="pf__tab" onClick={() => pick(b)}>{LEDGER_BUCKET[b]}</button>
          ))}
        </div>
        <label className="py__daterange">
          <span>From</span>
          <input type="date" className="ad__select" aria-label="Ledger from" max={to || today} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </label>
        <label className="py__daterange">
          <span>To</span>
          <input type="date" className="ad__select" aria-label="Ledger to" min={from || undefined} max={today} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </label>
        {from || to ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => { setFrom(''); setTo(''); setPage(1); }}>All dates</button> : null}
        {canAdjust ? <button type="button" className="nx-btn pg-push" onClick={() => setAdjusting(true)}>Add adjustment</button> : null}
      </div>

      {rangeError ? <p className="ad__error" role="alert">{rangeError}</p>
        : ledger.isError ? <p className="ad__error" role="alert">{agencyErrorMessage(ledger.error)}</p>
          : ledger.isPending ? <p className="ad__muted" role="status">Loading…</p>
            : rows.length === 0 ? <p className="ad__muted">Nothing in this part of the ledger{from || to ? ' for these dates' : ' yet'}.</p>
              : (
                <div className="ad__tablewrap">
                  <table className="ad__table py__ledger">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>What</th>
                        <th>Property · unit</th>
                        <th className="num">Amount</th>
                        <th className="num">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((e) => {
                        const source = entrySource(e);
                        return (
                          <tr key={e.id} className={e.kind === 'REVERSAL' ? 'py__reversalrow' : undefined}>
                            <td>{formatDay(e.occurredAt.slice(0, 10))}</td>
                            <td>
                              {LEDGER_KIND[e.kind] ?? e.kind}
                              {source ? <span className="ad__sub num"><Link to={source.to}>{source.text}</Link></span> : null}
                              {e.memo ? <span className="ad__sub">{e.memo}</span> : null}
                            </td>
                            <td>
                              {e.property ? e.property.name : <span className="nx-muted">—</span>}
                              {e.unit || e.tenant ? (
                                <span className="ad__sub">
                                  {e.unit ? `Unit ${e.unit.number}` : ''}{e.unit && e.tenant ? ' · ' : ''}
                                  {e.tenant ? <Link to={`/app/tenants/${e.tenant.id}`}>{personName(e.tenant)}</Link> : null}
                                </span>
                              ) : null}
                            </td>
                            <td className="num"><SignedAmount minor={e.amount} /></td>
                            <td className="num">{e.running === null ? <span className="nx-muted">—</span> : <SignedAmount minor={e.running} />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
      <Pager meta={ledger.data?.meta} onPage={setPage} />
      <p className="ad__muted">
        Newest first. Plus is owed to the landlord; minus (in red) is commission, expenses and payouts.
        {bucket === 'PAYABLE' ? ' A negative balance means the landlord owes the agency.' : ' Deposits are kept apart from the payout.'}
      </p>

      {adjusting ? <AdjustmentSheet landlord={landlord} bucket={bucket} onClose={() => setAdjusting(false)} /> : null}
    </section>
  );
}

/** An opening balance or a correction (`remittances:approve` + verification code). */
function AdjustmentSheet({ landlord, bucket, onClose }: { landlord: LandlordBasics; bucket: LedgerBucket; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<AdjustmentDraft>({ bucket, direction: 'credit', amount: '', memo: '' });
  const [errors, setErrors] = useState<Partial<Record<'amount' | 'memo', string>>>({});
  const [general, setGeneral] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<unknown>(`/landlords/${landlord.id}/ledger/adjustments`, body),
    onSuccess: async () => {
      toast.saved('The adjustment was recorded.');
      await Promise.all(AFTER_LEDGER_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
    onError: (error) => setGeneral(agencyErrorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const checked = checkAdjustment(draft);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    save.mutate(checked.body);
  };

  return (
    <Sheet
      title={`Adjust ${landlord.name}’s ledger`}
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="adjust-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Record adjustment'}
          </button>
        </>
      )}
    >
      <form id="adjust-form" className="sheet-form" onSubmit={submit} noValidate>
        <p className="hint">For opening balances and corrections only. It can’t be deleted afterwards, needs a verification code, and shows in the landlord’s statement.</p>
        <div className="fld">
          <span className="fld__label">Part of the ledger</span>
          <div className="pf__radios" role="radiogroup" aria-label="Part of the ledger">
            {(['PAYABLE', 'DEPOSIT_HELD'] as LedgerBucket[]).map((b) => (
              <label key={b} className="fld__check">
                <input type="radio" name="adj-bucket" checked={draft.bucket === b} onChange={() => setDraft((d) => ({ ...d, bucket: b }))} /> {LEDGER_BUCKET[b]}
              </label>
            ))}
          </div>
        </div>
        <div className="fld">
          <span className="fld__label">Effect</span>
          <div className="pf__radios" role="radiogroup" aria-label="Effect">
            <label className="fld__check">
              <input type="radio" name="adj-dir" checked={draft.direction === 'credit'} onChange={() => setDraft((d) => ({ ...d, direction: 'credit' }))} />
              Agency owes the landlord more
            </label>
            <label className="fld__check">
              <input type="radio" name="adj-dir" checked={draft.direction === 'debit'} onChange={() => setDraft((d) => ({ ...d, direction: 'debit' }))} />
              Agency owes the landlord less
            </label>
          </div>
        </div>
        <Field id="adj-amount" label="Amount (KES)" error={errors.amount}>
          <input id="adj-amount" inputMode="decimal" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} aria-invalid={Boolean(errors.amount)} />
        </Field>
        <Field id="adj-memo" label="Reason" error={errors.memo} hint="e.g. Opening balance carried over from the old system">
          <textarea id="adj-memo" value={draft.memo} onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))} aria-invalid={Boolean(errors.memo)} />
        </Field>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------- statement

export function StatementTab({ landlord }: { landlord: LandlordBasics }) {
  const thisMonth = currentPeriod();
  const [range, setRange] = useState({ from: thisMonth, to: thisMonth });
  const rangeError = checkMonthRange(range.from, range.to, thisMonth);
  const statement = useLandlordStatement(landlord.id, range, !rangeError);

  return (
    <section className="py__statement">
      <MonthRangeBar from={range.from} to={range.to} max={thisMonth} onChange={setRange} disabled={Boolean(rangeError)}
        onDownload={() => downloadLandlordStatement(landlord, range)} />
      {rangeError ? <p className="ad__error" role="alert">{rangeError}</p>
        : statement.isError && !statement.data ? <p className="ad__error" role="alert">{agencyErrorMessage(statement.error)}</p>
          : statement.isPending || !statement.data ? <p className="ad__muted" role="status">Loading…</p>
            : <StatementView statement={statement.data} />}
    </section>
  );
}
