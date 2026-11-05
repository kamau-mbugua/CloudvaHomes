import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../lib/auth/useAuth';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { trimQuantity } from '../../lib/quantity';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { CardSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { INVOICE_STATUS } from '../billing/labels';
import type { Invoice } from '../billing/types';
import { InvoiceBadges } from '../billing/ui';
import { PAYMENT_METHOD, STATEMENT_TYPE } from '../payments/labels';
import { checkStatementRange, isReversal, methodText } from '../payments/rules';
import type { Payment, StatementEntry } from '../payments/types';
import { PaymentBadges, SignedAmount } from '../payments/ui';
import { labelFor, optionsOf } from '../portfolio/labels';
import { Sheet } from '../../components/Sheet';
import { Field } from '../portfolio/ui';
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
} from '../maintenance/types';
import {
  createTenantRequest, downloadTenantInvoice, downloadTenantReceipt,
  downloadTenantStatement,
  keys as tenantKeys, tenantErrorMessage, uploadTenantPhoto,
  useTenantInvoice, useTenantInvoices, useTenantOverview, useTenantPayments, useTenantRequests, useTenantStatement,
} from './api';
import { PaySheet } from './PaySheet';
import { currentTenancies, homeText } from './rules';
import type { PortalTenancy } from './types';
import { useScopedAccounts, useTenantContext } from './tenantContext';
import { HowToPayCard } from './HowToPay';
import type { TenantOf } from '../../lib/auth/types';

/**
 * The tenant portal (`/tenant`): a tenant sees their own account and pays by M-Pesa.
 * Built for a phone first — the balance and "Pay now" at the top, big tap targets,
 * stacked rows instead of tables. The shared portal shell (`PortalShell`), four tabs
 * (Home, Invoices, Statement, Payments). Only `/api/v1/tenant/accounts/:id/*` is called.
 *
 * The chosen account is `?account=` in the address, so tabs and reloads keep it.
 */


function Loading() {
  return <CardSkeleton count={2} />;
}

function Problem({ error, orgName }: { error: unknown; orgName: string }) {
  return <div className="ph"><EmptyState title="Not available" detail={tenantErrorMessage(error, orgName)} /></div>;
}

/** A "Download PDF"-style button that says it is busy and toasts a failure. */
function DownloadButton({ label = 'Download PDF', run, orgName, className = 'nx-btn' }: {
  label?: string;
  run: () => Promise<void>;
  orgName: string;
  className?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const click = async () => {
    setBusy(true);
    try {
      await run();
    } catch (error) {
      toast.failed(tenantErrorMessage(error, orgName));
    } finally {
      setBusy(false);
    }
  };
  return <button type="button" className={className} onClick={click} disabled={busy}>{busy ? 'Preparing…' : label}</button>;
}

const STATUS_CHOICES = optionsOf(INVOICE_STATUS).filter((o) => o.value !== 'VOID');

export function TenantInvoicesPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const sections = useScopedAccounts();

  const setStatus = (value: string) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (value) next.set('status', value); else next.delete('status');
    next.delete('page');
    return next;
  }, { replace: true });

  return (
    <div className="ow__stack">
      <h1 className="ow__h1">Invoices</h1>
      <div className="tp__chips" role="group" aria-label="Show">
        {[{ value: '', label: 'All' }, ...STATUS_CHOICES].map((o) => (
          <button key={o.value} type="button" className={`tp__chip ${status === o.value ? 'is-on' : ''}`} aria-pressed={status === o.value}
            onClick={() => setStatus(o.value)}>{o.label}</button>
        ))}
      </div>
      {sections.map((sec) => (
        <InvoicesSection key={`${sec.account.tenantId}-${status}`} account={sec.account} heading={sec.heading} status={status} tenancyId={sec.tenancyId} />
      ))}
    </div>
  );
}

