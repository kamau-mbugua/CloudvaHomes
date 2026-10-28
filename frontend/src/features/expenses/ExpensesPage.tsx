import { useState } from 'react';
import type { FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope, PageMeta } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime, formatDay, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { Sheet } from '../../components/Sheet';
import { PropertySelect } from '../billing/ui';
import { checkStatementRange } from '../payments/rules';
import { splitFormError } from '../portfolio/formErrors';
import { useForm, useListFilters } from '../portfolio/hooks';
import { optionsOf } from '../portfolio/labels';
import { Field } from '../portfolio/ui';
import { PrivateFilePreview } from '../uploads/ui';
import { isImageType } from '../../lib/files';
import { downloadExpensesCsv, expensesErrorMessage, keys, reportKeys } from './api';
import { ExpenseSheet } from './ExpenseSheet';
import { EXPENSE_CATEGORY, RECURRING, VOIDED, categoryText } from './labels';
import { RecurringTab } from './RecurringTab';
import { readVoidedFilter, voidedQuery } from './rules';
import type { Expense } from './types';

/**
 * Expenses (`/app/expenses`): two tabs. **Expenses** lists what properties cost, newest
 * first, with filters in the address, the total of the filtered (non-void) rows and a CSV
 * of them; rows are added and edited in a sheet with the receipt, and voided with a
 * reason. **Recurring** keeps the regular costs that create expenses by themselves.
 */

const PAGE_SIZE = 25;

export function ExpensesPage() {
  const filters = useListFilters();
  const tab = filters.get('tab') === 'recurring' ? 'recurring' : 'expenses';

  return (
    <div className="pg">
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Expenses">
          <button type="button" role="tab" aria-selected={tab === 'expenses'} className="pf__tab" onClick={() => filters.setFilter({ tab: '' })}>Expenses</button>
          <button type="button" role="tab" aria-selected={tab === 'recurring'} className="pf__tab" onClick={() => filters.setFilter({ tab: 'recurring' })}>
            Recurring
          </button>
        </div>
      </div>
      {tab === 'recurring' ? <RecurringTab /> : <ExpensesTab />}
    </div>
  );
}

type ExpensePage = PageEnvelope<Expense> & { meta: PageMeta & { totalAmount?: number } };

