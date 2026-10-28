import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { PortalShell } from '../../app/PortalShell';
import { pickTenantAccount } from '../../lib/auth/portals';
import type { TenantOf } from '../../lib/auth/types';
import { useSession } from '../../lib/auth/useAuth';
import { copyText } from '../../lib/clipboard';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { trimQuantity } from '../../lib/quantity';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { INVOICE_STATUS } from '../billing/labels';
import type { Invoice } from '../billing/types';
import { InvoiceBadges } from '../billing/ui';
import { PAYMENT_METHOD, STATEMENT_TYPE } from '../payments/labels';
import { checkStatementRange, isReversal, methodText } from '../payments/rules';
import type { Payment, StatementEntry } from '../payments/types';
import { PaymentBadges, SignedAmount } from '../payments/ui';
import { labelFor, optionsOf } from '../portfolio/labels';
import {
  downloadTenantInvoice, downloadTenantReceipt, downloadTenantStatement, tenantErrorMessage,
  useTenantInvoice, useTenantInvoices, useTenantOverview, useTenantPayments, useTenantStatement,
} from './api';
import { PaySheet } from './PaySheet';
import { accountSearch, currentTenancies, homeText, howToPaySteps, ordinal, payNumber, shortcodeLabel } from './rules';
import type { HowToPay, PortalOpenInvoice, TenantOverview } from './types';

/**
 * The tenant portal (`/tenant`): a tenant sees their own account and pays by M-Pesa.
 * Built for a phone first — the balance and "Pay now" at the top, big tap targets,
 * stacked rows instead of tables. The shared portal shell (`PortalShell`), four tabs
 * (Home, Invoices, Statement, Payments). Only `/api/v1/tenant/accounts/:id/*` is called.
 *
 * The chosen account is `?account=` in the address, so tabs and reloads keep it.
 */

interface TenantContext { account: TenantOf; search: string; count: number }

const TABS = [
  { to: '/tenant', label: 'Home', end: true },
  { to: '/tenant/invoices', label: 'Invoices', end: false },
  { to: '/tenant/statement', label: 'Statement', end: false },
  { to: '/tenant/payments', label: 'Payments', end: false },
];

export function TenantShell() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const account = pickTenantAccount(session.tenantOf, params.get('account'));

  if (!account) return null;
  const count = session.tenantOf.length;
  const search = accountSearch(count, account.tenantId);
  const severalOrgs = new Set(session.tenantOf.map((t) => t.organization.id)).size > 1;

  return (
    <PortalShell
      portal="tenant"
      label="Tenant portal"
      orgName={account.organization.name}
      accountName={account.name}
      accounts={session.tenantOf.map((t) => ({ id: t.tenantId, label: severalOrgs ? `${t.name} · ${t.organization.name}` : t.name }))}
      currentId={account.tenantId}
      onSwitch={(id) => setParams((p) => { const next = new URLSearchParams(p); next.set('account', id); next.delete('page'); return next; })}
      tabs={TABS}
      search={search}
      footer={`Questions about your account? Contact ${account.organization.name}.`}
      context={{ account, search, count } satisfies TenantContext}
    />
  );
}

function useTenantContext(): TenantContext {
  return useOutletContext<TenantContext>();
}

