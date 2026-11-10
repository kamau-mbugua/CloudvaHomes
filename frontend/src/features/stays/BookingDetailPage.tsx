import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { useSession } from '../../lib/auth/useAuth';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { CardSkeleton } from '../../components/Loading';
import { Breadcrumbs, Fact } from '../portfolio/ui';
import { staysErrorMessage, staysKeys } from './api';
import { balanceStat, bookingActions, bookingStatusBadge, todayIso } from './calendar';
import { CancelSheet } from './CancelSheet';
import { PaymentSheet } from './PaymentSheet';
import { RefundSheet } from './RefundSheet';
import type { Booking } from './types';

export function BookingDetailPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const session = useSession();
  const perms = new Set(session?.permissions ?? []);

  const [paymentModal, setPaymentModal] = useState<'manual' | 'prompt' | null>(
    null,
  );
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const bookingQuery = useQuery({
    queryKey: staysKeys.booking(bookingId ?? ''),
    enabled: Boolean(bookingId),
    queryFn: async () => {
      const res = await api.get<DataEnvelope<Booking>>(
        `/host/bookings/${bookingId}`,
      );
      return res.data;
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: object }) =>
      api.post<DataEnvelope<Booking>>(
        `/host/bookings/${bookingId}/${action}`,
        body ?? {},
      ),
    onSuccess: async (_res, vars) => {
      toast.saved(`Booking updated (${vars.action.replace('-', ' ')}).`);
      if (bookingId) {
        await queryClient.invalidateQueries({
          queryKey: staysKeys.booking(bookingId),
        });
      }
      await queryClient.invalidateQueries({ queryKey: staysKeys.bookings });
      await queryClient.invalidateQueries({ queryKey: staysKeys.calendar });
    },
  });

  if (bookingQuery.isLoading) {
    return <CardSkeleton count={3} label="Loading booking…" />;
  }

  if (bookingQuery.isError || !bookingQuery.data) {
    return (
      <div className="pg">
        <p className="ad__error" role="alert">
          {bookingQuery.isError
            ? staysErrorMessage(bookingQuery.error)
            : 'Booking not found.'}
        </p>
      </div>
    );
  }

  const b = bookingQuery.data;
  const badge = bookingStatusBadge(b.status);
  const actions = bookingActions(b, todayIso());

  const canUpdate = perms.has('bookings:update');
  const canCancel = perms.has('bookings:cancel');
  const canPay = perms.has('stay-payments:create');
  const canRefund = perms.has('stay-payments:refund');
  const hasMoney = b.total !== undefined;

  const netPaid = hasMoney
    ? BigInt(b.amountPaid ?? '0') - BigInt(b.amountRefunded ?? '0')
    : 0n;
  const balance =
    hasMoney && BigInt(b.total ?? '0') > netPaid
      ? BigInt(b.total ?? '0') - netPaid
      : 0n;
  const balanceTile = balanceStat(b.status, balance);

  return (
    <div className="pg pf__page">
      <Breadcrumbs
        trail={[
          { label: 'Bookings', to: '/app/bookings' },
          { label: b.code },
        ]}
      />

      <div className="pf__head">
        <div>
          <h1>
            <span className="code">{b.code}</span> {b.listing.title}{' '}
            <span className={badge.className}>{badge.label}</span>
          </h1>
          <p>
            {b.property.name} · Unit {b.unit.number} · {b.checkIn} →{' '}
            {b.checkOut} ({b.guests} {b.guests === 1 ? 'guest' : 'guests'})
          </p>
        </div>

        <div className="sl__headactions">
          {actions.includes('accept') && canUpdate && (
            <button
              type="button"
              className="nx-btn nx-btn--primary"
              disabled={actionMutation.isPending}
              onClick={() => actionMutation.mutate({ action: 'accept' })}
            >
              Accept
            </button>
          )}
          {actions.includes('decline') && canUpdate && (
            <button
              type="button"
              className="nx-btn"
              disabled={actionMutation.isPending}
              onClick={() => actionMutation.mutate({ action: 'decline' })}
            >
              Decline
            </button>
          )}
          {actions.includes('checkIn') && canUpdate && (
            <button
              type="button"
              className="nx-btn nx-btn--primary"
              disabled={actionMutation.isPending}
              onClick={() => actionMutation.mutate({ action: 'check-in' })}
            >
              Check in
            </button>
          )}
          {actions.includes('checkOut') && canUpdate && (
            <button
              type="button"
              className="nx-btn nx-btn--primary"
              disabled={actionMutation.isPending}
              onClick={() => actionMutation.mutate({ action: 'check-out' })}
            >
              Check out
            </button>
          )}
          {actions.includes('mpesaPrompt') && canPay && hasMoney && (
            <button
              type="button"
              className="nx-btn"
              onClick={() => setPaymentModal('prompt')}
            >
              M-Pesa prompt
            </button>
          )}
          {actions.includes('recordPayment') && canPay && hasMoney && (
            <button
              type="button"
              className="nx-btn"
              onClick={() => setPaymentModal('manual')}
            >
              Record payment
            </button>
          )}
          {actions.includes('refund') &&
            canRefund &&
            hasMoney &&
            netPaid > 0n && (
              <button
                type="button"
                className="nx-btn"
                onClick={() => setRefundOpen(true)}
              >
                Refund
              </button>
            )}
          {actions.includes('noShow') && canUpdate && (
            <button
              type="button"
              className="nx-btn"
              disabled={actionMutation.isPending}
              onClick={() => actionMutation.mutate({ action: 'no-show' })}
            >
              Mark no-show
            </button>
          )}
          {actions.includes('cancel') && canCancel && (
            <button
              type="button"
              className="nx-btn nx-btn--danger"
              onClick={() => setCancelOpen(true)}
            >
              Cancel booking
            </button>
          )}
        </div>
      </div>

      {actionMutation.isError && (
        <p className="ad__error" role="alert">
          {staysErrorMessage(actionMutation.error)}
        </p>
      )}

      {b.hostNote && (
        <p className="ad__muted">
          <strong>Host note:</strong> {b.hostNote}
        </p>
      )}

      {hasMoney && (
        <div className="ad__stats pf__stats bl__stats">
          <div className="ad__stat">
            <span className="ad__stat__label">Total</span>
            <span className="ad__stat__value num">
              {formatKES(Number(b.total ?? '0'))}
            </span>
          </div>
          <div className="ad__stat">
            <span className="ad__stat__label">Paid</span>
            <span className="ad__stat__value num">
              {formatKES(Number(b.amountPaid ?? '0'))}
            </span>
          </div>
          <div className="ad__stat">
            <span className="ad__stat__label">Refunded</span>
            <span className="ad__stat__value num">
              {formatKES(Number(b.amountRefunded ?? '0'))}
            </span>
          </div>
          <div className="ad__stat">
            <span className="ad__stat__label">{balanceTile.label}</span>
            <span className="ad__stat__value num">
              {formatKES(Number(balanceTile.amount))}
            </span>
          </div>
        </div>
      )}

      <section className="fm__section">
        <h2>Guest &amp; stay details</h2>
        <dl className="pf__facts">
          <Fact label="Guest">
            {b.guest ? (
              <Link to={`/app/guests/${b.guest.id}`} className="ad__link">
                {b.guest.name}
              </Link>
            ) : (
              '—'
            )}
          </Fact>
          <Fact label="Phone">
            {b.guest?.phone ?? 'Hidden until check-in'}
          </Fact>
          <Fact label="Email">{b.guest?.email ?? '—'}</Fact>
          <Fact label="Unit">
            {b.property.name} · Unit {b.unit.number}
          </Fact>
          <Fact label="Check-in">{b.checkIn}</Fact>
          <Fact label="Check-out">{b.checkOut}</Fact>
          <Fact label="Guests">{b.guests}</Fact>
          <Fact label="Guest note">{b.guestNote ?? '—'}</Fact>
        </dl>
      </section>

      {hasMoney && b.lines && b.lines.length > 0 && (
        <section className="fm__section">
          <h2>Price breakdown</h2>
          <div className="ad__tablewrap">
            <table className="ad__table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {b.lines.map((line, idx) => (
                  <tr key={idx}>
                    <td>{line.label}</td>
                    <td className="num">{formatKES(Number(line.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {hasMoney && b.payments && (
        <section className="fm__section">
          <h2>Payments &amp; refunds</h2>
          <div className="ad__tablewrap">
            {b.payments.length === 0 ? (
              <p className="ad__muted">No payments recorded yet.</p>
            ) : (
              <table className="ad__table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Kind</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Date</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {b.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="code">{p.number}</td>
                      <td>
                        <span
                          className={
                            p.voidedAt
                              ? 'ad__badge ad__badge--off'
                              : p.kind === 'REFUND'
                                ? 'ad__badge ad__badge--bad'
                                : 'ad__badge ad__badge--ok'
                          }
                        >
                          {p.voidedAt
                            ? 'Voided'
                            : p.kind === 'REFUND'
                              ? 'Refund'
                              : 'Payment'}
                        </span>
                      </td>
                      <td>{p.method}</td>
                      <td className="code">{p.reference ?? '—'}</td>
                      <td className="num">{p.receivedAt.slice(0, 10)}</td>
                      <td className="num">
                        {p.kind === 'REFUND' ? '-' : ''}
                        {formatKES(Number(p.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {paymentModal && (
        <PaymentSheet
          booking={b}
          mode={paymentModal}
          onClose={() => setPaymentModal(null)}
        />
      )}
      {refundOpen && (
        <RefundSheet booking={b} onClose={() => setRefundOpen(false)} />
      )}
      {cancelOpen && (
        <CancelSheet booking={b} onClose={() => setCancelOpen(false)} />
      )}
    </div>
  );
}