/** One landlord account's invoices (or one home's), paged on its own. */
function InvoicesSection({ account, heading, status, tenancyId }: { account: TenantOf; heading: boolean; status: string; tenancyId?: string }) {
  const [page, setPage] = useState(1);
  const list = useTenantInvoices(account.tenantId, { status: status || undefined, page, tenancyId });
  const orgName = account.organization.name;
  const rows = list.data?.rows ?? [];
  return (
    <section className="tps__section" aria-label={heading ? orgName : undefined}>
      {heading ? <h2 className="ad__h2">{orgName}</h2> : null}
      {list.isError ? <p className="ad__error" role="alert">{tenantErrorMessage(list.error, orgName)}</p>
        : list.isPending ? <Loading />
          : rows.length === 0 ? <div className="ph"><EmptyState title={status ? 'No invoices like that' : 'No invoices yet'} detail={status ? 'Try another filter.' : 'Your invoices will show here.'} /></div>
            : (
              <ul className="tp__rows tp__rows--card">
                {rows.map((inv) => <InvoiceRow key={inv.id} invoice={inv} search={`?of=${encodeURIComponent(account.tenantId)}`} />)}
              </ul>
            )}
      <Pager meta={list.data?.meta} onPage={setPage} />
    </section>
  );
}

function InvoiceRow({ invoice, search }: { invoice: Invoice; search: string }) {
  const owing = invoice.status !== 'VOID' && invoice.balance > 0;
  return (
    <li>
      <Link className={`tp__row ${invoice.status === 'VOID' ? 'bl__void' : ''}`} to={`/tenant/invoices/${encodeURIComponent(invoice.id)}${search}`}>
        <span className="tp__rowmain">
          <strong>{formatPeriod(invoice.period, true)} <InvoiceBadges invoice={invoice} /></strong>
          <span className="ad__sub"><span className="code">{invoice.number}</span> · due {formatDay(invoice.dueDate)}</span>
        </span>
        <span className="tp__rowamt">
          <strong className="num">{formatKES(invoice.total)}</strong>
          {owing ? <span className={`ad__sub num ${invoice.overdue ? 'ad__owed' : ''}`}>{formatKES(invoice.balance)} left</span> : null}
        </span>
      </Link>
    </li>
  );
}