function ExpensesTab() {
  const filters = useListFilters();
  const toast = useToast();
  const { q, page } = filters;
  const propertyId = filters.get('propertyId');
  const category = filters.get('category');
  const from = filters.get('from');
  const to = filters.get('to');
  const voided = readVoidedFilter(filters.get('voided'));
  const canCreate = useCan('expenses:create');
  const canUpdate = useCan('expenses:update');
  const canVoid = useCan('expenses:delete');
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [downloading, setDownloading] = useState(false);
  const rangeError = checkStatementRange(from, to);
  const today = todayInNairobi();
  const query = { q, propertyId, category, from, to, voided: voidedQuery(voided) };

  const list = useQuery({
    queryKey: [...keys.expenses, 'list', { ...query, page }],
    queryFn: () => api.get<ExpensePage>('/expenses', { ...query, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    enabled: !rangeError,
  });

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;
  const filtered = Boolean(q || propertyId || category || from || to || voided);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadExpensesCsv(query);
    } catch (error) {
      toast.failed(expensesErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section>
      <div className="ad__filters">
        <input className="ad__search" type="search" placeholder="Search name, payee or reference" aria-label="Search expenses"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        <PropertySelect allowAll value={propertyId} onChange={(id) => filters.setFilter({ propertyId: id })} />
        <select className="ad__select" aria-label="Category" value={category} onChange={(e) => filters.setFilter({ category: e.target.value })}>
          <option value="">All categories</option>
          {optionsOf(EXPENSE_CATEGORY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label className="py__daterange">
          <span>From</span>
          <input type="date" className="ad__select" aria-label="Expenses from" max={to || today} value={from}
            onChange={(e) => filters.setFilter({ from: e.target.value })} />
        </label>
        <label className="py__daterange">
          <span>To</span>
          <input type="date" className="ad__select" aria-label="Expenses to" min={from || undefined} max={today} value={to}
            onChange={(e) => filters.setFilter({ to: e.target.value })} />
        </label>
        <select className="ad__select" aria-label="Voided expenses" value={voided} onChange={(e) => filters.setFilter({ voided: e.target.value })}>
          <option value="">Current expenses</option>
          <option value="only">Voided expenses</option>
        </select>
        <div className="bl__headbtns pg-push">
          <button type="button" className="nx-btn" disabled={downloading || Boolean(rangeError)} onClick={download}>
            {downloading ? 'Preparing…' : 'Download CSV'}
          </button>
          {canCreate ? <button type="button" className="nx-btn nx-btn--primary" onClick={() => setEditing('new')}>Record expense</button> : null}
        </div>
      </div>

      {rangeError ? <p className="ad__error" role="alert">{rangeError}</p> : null}
      {list.isError ? <p className="ad__error" role="alert">{expensesErrorMessage(list.error)}</p> : null}

      {rangeError ? null : list.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="No expenses match" detail="Try a different search, or clear the filters." onClear={() => filters.clear()} />
          ) : (
            <EmptyState
              title="No expenses yet"
              detail="Record what each property costs — repairs, security, cleaning, utilities — with a photo of the receipt. Regular costs can be set up under Recurring."
              action={canCreate ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setEditing('new')}>Record expense</button> : undefined}
            />
          )}
        </div>
      ) : (
        <>
          {meta && typeof meta.totalAmount === 'number' ? (
            <p className="ex__total" aria-live="polite">
              <span className="ad__muted">
                {meta.total} {voided === 'only' ? 'voided ' : ''}{meta.total === 1 ? 'expense' : 'expenses'}{filtered ? ' match' : ''} · total
              </span>
              <strong className="num">{formatKES(meta.totalAmount)}</strong>
            </p>
          ) : null}
          <div className="ad__tablewrap">
            <table className="ad__table ex__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense</th>
                  <th>Property</th>
                  <th>Category</th>
                  <th>Receipt</th>
                  <th className="num">Amount</th>
                  <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => {
                  const isVoid = Boolean(x.voidedAt);
                  return (
                    <tr key={x.id} className={isVoid ? 'bl__void' : undefined}>
                      <td className="ex__date">{formatDay(x.incurredOn)}</td>
                      <td>
                        <strong>{x.name}</strong>{' '}
                        {x.recurringExpenseId ? <span className={`ad__badge ${RECURRING.tone}`}>{RECURRING.label}</span> : null}{' '}
                        {isVoid ? <span className={`ad__badge ${VOIDED.tone}`}>{VOIDED.label}</span> : null}
                        {x.payee || x.reference ? (
                          <span className="ad__sub">{[x.payee, x.reference ? <span key="r" className="num">{x.reference}</span> : null].filter(Boolean).map((part, i) => (
                            <span key={i}>{i > 0 ? ' · ' : ''}{part}</span>
                          ))}</span>
                        ) : null}
                        {isVoid ? <span className="ad__sub">Voided {formatDateTime(x.voidedAt)}{x.voidReason ? ` — ${x.voidReason}` : ''}</span> : null}
                      </td>
                      <td>{x.property.name}<span className="ad__sub num">{x.property.code}</span></td>
                      <td>{categoryText(x.category)}</td>
                      <td>
                        {x.receipt ? (
                          <button type="button" className="nx-btn nx-btn--sm" onClick={() => setViewing(x)}
                            aria-label={`View the receipt for ${x.name}`}>
                            {isImageType(x.receipt.contentType) ? 'Photo' : 'PDF'}
                          </button>
                        ) : <span className="nx-muted">—</span>}
                      </td>
                      <td className="num">{formatKES(x.amount)}</td>
                      <td className="ad__rowactions">
                        <div>
                          {canUpdate && !isVoid ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(x)}>Edit</button> : null}
                          {canVoid && !isVoid ? <button type="button" className="nx-btn nx-btn--sm nx-btn--danger" onClick={() => setVoiding(x)}>Void</button> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Pager meta={meta} onPage={(next) => filters.setFilter({ page: String(next) })} />

      {editing ? <ExpenseSheet expense={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      {voiding ? <VoidExpenseDialog expense={voiding} onClose={() => setVoiding(null)} /> : null}
      {viewing ? <ReceiptViewer expense={viewing} onClose={() => setViewing(null)} /> : null}
    </section>
  );
}

function VoidExpenseDialog({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<'reason'>({ reason: '' });

  const voidIt = useMutation({
    mutationFn: (reason: string) => api.post(`/expenses/${expense.id}/void`, { reason }),
    onSuccess: async () => {
      toast.saved(`${expense.name} was voided.`);
      await queryClient.invalidateQueries({ queryKey: keys.expenses });
      await queryClient.invalidateQueries({ queryKey: reportKeys });
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, {
        fields: ['reason'],
        describe: (e) => expensesErrorMessage(e, { EXPENSE_VOID: 'This expense was already voided.' }),
      });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const reason = form.values.reason.trim();
    form.setErrors(reason ? {} : { reason: 'Say why it is being voided.' });
    form.setGeneral(null);
    if (reason) voidIt.mutate(reason);
  };

  return (
    <Sheet
      title={`Void ${expense.name}?`}
      busy={voidIt.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={voidIt.isPending}>Keep it</button>
          <button type="submit" form="void-expense-form" className="nx-btn nx-btn--danger" disabled={voidIt.isPending}>
            {voidIt.isPending ? 'Voiding…' : 'Void expense'}
          </button>
        </>
      )}
    >
      <form id="void-expense-form" className="pf__dialogform" onSubmit={submit} noValidate>
        <p className="ad__muted">
          The {formatKES(expense.amount)} expense of {formatDay(expense.incurredOn)} stays on record as void and is left out of
          totals and reports. It can’t be edited afterwards. This cannot be undone.
        </p>
        <Field id="vx-reason" label="Reason" error={form.errors.reason}>
          <textarea id="vx-reason" rows={2} maxLength={500} value={form.values.reason} onChange={(e) => form.set('reason', e.target.value)}
            aria-invalid={Boolean(form.errors.reason)} placeholder="e.g. Entered twice" />
        </Field>
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}

function ReceiptViewer({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  return (
    <Sheet title={`Receipt — ${expense.name}`} wide onClose={onClose}
      footer={<button type="button" className="nx-btn" onClick={onClose}>Close</button>}>
      <p className="ad__muted">{expense.property.name} · {formatDay(expense.incurredOn)} · <span className="num">{formatKES(expense.amount)}</span></p>
      <PrivateFilePreview path={`/expenses/${expense.id}/receipt`} alt={`Receipt for ${expense.name}`} className="up__full" />
    </Sheet>
  );
}