function Loading() {
  return <p className="ad__muted" role="status">Loading…</p>;
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

// ---------------------------------------------------------------- home

export function TenantHomePage() {
  const { account, search } = useTenantContext();
  const session = useSession();
  const overview = useTenantOverview(account.tenantId);
  const [paying, setPaying] = useState(false);
  const orgName = account.organization.name;

  if (overview.isPending) return <Loading />;
  if (overview.isError) return <Problem error={overview.error} orgName={orgName} />;
  const o = overview.data;
  const owed = Math.max(0, o.balance);
  const homes = currentTenancies(o.tenancies ?? []);
  const open = o.openInvoices ?? [];

  return (
    <div className="ow__stack">
      <h1 className="ow__h1">Hello, {o.tenant.firstName || account.name}</h1>

      <section className={`tp__due ${owed > 0 ? 'tp__due--owed' : ''}`} aria-label="What you owe">
        <span className="tp__duelabel">{owed > 0 ? 'You owe' : 'Nothing to pay'}</span>
        <strong className="tp__dueamt num">{formatKES(owed)}</strong>
        <DueLine open={open} />
        {o.credit > 0 ? <span className="tp__duenote">{formatKES(o.credit)} in credit — used on your next invoice</span> : null}
        {o.canPayInApp ? (
          <button type="button" className={`nx-btn nx-btn--lg tp__paybtn ${owed > 0 ? 'nx-btn--primary' : ''}`} onClick={() => setPaying(true)}>
            {owed > 0 ? 'Pay now' : 'Pay in advance'}
          </button>
        ) : owed > 0 && o.howToPay.length > 0 ? (
          <span className="tp__duenote">Pay with M-Pesa using the details below.</span>
        ) : null}
      </section>

      <HowToPayCard ways={o.howToPay ?? []} orgName={orgName} />

      {open.length > 0 ? (
        <section className="ag__card">
          <div className="tp__cardhead"><h3>Unpaid invoices</h3><Link to={`/tenant/invoices${search}`}>All invoices</Link></div>
          <ul className="tp__rows">
            {open.map((inv) => <OpenInvoiceRow key={inv.id} invoice={inv} search={search} />)}
          </ul>
        </section>
      ) : null}

      <section className="ag__card">
        <h3>{homes.length > 1 ? 'Your homes' : 'Your home'}</h3>
        {homes.length === 0 ? <p className="ad__muted">No current tenancy.</p> : homes.map((t) => (
          <div key={t.id} className="tp__home">
            <strong>{homeText(t)}</strong>
            <dl className="tp__facts">
              <div><dt>Rent a month</dt><dd className="num">{formatKES(t.rentAmount)}</dd></div>
              <div><dt>Billed on</dt><dd>the {ordinal(t.billingDay)} of each month</dd></div>
              <div><dt>Since</dt><dd>{formatDay(t.startDate)}</dd></div>
              {t.status === 'NOTICE' ? <div><dt>Leaving</dt><dd>{t.endDate ? formatDay(t.endDate) : 'On notice'}</dd></div> : null}
            </dl>
          </div>
        ))}
        <dl className="tp__facts">
          <div><dt>Deposit held</dt><dd className="num">{formatKES(o.depositHeld)}</dd></div>
        </dl>
      </section>

      <ContactCard org={o.organization} />

      {paying ? (
        <PaySheet tenantId={account.tenantId} orgName={orgName} owed={owed} ownPhone={o.tenant.phone ?? session.user.phone}
          onClose={() => setPaying(false)} />
      ) : null}
    </div>
  );
}

/** "Due 5 Nov 2026" or "Overdue since 5 Nov 2026", from the oldest unpaid invoice. */
function DueLine({ open }: { open: PortalOpenInvoice[] }) {
  if (open.length === 0) return null;
  const oldest = [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const overdue = oldest.overdue ?? oldest.dueDate < todayInNairobi();
  return <span className={`tp__duenote ${overdue ? 'tp__overdue' : ''}`}>{overdue ? `Overdue since ${formatDay(oldest.dueDate)}` : `Due ${formatDay(oldest.dueDate)}`}</span>;
}

function OpenInvoiceRow({ invoice, search }: { invoice: PortalOpenInvoice; search: string }) {
  return (
    <li>
      <Link className="tp__row" to={`/tenant/invoices/${encodeURIComponent(invoice.id)}${search}`}>
        <span className="tp__rowmain">
          <strong>{formatPeriod(invoice.period, true)}</strong>
          <span className="ad__sub"><span className="num">{invoice.number}</span> · {invoice.overdue ? <span className="tp__overdue">overdue</span> : 'due'} {formatDay(invoice.dueDate)}</span>
        </span>
        <strong className={`num ${invoice.overdue ? 'ad__owed' : ''}`}>{formatKES(invoice.balance)}</strong>
      </Link>
    </li>
  );
}

function HowToPayCard({ ways, orgName }: { ways: HowToPay[]; orgName: string }) {
  if (ways.length === 0) {
    return (
      <section className="ag__card">
        <h3>How to pay</h3>
        <p className="ad__muted">Ask {orgName} how to pay.</p>
      </section>
    );
  }
  return (
    <section className="ag__card">
      <h3>How to pay</h3>
      {ways.map((way, i) => {
        const number = payNumber(way);
        return (
          <div key={`${way.kind}-${number ?? i}`} className="tp__way">
            <span className="tp__wayname">{way.name}{way.kind === 'BANK_ACCOUNT' && way.bankName ? ` · ${way.bankName}` : ''}</span>
            {number ? <CopyRow label={shortcodeLabel(way.kind)} value={number} /> : null}
            {way.accountRef ? <CopyRow label={way.kind === 'BANK_ACCOUNT' ? 'Reference' : 'Account number'} value={way.accountRef} /> : null}
            {way.accountName ? <span className="ad__sub">In the name of {way.accountName}</span> : null}
            <ol className="tp__steps">
              {howToPaySteps(way).map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
        );
      })}
    </section>
  );
}

/** A number to type into M-Pesa, with a large copy button. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await copyText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.failed('Couldn’t copy. Press and hold the number to copy it.');
    }
  };
  return (
    <div className="tp__copy">
      <span className="tp__copylabel">{label}</span>
      <strong className="tp__copyvalue num">{value}</strong>
      <button type="button" className="nx-btn tp__copybtn" onClick={copy} aria-label={`Copy ${label.toLowerCase()} ${value}`}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function ContactCard({ org }: { org: TenantOverview['organization'] }) {
  return (
    <section className="ag__card">
      <h3>Contact {org.name}</h3>
      {org.phone || org.email ? (
        <div className="tp__contact">
          {org.phone ? <a className="nx-btn" href={`tel:${org.phone}`}>Call{'\u00a0'}<span className="num">{org.phone}</span></a> : null}
          {org.email ? <a className="nx-btn" href={`mailto:${org.email}`}>E-mail {org.email}</a> : null}
        </div>
      ) : <p className="ad__muted">No contact details on file.</p>}
    </section>
  );
}

// ---------------------------------------------------------------- invoices

const STATUS_CHOICES = optionsOf(INVOICE_STATUS).filter((o) => o.value !== 'VOID');

export function TenantInvoicesPage() {
  const { account, search } = useTenantContext();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useTenantInvoices(account.tenantId, { status: status || undefined, page });
  const orgName = account.organization.name;
  const rows = list.data?.rows ?? [];

  const set = (changes: Record<string, string>) => setParams((p) => {
    const next = new URLSearchParams(p);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    return next;
  }, { replace: true });

  return (
    <div className="ow__stack">
      <h1 className="ow__h1">Invoices</h1>
      <div className="tp__chips" role="group" aria-label="Show">
        {[{ value: '', label: 'All' }, ...STATUS_CHOICES].map((o) => (
          <button key={o.value} type="button" className={`tp__chip ${status === o.value ? 'is-on' : ''}`} aria-pressed={status === o.value}
            onClick={() => set({ status: o.value, page: '' })}>{o.label}</button>
        ))}
      </div>
      {list.isError ? <p className="ad__error" role="alert">{tenantErrorMessage(list.error, orgName)}</p>
        : list.isPending ? <Loading />
          : rows.length === 0 ? <div className="ph"><EmptyState title={status ? 'No invoices like that' : 'No invoices yet'} detail={status ? 'Try another filter.' : 'Your invoices will show here.'} /></div>
            : (
              <ul className="tp__rows tp__rows--card">
                {rows.map((inv) => <InvoiceRow key={inv.id} invoice={inv} search={search} />)}
              </ul>
            )}
      <Pager meta={list.data?.meta} onPage={(next) => set({ page: next > 1 ? String(next) : '' })} />
    </div>
  );
}

function InvoiceRow({ invoice, search }: { invoice: Invoice; search: string }) {
  const owing = invoice.status !== 'VOID' && invoice.balance > 0;
  return (
    <li>
      <Link className={`tp__row ${invoice.status === 'VOID' ? 'bl__void' : ''}`} to={`/tenant/invoices/${encodeURIComponent(invoice.id)}${search}`}>
        <span className="tp__rowmain">
          <strong>{formatPeriod(invoice.period, true)} <InvoiceBadges invoice={invoice} /></strong>
          <span className="ad__sub"><span className="num">{invoice.number}</span> · due {formatDay(invoice.dueDate)}</span>
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
  const { account, search } = useTenantContext();
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
        <p className="ad__muted"><span className="num">{inv.number}</span> · {inv.unit.number}, {inv.property.name}</p>
      </div>

      <section className={`tp__due ${inv.balance > 0 && inv.status !== 'VOID' ? 'tp__due--owed' : ''}`}>
        <span className="tp__duelabel">{inv.status === 'VOID' ? 'Cancelled' : inv.balance > 0 ? 'Left to pay' : 'Paid in full'}</span>
        <strong className="tp__dueamt num">{formatKES(inv.status === 'VOID' ? 0 : inv.balance)}</strong>
        <span className={`tp__duenote ${inv.overdue && inv.status !== 'VOID' ? 'tp__overdue' : ''}`}>
          {inv.status === 'VOID' ? 'This invoice was cancelled and isn’t owed.' : `${inv.overdue ? 'Was due' : 'Due'} ${formatDay(inv.dueDate)}`}
        </span>
        {canPay ? <button type="button" className="nx-btn nx-btn--lg nx-btn--primary tp__paybtn" onClick={() => setPaying(true)}>Pay now</button> : null}
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
                  <span className="ad__sub num">{p.number}{p.amount < 0 ? ' · reversal' : ''}</span>
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
                <span className="ag__linelabel">{cn.reason}<span className="ad__sub num">{cn.number}</span></span>
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
  const { account, search } = useTenantContext();
  const today = todayInNairobi();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rangeError = checkStatementRange(from, to);
  const range = { from: from || undefined, to: to || undefined };
  const statement = useTenantStatement(account.tenantId, range, !rangeError);
  const orgName = account.organization.name;
  const s = statement.data;

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
          {rangeError ? null : (
            <DownloadButton orgName={orgName} run={() => downloadTenantStatement(account.tenantId, s?.tenant?.code, range)} />
          )}
        </div>
      </div>

      {rangeError ? <p className="ad__error" role="alert">{rangeError}</p>
        : statement.isError ? <p className="ad__error" role="alert">{tenantErrorMessage(statement.error, orgName)}</p>
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
    </div>
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
  const { account } = useTenantContext();
  const [page, setPage] = useState(1);
  const list = useTenantPayments(account.tenantId, page);
  const orgName = account.organization.name;
  const rows = list.data?.rows ?? [];

  return (
    <div className="ow__stack">
      <h1 className="ow__h1">Payments</h1>
      {list.isError ? <p className="ad__error" role="alert">{tenantErrorMessage(list.error, orgName)}</p>
        : list.isPending ? <Loading />
          : rows.length === 0 ? <div className="ph"><EmptyState title="No payments yet" detail="Payments you make show here, each with a receipt." /></div>
            : (
              <ul className="tp__rows tp__rows--card">
                {rows.map((p) => <PaymentRow key={p.id} payment={p} tenantId={account.tenantId} orgName={orgName} />)}
              </ul>
            )}
      <Pager meta={list.data?.meta} onPage={setPage} />
    </div>
  );
}

function PaymentRow({ payment: p, tenantId, orgName }: { payment: Payment; tenantId: string; orgName: string }) {
  const reversal = isReversal(p);
  return (
    <li className={`tp__row tp__row--static ${reversal ? 'py__reversalrow' : ''}`}>
      <span className="tp__rowmain">
        <strong>{formatDay(p.receivedAt)} <PaymentBadges payment={p} /></strong>
        <span className="ad__sub">{methodText(p)}{p.reference ? <> · <span className="num">{p.reference}</span></> : null}</span>
        <span className="ad__sub num">{p.number}</span>
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
