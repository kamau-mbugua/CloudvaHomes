import type { CancellationRules, PaymentTerms, StayRules } from './types';

export function RulesFields({
  value,
  onChange,
  disabled,
}: {
  value: StayRules;
  onChange: (next: StayRules) => void;
  disabled?: boolean;
}) {
  const setPaymentKind = (kind: PaymentTerms['kind']) => {
    if (kind === 'FULL_UPFRONT') {
      onChange({ ...value, payment: { kind: 'FULL_UPFRONT' } });
    } else if (kind === 'ON_ARRIVAL') {
      onChange({ ...value, payment: { kind: 'ON_ARRIVAL' } });
    } else {
      onChange({
        ...value,
        payment: { kind: 'DEPOSIT', depositPercent: 50, balanceDueDaysBefore: 2 },
      });
    }
  };

  const setCancellationKind = (kind: CancellationRules['kind']) => {
    if (kind === 'FLEXIBLE' || kind === 'MODERATE' || kind === 'STRICT') {
      onChange({ ...value, cancellation: { kind } });
    } else {
      onChange({
        ...value,
        cancellation: {
          kind: 'CUSTOM',
          fullRefundDays: 7,
          partialRefundDays: 2,
          partialPercent: 50,
        },
      });
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="au__field">
        <div className="au__labelrow">
          <label htmlFor="rules-booking-mode">How guests book</label>
        </div>
        <select
          id="rules-booking-mode"
          className="au__input"
          value={value.bookingMode}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...value,
              bookingMode: e.target.value as StayRules['bookingMode'],
            })
          }
        >
          <option value="INSTANT">Instant booking — guests book and pay right away</option>
          <option value="REQUEST">By request — you accept or decline within 24 hours</option>
        </select>
      </div>

      <div className="au__field">
        <div className="au__labelrow">
          <label htmlFor="rules-payment-kind">When guests pay</label>
        </div>
        <select
          id="rules-payment-kind"
          className="au__input"
          value={value.payment.kind}
          disabled={disabled}
          onChange={(e) => setPaymentKind(e.target.value as PaymentTerms['kind'])}
        >
          <option value="FULL_UPFRONT">100% upfront when booking</option>
          <option value="DEPOSIT">Deposit upfront, balance before check-in</option>
          <option value="ON_ARRIVAL">Pay on arrival</option>
        </select>
      </div>

      {value.payment.kind === 'DEPOSIT' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="rules-deposit-pct">Deposit upfront (%)</label>
            </div>
            <input
              id="rules-deposit-pct"
              className="au__input"
              type="number"
              min={1}
              max={100}
              disabled={disabled}
              value={value.payment.depositPercent}
              onChange={(e) =>
                onChange({
                  ...value,
                  payment: {
                    kind: 'DEPOSIT',
                    depositPercent: Number(e.target.value),
                    balanceDueDaysBefore:
                      value.payment.kind === 'DEPOSIT' ? value.payment.balanceDueDaysBefore : 0,
                  },
                })
              }
            />
          </div>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="rules-balance-days">Balance due (days before check-in)</label>
            </div>
            <input
              id="rules-balance-days"
              className="au__input"
              type="number"
              min={0}
              max={60}
              disabled={disabled}
              value={value.payment.balanceDueDaysBefore}
              onChange={(e) =>
                onChange({
                  ...value,
                  payment: {
                    kind: 'DEPOSIT',
                    depositPercent:
                      value.payment.kind === 'DEPOSIT' ? value.payment.depositPercent : 50,
                    balanceDueDaysBefore: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        </div>
      ) : null}

      <div className="au__field">
        <div className="au__labelrow">
          <label htmlFor="rules-cancel-kind">Cancellation policy</label>
        </div>
        <select
          id="rules-cancel-kind"
          className="au__input"
          value={value.cancellation.kind}
          disabled={disabled}
          onChange={(e) => setCancellationKind(e.target.value as CancellationRules['kind'])}
        >
          <option value="FLEXIBLE">Flexible — full refund up to 1 day before check-in</option>
          <option value="MODERATE">
            Moderate — full refund 5+ days before; 50% up to 1 day before
          </option>
          <option value="STRICT">
            Strict — full refund 14+ days before; 50% up to 7 days before
          </option>
          <option value="CUSTOM">Custom cancellation rules</option>
        </select>
      </div>

      {value.cancellation.kind === 'CUSTOM' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="rules-full-days">Full refund (days before)</label>
            </div>
            <input
              id="rules-full-days"
              className="au__input"
              type="number"
              min={0}
              max={90}
              disabled={disabled}
              value={value.cancellation.fullRefundDays}
              onChange={(e) =>
                onChange({
                  ...value,
                  cancellation: {
                    ...(value.cancellation as Extract<CancellationRules, { kind: 'CUSTOM' }>),
                    fullRefundDays: Number(e.target.value),
                  },
                })
              }
            />
          </div>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="rules-partial-days">Partial refund (days before)</label>
            </div>
            <input
              id="rules-partial-days"
              className="au__input"
              type="number"
              min={0}
              max={90}
              disabled={disabled}
              value={value.cancellation.partialRefundDays}
              onChange={(e) =>
                onChange({
                  ...value,
                  cancellation: {
                    ...(value.cancellation as Extract<CancellationRules, { kind: 'CUSTOM' }>),
                    partialRefundDays: Number(e.target.value),
                  },
                })
              }
            />
          </div>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="rules-partial-pct">Partial refund (%)</label>
            </div>
            <input
              id="rules-partial-pct"
              className="au__input"
              type="number"
              min={0}
              max={100}
              disabled={disabled}
              value={value.cancellation.partialPercent}
              onChange={(e) =>
                onChange({
                  ...value,
                  cancellation: {
                    ...(value.cancellation as Extract<CancellationRules, { kind: 'CUSTOM' }>),
                    partialPercent: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
