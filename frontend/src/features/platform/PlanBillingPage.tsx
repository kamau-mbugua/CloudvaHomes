import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan, useSession } from '../../lib/auth/useAuth';
import { todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { Sheet } from '../../components/Sheet';
import { InvoiceBadges } from '../billing/ui';
import { unwrap } from '../payments/rules';
import { Fact } from '../portfolio/ui';
import { PAGE_SIZE, downloadHodiInvoicePdf, keys, platformErrorMessage, useBillingSummary } from './api';
import { ORG_STATUS_MEANING } from './labels';
import { PayHodiSheet } from './PayHodiSheet';
import { dayOf, formatDayish, priceText, suggestedPayment } from './rules';
import type { BillingSummary, PlatformInvoice, PlatformInvoiceDetail, PlatformPayment } from './types';
import { CopyRow, CustomBadge, HodiInvoicesTable, OrgStatusBadge, PlatformPaymentsTable } from './ui';

/**
 * Settings → Plan & billing (`/app/settings/plan`): what the organisation pays Hodi and
 * how. Its status, plan and price (its own price shown as "Custom"), the trial end, what
 * is owed and held as credit, how to pay (Hodi's paybill + its billing account number,
 * copyable), "Pay now" (an M-Pesa prompt, `settings:update`), and its Hodi invoices (with
 * PDF) and payments. Everyone with `settings:view` sees it. Works while suspended.
 */
export function PlanBillingPage() {
  const summary = useBillingSummary();

  if (summary.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (summary.isError) return <div className="pg"><p className="ad__error" role="alert">{platformErrorMessage(summary.error)}</p></div>;
  return <PlanBilling summary={summary.data} />;
}

function PlanBilling({ summary }: { summary: BillingSummary }) {
  const session = useSession();
  const canPay = useCan('settings:update');
  const [paying, setPaying] = useState(false);
  const owed = suggestedPayment(summary);
  const inTrial = summary.status === 'TRIAL' || (dayOf(summary.trialEndsAt) ?? '') >= todayInNairobi();

  return (
    <div className="pg hb">
      <div className="hb__top">
        <section className={`ag__card hb__owed ${summary.status === 'SUSPENDED' ? 'hb__owed--alert' : summary.status === 'GRACE' ? 'hb__owed--warn' : ''}`}
          aria-labelledby="hb-owed">
          <div className="hb__cardhead">
            <h3 id="hb-owed">Owed to KodiHub</h3>
            <OrgStatusBadge status={summary.status} />
          </div>
          <p className="hb__amount num">{formatKES(Math.max(0, summary.balance))}</p>
          {summary.overdue ? (
            <p className="hb__overdue">{formatKES(summary.overdue.amount)} overdue since {formatDayish(summary.overdue.since)}.</p>
          ) : null}
          {summary.credit > 0 ? <p className="ad__muted">{formatKES(summary.credit)} credit, used by the next invoice.</p> : null}
          <p className="ad__muted">{ORG_STATUS_MEANING[summary.status]}</p>
          {summary.noSuspendUntil ? (
            <p className="ad__muted">KodiHub won’t suspend this account before {formatDayish(summary.noSuspendUntil)}.</p>
          ) : null}
          {summary.status !== 'CLOSED' ? (
            canPay && summary.canPayInApp ? (
              <button type="button" className="nx-btn nx-btn--primary hb__paybtn" onClick={() => setPaying(true)}>
                {owed > 0 ? `Pay ${formatKES(Math.ceil(owed / 100) * 100)} now` : 'Pay now'}
              </button>
            ) : !canPay ? (
              <p className="hint">Your role can see the bill but not pay it. Ask your organisation’s owner.</p>
            ) : null
          ) : null}
        </section>

        <section className="ag__card" aria-labelledby="hb-plan">
          <h3 id="hb-plan">Your plan</h3>
          <dl className="pf__facts hb__facts">
            <Fact label="Plan">{summary.plan?.name ?? 'No plan yet'}</Fact>
            <Fact label="Price">
              <span className="hb__price">
                {priceText(summary.price)}
                {summary.price.custom ? <CustomBadge title="A price agreed for your organisation, not the plan’s" /> : null}
              </span>
            </Fact>
            {summary.price.custom && summary.plan ? <Fact label="Plan’s own price">{priceText(summary.plan)}</Fact> : null}
            {summary.trialEndsAt ? (
              <Fact label={inTrial ? 'Free trial ends' : 'Free trial ended'}>{formatDayish(summary.trialEndsAt)}</Fact>
            ) : null}
            <Fact label="Billing account number"><span className="num">{summary.billingRef}</span></Fact>
          </dl>
          <p className="hint">
            Billed on the 1st for the month before: the units let on its last day × the price, never less than the monthly minimum.
          </p>
        </section>

        <section className="ag__card" aria-labelledby="hb-how">
          <h3 id="hb-how">How to pay</h3>
          {summary.payTo ? (
            <>
              <CopyRow label="Paybill (business number)" value={summary.payTo.paybill} />
              <CopyRow label="Account number" value={summary.payTo.accountRef} />
              <ol className="tp__steps">
                <li>On M-Pesa choose Lipa na M-Pesa, then Pay Bill.</li>
                <li>Business number {summary.payTo.paybill}, account number {summary.payTo.accountRef}.</li>
                <li>Enter the amount and your PIN. It shows here once KodiHub receives it.</li>
              </ol>
            </>
          ) : (
            <p className="ad__muted">Contact KodiHub for bank details. Quote your billing account number, <span className="num">{summary.billingRef}</span>.</p>
          )}
          {!summary.canPayInApp && summary.status !== 'CLOSED' ? (
            <p className="hint">Paying from this page isn’t available right now; use the paybill.</p>
          ) : null}
        </section>
      </div>

      <InvoicesSection />
      <PaymentsSection />

      {paying ? <PayHodiSheet owed={owed} ownPhone={session.user.phone} onClose={() => setPaying(false)} /> : null}
    </div>
  );
}

function InvoicesSection() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<PlatformInvoice | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const list = useQuery({
    queryKey: [...keys.billing, 'invoices', { page }],
    queryFn: () => api.get<PageEnvelope<PlatformInvoice>>('/billing/invoices', { page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.data ?? [];

  const pdf = async (invoice: PlatformInvoice) => {
    setDownloading(invoice.id);
    try {
      await downloadHodiInvoicePdf(invoice);
    } catch (error) {
      toast.failed(platformErrorMessage(error));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <section className="ad__section" aria-labelledby="hb-invoices">
      <div className="pf__sectionhead"><h2 id="hb-invoices">KodiHub invoices</h2></div>
      {list.isError ? <p className="ad__error" role="alert">{platformErrorMessage(list.error)}</p> : null}
      {list.isPending ? <p className="ad__muted" role="status">Loading…</p> : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap"><EmptyState title="No KodiHub invoices yet" detail="Your first one comes on the 1st after your trial ends." /></div>
      ) : (
        <HodiInvoicesTable
          rows={rows}
          actions={(inv) => (
            <>
              <button type="button" className="nx-btn nx-btn--sm" onClick={() => setOpen(inv)}>Details</button>
              <button type="button" className="nx-btn nx-btn--sm" onClick={() => pdf(inv)} disabled={downloading === inv.id}>
                {downloading === inv.id ? 'Getting…' : 'PDF'}
              </button>
            </>
          )}
        />
      )}
      <Pager meta={list.data?.meta} onPage={setPage} />
      {open ? <InvoiceDetailSheet invoice={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

function InvoiceDetailSheet({ invoice, onClose }: { invoice: PlatformInvoice; onClose: () => void }) {
  const toast = useToast();
  const detail = useQuery({
    queryKey: [...keys.billing, 'invoice', invoice.id],
    queryFn: () => api.get<unknown>(`/billing/invoices/${encodeURIComponent(invoice.id)}`).then((body) => unwrap<PlatformInvoiceDetail>(body)),
  });
  const inv = detail.data ?? invoice;
  const payments = detail.data?.payments ?? [];
  const fromMinimum = inv.minimum > 0 && inv.occupiedUnits * inv.rate < inv.minimum;

  return (
    <Sheet
      title={`${inv.number} — ${formatPeriod(inv.period, true)}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={() => {
            downloadHodiInvoicePdf(inv).catch((error) => toast.failed(platformErrorMessage(error)));
          }}>Download PDF</button>
          <button type="button" className="nx-btn nx-btn--primary" onClick={onClose}>Done</button>
        </>
      )}
    >
      <div className="sheet-form">
        <InvoiceBadges invoice={inv} />
        <dl className="pf__facts">
          <Fact label="Let units on the last day"><span className="num">{inv.occupiedUnits}</span></Fact>
          <Fact label="Price per unit"><span className="num">{formatKES(inv.rate)}</span></Fact>
          <Fact label="Monthly minimum"><span className="num">{formatKES(inv.minimum)}</span></Fact>
          <Fact label="Total">
            <span className="num">{formatKES(inv.total)}</span>
            {fromMinimum ? <span className="ad__sub">The monthly minimum, as units × price came to less.</span> : null}
          </Fact>
          <Fact label="Paid"><span className="num">{formatKES(inv.amountPaid)}</span></Fact>
          <Fact label="Balance"><span className={`num ${inv.overdue ? 'ad__owed' : ''}`}>{formatKES(inv.balance)}</span></Fact>
          <Fact label="Issued">{formatDayish(inv.issueDate)}</Fact>
          <Fact label="Due">{formatDayish(inv.dueDate)}</Fact>
        </dl>
        <h3 className="ad__h2">Paid by</h3>
        {detail.isPending ? <p className="ad__muted" role="status">Loading…</p>
          : detail.isError ? <p className="ad__error" role="alert">{platformErrorMessage(detail.error)}</p>
            : payments.length === 0 ? <p className="ad__muted">Nothing paid on it yet.</p>
              : <PlatformPaymentsTable rows={payments} />}
      </div>
    </Sheet>
  );
}

function PaymentsSection() {
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...keys.billing, 'payments', { page }],
    queryFn: () => api.get<PageEnvelope<PlatformPayment>>('/billing/payments', { page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.data ?? [];

  return (
    <section className="ad__section" aria-labelledby="hb-payments">
      <div className="pf__sectionhead"><h2 id="hb-payments">Payments to KodiHub</h2></div>
      {list.isError ? <p className="ad__error" role="alert">{platformErrorMessage(list.error)}</p> : null}
      {list.isPending ? <p className="ad__muted" role="status">Loading…</p> : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap"><EmptyState title="No payments yet" detail="Payments by M-Pesa or bank show here once KodiHub receives them." /></div>
      ) : <PlatformPaymentsTable rows={rows} />}
      <Pager meta={list.data?.meta} onPage={setPage} />
    </section>
  );
}