export function TenantInvoicePage() {
  const { account: fallback, accounts } = useTenantContext();
  const [query] = useSearchParams();
  const account = accounts.find((a) => a.tenantId === query.get('of')) ?? fallback;
  const search = `?of=${encodeURIComponent(account.tenantId)}`;
  const session = useSession();
  const { invoiceId = '' } = useParams();
  const invoice = useTenantInvoice(account.tenantId, invoiceId);
  const overview = useTenantOverview(account.tenantId);
  const [paying, setPaying] = useState(false);
  const orgName = account.organization.name;
  const back = <Link className="tp__back" to={`/tenant/invoices${search}`}>‹ Invoices</Link>;

  if (invoice.isPending) return <Loading />;
  if (invoice.isError) return <div className="ow__stack">{back}<Problem error={invoice.error} orgName={orgName} /></div>;
  const inv = invoice.data;
  const canPay = Boolean(overview.data?.canPayInApp) && inv.status !== 'VOID' && inv.balance > 0;

  return (
    <div className="ow__stack">
      {back}
      <div>
        <h1 className="ow__h1">{formatPeriod(inv.period, true)} <InvoiceBadges invoice={inv} /></h1>
        <p className="ad__muted"><span className="code">{inv.number}</span> · {inv.unit.number}, {inv.property.name}</p>
      </div>

      <section className={`tp__due ${inv.balance > 0 && inv.status !== 'VOID' ? 'tp__due--owed' : ''}`}>
        <span className="tp__duelabel">{inv.status === 'VOID' ? 'Cancelled' : inv.balance > 0 ? 'Left to pay' : 'Paid in full'}</span>
        <strong className="tp__dueamt num">{formatKES(inv.status === 'VOID' ? 0 : inv.balance)}</strong>
        <span className={`tp__duenote ${inv.overdue && inv.status !== 'VOID' ? 'tp__overdue' : ''}`}>
          {inv.status === 'VOID' ? 'This invoice was cancelled and isn’t owed.' : `${inv.overdue ? 'Was due' : 'Due'} ${formatDay(inv.dueDate)}`}
        </span>
        {canPay ? <button type="button" className="nx-btn nx-btn--lg nx-btn--money tp__paybtn" onClick={() => setPaying(true)}>Pay now</button> : null}
      </section>

      <section className="ag__card">
        <div className="tp__cardhead">
          <h3>What it’s for</h3>
          <DownloadButton orgName={orgName} className="nx-btn nx-btn--sm" run={() => downloadTenantInvoice(account.tenantId, inv)} />
        </div>
        <ul className="ag__lines">
          {inv.lines.map((line) => (
            <li key={line.id} className="ag__line">
              <span className="ag__linelabel">
                {line.description}
                {trimQuantity(line.quantity) !== '1' ? <span className="ad__sub num">{trimQuantity(line.quantity)} × {formatKES(line.unitAmount)}</span> : null}
              </span>
              <span className="num">{formatKES(line.amount)}</span>
            </li>
          ))}
          <li className="ag__line ag__line--head"><span>Total</span><span className="num">{formatKES(inv.total)}</span></li>
          {inv.creditedAmount > 0 ? <li className="ag__line"><span>Credited</span><span className="num">−{formatKES(inv.creditedAmount)}</span></li> : null}
          {inv.amountPaid > 0 ? <li className="ag__line"><span>Paid</span><span className="num">−{formatKES(inv.amountPaid)}</span></li> : null}
          <li className="ag__line ag__line--edge"><span>Balance</span><span className="num">{formatKES(inv.balance)}</span></li>
        </ul>
        <dl className="tp__facts">
          <div><dt>Issued</dt><dd>{formatDay(inv.issueDate)}</dd></div>
          <div><dt>Due</dt><dd>{formatDay(inv.dueDate)}</dd></div>
        </dl>
      </section>

      {inv.payments && inv.payments.length > 0 ? (
        <section className="ag__card">
          <h3>Payments on this invoice</h3>
          <ul className="ag__lines">
            {inv.payments.map((p) => (
              <li key={`${p.id}-${p.amount}`} className="ag__line">
                <span className="ag__linelabel">
                  {formatDay(p.receivedAt)} · {labelFor(PAYMENT_METHOD, p.method).label}
                  <span className="ad__sub code">{p.number}{p.amount < 0 ? ' · reversal' : ''}</span>
                </span>
                <SignedAmount minor={p.amount} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inv.creditNotes.length > 0 ? (
        <section className="ag__card">
          <h3>Credit notes</h3>
          <ul className="ag__lines">
            {inv.creditNotes.map((cn) => (
              <li key={cn.id} className="ag__line">
                <span className="ag__linelabel">{cn.reason}<span className="ad__sub code">{cn.number}</span></span>
                <span className="num">−{formatKES(cn.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {paying ? (
        <PaySheet tenantId={account.tenantId} orgName={orgName} owed={inv.balance} title={`Pay ${inv.number}`}
          ownPhone={overview.data?.tenant.phone ?? session.user.phone} onClose={() => setPaying(false)} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- statement

/** Where a statement row links in the portal: its invoice (payments have no page of their own here). */
function entryHref(entry: StatementEntry, search: string): string | null {
  return entry.invoiceId ? `/tenant/invoices/${encodeURIComponent(entry.invoiceId)}${search}` : null;
}

export function TenantStatementPage() {
  const today = todayInNairobi();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rangeError = checkStatementRange(from, to);
  const range = { from: from || undefined, to: to || undefined };
  const sections = useScopedAccounts();

  return (
    <div className="ow__stack">
      <h1 className="ow__h1">Statement</h1>
      <div className="tp__range">
        <label className="tp__date">
          <span>From</span>
          <input type="date" aria-label="Statement from" max={to || today} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="tp__date">
          <span>To</span>
          <input type="date" aria-label="Statement to" min={from || undefined} max={today} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="tp__rangeactions">
          {from || to ? <button type="button" className="nx-btn" onClick={() => { setFrom(''); setTo(''); }}>All time</button> : null}
        </div>
      </div>
      {rangeError ? <p className="ad__error" role="alert">{rangeError}</p> : sections.map((sec) => (
        <StatementSection key={sec.account.tenantId} account={sec.account} heading={sec.heading} note={sec.note} range={range} />
      ))}
    </div>
  );
}

/** One landlord account's statement, with how to pay that landlord. */
function StatementSection({ account, heading, note, range }: {
  account: TenantOf;
  heading: boolean;
  note: string | null;
  range: { from?: string; to?: string };
}) {
  const { overview } = useTenantContext();
  const statement = useTenantStatement(account.tenantId, range);
  const orgName = account.organization.name;
  const s = statement.data;
  const search = `?of=${encodeURIComponent(account.tenantId)}`;
  const ways = overview.accounts.find((a) => a.tenant.id === account.tenantId)?.howToPay ?? [];
  return (
    <section className="tps__section" aria-label={orgName}>
      <div className="tp__cardhead">
        <h2 className="ad__h2">{heading ? orgName : `Your account with ${orgName}`}</h2>
        <DownloadButton orgName={orgName} className="nx-btn nx-btn--sm" run={() => downloadTenantStatement(account.tenantId, s?.tenant?.code, range)} />
      </div>
      {note ? <p className="lf__notice" role="note">{note}</p> : null}
      {statement.isError ? <p className="ad__error" role="alert">{tenantErrorMessage(statement.error, orgName)}</p>
        : statement.isPending || !s ? <Loading />
          : (
            <section className="ag__card">
              <ul className="ag__lines">
                <li className="ag__line ag__line--edge"><span>Opening · {formatDay(s.from)}</span><SignedAmount minor={s.openingBalance} /></li>
                {s.entries.length === 0 ? <li className="ag__line ad__muted">Nothing in this period.</li> : s.entries.map((e, i) => (
                  <StatementRow key={`${e.type}-${e.reference ?? ''}-${i}`} entry={e} href={entryHref(e, search)} />
                ))}
                <li className="ag__line ag__line--edge"><span>Closing · {formatDay(s.to)}</span><SignedAmount minor={s.closingBalance} /></li>
              </ul>
              <dl className="tp__facts">
                <div><dt>Credit now</dt><dd className="num">{formatKES(s.creditBalance)}</dd></div>
                <div><dt>Deposit held</dt><dd className="num">{formatKES(s.depositHeld)}</dd></div>
              </dl>
              <p className="hint">The balance is what you owe; a negative balance means you are in credit.</p>
            </section>
          )}
      <HowToPayCard ways={ways} orgName={orgName} />
    </section>
  );
}

function StatementRow({ entry: e, href }: { entry: StatementEntry; href: string | null }) {
  const label: ReactNode = (
    <>
      {STATEMENT_TYPE[e.type] ?? e.type}{e.reference ? <> · <span className="num">{e.reference}</span></> : null}
    </>
  );
  return (
    <li className={`ag__line tp__stmtline ${e.type === 'REVERSAL' ? 'py__reversalrow' : ''}`}>
      <span className="ag__linelabel">
        {href ? <Link to={href}>{label}</Link> : label}
        <span className="ad__sub">{formatDay(e.date)}{e.description ? ` · ${e.description}` : ''}</span>
      </span>
      <span className="tp__stmtamt">
        {e.debit ? <span className="num">{formatKES(e.debit)}</span>
          : e.credit ? <span className="num tp__in" title="Paid or credited">−{formatKES(e.credit)}</span> : null}
        <span className="ad__sub">Balance <SignedAmount minor={e.balance} /></span>
      </span>
    </li>
  );
}

// ---------------------------------------------------------------- payments

export function TenantPaymentsPage() {
  const sections = useScopedAccounts();
  return (
    <div className="ow__stack">
      <h1 className="ow__h1">Payments</h1>
      {sections.map((sec) => <PaymentsSection key={sec.account.tenantId} account={sec.account} heading={sec.heading} note={sec.note} />)}
    </div>
  );
}

function PaymentsSection({ account, heading, note }: { account: TenantOf; heading: boolean; note: string | null }) {
  const [page, setPage] = useState(1);
  const list = useTenantPayments(account.tenantId, page);
  const orgName = account.organization.name;
  const rows = list.data?.rows ?? [];
  return (
    <section className="tps__section" aria-label={heading ? orgName : undefined}>
      {heading ? <h2 className="ad__h2">{orgName}</h2> : null}
      {note ? <p className="lf__notice" role="note">{note}</p> : null}
      {list.isError ? <p className="ad__error" role="alert">{tenantErrorMessage(list.error, orgName)}</p>
        : list.isPending ? <Loading />
          : rows.length === 0 ? <div className="ph"><EmptyState title="No payments yet" detail="Payments you make show here, each with a receipt." /></div>
            : (
              <ul className="tp__rows tp__rows--card">
                {rows.map((p) => <PaymentRow key={p.id} payment={p} tenantId={account.tenantId} orgName={orgName} />)}
              </ul>
            )}
      <Pager meta={list.data?.meta} onPage={setPage} />
    </section>
  );
}

function PaymentRow({ payment: p, tenantId, orgName }: { payment: Payment; tenantId: string; orgName: string }) {
  const reversal = isReversal(p);
  return (
    <li className={`tp__row tp__row--static ${reversal ? 'py__reversalrow' : ''}`}>
      <span className="tp__rowmain">
        <strong>{formatDay(p.receivedAt)} <PaymentBadges payment={p} /></strong>
        <span className="ad__sub">{methodText(p)}{p.reference ? <> · <span className="num">{p.reference}</span></> : null}</span>
        <span className="ad__sub code">{p.number}</span>
      </span>
      <span className="tp__rowamt">
        <strong><SignedAmount minor={p.amount} struck={Boolean(p.reversedBy)} /></strong>
        {!reversal ? (
          <DownloadButton orgName={orgName} label="Receipt" className="nx-btn" run={() => downloadTenantReceipt(tenantId, p)} />
        ) : null}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------- maintenance requests

export function TenantRequestsPage() {
  const sections = useScopedAccounts();
  return (
    <div className="ow__stack">
      <h1 className="ow__h1">Maintenance</h1>
      {sections.map((sec) => <RequestsSection key={sec.account.tenantId} account={sec.account} heading={sec.heading} tenancyId={sec.tenancyId} />)}
    </div>
  );
}

/** One landlord account's repair requests — only the selected home's when one is selected. */
function RequestsSection({ account, heading, tenancyId }: { account: TenantOf; heading: boolean; tenancyId?: string }) {
  const { overview } = useTenantContext();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const list = useTenantRequests(account.tenantId, page);
  const orgName = account.organization.name;
  const all = currentTenancies(overview.tenancies.filter((t) => t.tenantId === account.tenantId));
  const homes = tenancyId ? all.filter((t) => t.id === tenancyId) : all;
  const unitIds = new Set(homes.map((t) => (typeof t.unit === 'string' ? '' : t.unit.id ?? '')));
  const rows = (list.data?.rows ?? []).filter((r) => !tenancyId || unitIds.has(r.unit.id));
  const report = homes.length > 0 ? (
    <button type="button" className="nx-btn nx-btn--primary" onClick={() => setCreating(true)}>Report an issue</button>
  ) : null;

  return (
    <section className="tps__section" aria-label={heading ? orgName : undefined}>
      <div className="tp__cardhead">
        {heading ? <h2 className="ad__h2">{orgName}</h2> : <span />}
        {report}
      </div>
      {list.isError ? (
        <p className="ad__error" role="alert">{tenantErrorMessage(list.error, orgName)}</p>
      ) : list.isPending ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="ph">
          <EmptyState
            title="No maintenance requests"
            detail="Need a repair in your unit? Report an issue and track its progress here."
            action={report}
          />
        </div>
      ) : (
        <ul className="tp__rows tp__rows--card">
          {rows.map((r) => (
            <li key={r.id} className="tp__row tp__row--static">
              <span className="tp__rowmain">
                <strong>
                  {r.title}{' '}
                  <span
                    className={`ad__badge ${
                      r.status === 'RESOLVED'
                        ? 'ad__badge--ok'
                        : r.status === 'IN_PROGRESS'
                          ? 'ad__badge--warn'
                          : r.status === 'CANCELLED'
                            ? 'ad__badge--neutral'
                            : 'ad__badge--bad'
                    }`}
                  >
                    {MAINTENANCE_STATUSES[r.status] ?? r.status}
                  </span>
                </strong>
                <span className="ad__sub">
                  <span className="code">{r.number}</span> · {r.property.name} Unit {r.unit.number} ·{' '}
                  {MAINTENANCE_CATEGORIES[r.category] ?? r.category} · {formatDay(r.createdAt.slice(0, 10))}
                </span>
                <span className="ad__sub">{r.description}</span>
                {r.resolutionNote ? (
                  <span className="ad__sub">
                    <strong>Update:</strong> {r.resolutionNote}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pager meta={list.data?.meta} onPage={setPage} />

      {creating ? (
        <TenantCreateRequestSheet
          tenantId={account.tenantId}
          orgName={orgName}
          homes={homes}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </section>
  );
}

function TenantCreateRequestSheet({
  tenantId,
  orgName,
  homes,
  onClose,
}: {
  tenantId: string;
  orgName: string;
  homes: PortalTenancy[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const firstUnitId =
    homes[0] && typeof homes[0].unit === 'object' ? (homes[0].unit.id ?? '') : '';
  const [unitId, setUnitId] = useState(firstUnitId);
  const [category, setCategory] = useState('PLUMBING');
  const [priority, setPriority] = useState('MEDIUM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      let photoUploadIds: string[] | undefined;
      if (photoFile) {
        const up = await uploadTenantPhoto(tenantId, photoFile);
        photoUploadIds = [up.id];
      }
      return createTenantRequest(tenantId, {
        unitId: unitId || undefined,
        category,
        priority,
        title: title.trim(),
        description: description.trim(),
        photoUploadIds,
      });
    },
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: tenantKeys.account(tenantId) });
      toast.saved(`Request ${created.number} sent to ${orgName}.`);
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    submitMutation.mutate();
  };

  return (
    <Sheet title="Report a maintenance issue" onClose={onClose}>
      <form className="fm" onSubmit={submit}>
        <div className="fm__grid">
          {homes.length > 1 ? (
            <Field id="t-req-unit" label="Unit" wide>
              <select
                id="t-req-unit"
                className="nx-select"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              >
                {homes.map((h) => {
                  const uid = typeof h.unit === 'object' ? (h.unit.id ?? '') : '';
                  return (
                    <option key={h.id} value={uid}>
                      {homeText(h)}
                    </option>
                  );
                })}
              </select>
            </Field>
          ) : null}

          <Field id="t-req-cat" label="Category">
            <select
              id="t-req-cat"
              className="nx-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {Object.entries(MAINTENANCE_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field id="t-req-prio" label="Urgency">
            <select
              id="t-req-prio"
              className="nx-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {Object.entries(MAINTENANCE_PRIORITIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field id="t-req-title" label="Short summary" wide>
            <input
              id="t-req-title"
              className="nx-input"
              type="text"
              placeholder="e.g. Kitchen sink leaking"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </Field>

          <Field id="t-req-desc" label="What happened?" wide>
            <textarea
              id="t-req-desc"
              className="nx-textarea"
              rows={3}
              placeholder="Describe the issue and best time for a technician to visit…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </Field>

          <Field id="t-req-photo" label="Photo (optional)" wide>
            <input
              id="t-req-photo"
              className="nx-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
          </Field>
        </div>

        {submitMutation.isError ? (
          <p className="ad__error" role="alert">
            {tenantErrorMessage(submitMutation.error, orgName)}
          </p>
        ) : null}

        <div className="sh__foot">
          <button type="button" className="nx-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="nx-btn nx-btn--primary"
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
