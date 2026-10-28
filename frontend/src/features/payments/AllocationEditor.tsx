import { formatDay } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { paymentsErrorMessage } from './api';
import type { AllocationDraft } from './useAllocationDraft';

/**
 * Which open invoices a payment settles — shared by "Record payment" and the
 * reconciliation "Assign to tenant" sheet.
 *
 * The suggestion fills each open invoice oldest due first (or `preferId` first). With
 * "Allocate automatically" on, the request carries no allocations and the server applies
 * the same rule; switched off, each invoice's share can be changed. Whatever is not
 * allocated stays with the tenant as credit.
 */

export function AllocationEditor({
  draft,
  amountMinor,
  invoicesState,
  tenantName,
  preferId,
  error,
}: {
  draft: AllocationDraft;
  amountMinor: number;
  /** The open-invoices read: loading, failed, or done. */
  invoicesState: { pending: boolean; error: unknown };
  tenantName: string;
  preferId?: string;
  error?: string;
}) {
  const { auto, shown, ordered, allocated, credit, rowErrors } = draft;
  return (
    <div className={`py__alloc ${error ? 'is-bad' : ''}`} role="group" aria-label="Allocation">
      <div className="py__allochead">
        <span className="fld__label">Pays these invoices</span>
        {ordered.length > 0 ? (
          <label className="fld__check">
            <input type="checkbox" checked={auto} onChange={(e) => draft.setAuto(e.target.checked)} />
            Allocate automatically (oldest due first)
          </label>
        ) : null}
      </div>
      {invoicesState.pending ? <p className="ad__muted" role="status">Loading open invoices…</p>
        : invoicesState.error ? <p className="fld__err">{paymentsErrorMessage(invoicesState.error)}</p>
          : ordered.length === 0 ? (
            <p className="ad__muted">{tenantName} has no open invoices. The whole amount will be kept as credit for their next invoice.</p>
          ) : (
            <>
              <ul className="py__allocrows">
                {ordered.map((inv) => {
                  const err = rowErrors[inv.id];
                  return (
                    <li key={inv.id} className={`py__allocrow ${err ? 'is-bad' : ''}`}>
                      <div className="py__allocinv">
                        <strong className="num">{inv.number}</strong>{inv.id === preferId ? <span className="ad__badge ad__badge--info">This invoice</span> : null}
                        <span className="ad__sub">
                          {formatPeriod(inv.period)} · due {formatDay(inv.dueDate)}{inv.overdue ? ' · overdue' : ''} · balance <span className="num">{formatKES(inv.balance)}</span>
                        </span>
                      </div>
                      <div className="fld py__allocamt">
                        <input aria-label={`Amount for ${inv.number}`} value={shown[inv.id] ?? ''} inputMode="decimal" autoComplete="off"
                          placeholder="0" disabled={auto} aria-invalid={Boolean(err)} onChange={(e) => draft.setRow(inv.id, e.target.value)} />
                        {err ? <span className="fld__err">{err}</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {draft.edited ? (
                <button type="button" className="nx-btn nx-btn--sm py__resuggest" onClick={draft.resuggest}>
                  Use the suggestion again
                </button>
              ) : null}
            </>
          )}
      <div className="py__allocfoot">
        <span>Allocated <span className="num">{formatKES(allocated)}</span></span>
        <span className={allocated > amountMinor ? 'ad__owed' : ''}>
          {allocated > amountMinor
            ? <>Over by <span className="num">{formatKES(allocated - amountMinor)}</span></>
            : <>Credit left <strong className="num">{formatKES(credit)}</strong></>}
        </span>
      </div>
      {credit > 0 && allocated <= amountMinor ? (
        <span className="hint">The credit stays with the tenant and is used automatically on their next invoice.</span>
      ) : null}
      {error ? <span className="fld__err">{error}</span> : null}
    </div>
  );
}
