import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { AFTER_INVOICE_KEYS, billingErrorMessage, useMoveInCharges } from './api';
import { activeMoveInCharges, moveInChargeAmount, moveInChargeRule, sumMinor } from './rules';
import type { Invoice, MoveInCharge } from './types';

/**
 * Move-in charges as they would be billed — shown in the move-in sheet under "Issue
 * move-in invoice", and in the dialog that issues one later for an existing tenancy.
 */

/** Each active charge with what it comes to for `rentMinor` (null = rent not valid yet). */
export function MoveInChargeList({ charges, rentMinor }: { charges: MoveInCharge[]; rentMinor: number | null }) {
  const amounts = charges.map((c) => moveInChargeAmount(c, rentMinor));
  const known = amounts.every((a) => a !== null);
  return (
    <ul className="bl__chargelist">
      {charges.map((c, i) => (
        <li key={c.id}>
          <span>
            {c.name}
            <span className="ad__muted"> · {c.rentMonths !== null ? moveInChargeRule(c) : c.kind === 'DEPOSIT' ? 'deposit' : 'fee'}{c.refundable ? ', refundable' : ''}</span>
          </span>
          <span className="num">{amounts[i] !== null ? formatKES(amounts[i]) : '—'}</span>
        </li>
      ))}
      <li className="bl__chargetotal">
        <span>Total</span>
        <span className="num">{known ? formatKES(sumMinor(amounts as number[])) : 'Enter the rent'}</span>
      </li>
    </ul>
  );
}

/**
 * "Issue move-in invoice" for a tenancy that has none (`POST /tenancies/:id/move-in-invoice`).
 * Lists the property's active move-in charges when the property is known and the role can
 * see charges; the server decides either way (`ALREADY_INVOICED`, `NO_MOVE_IN_CHARGES`).
 */
export function MoveInInvoiceDialog({
  tenancyId,
  who,
  propertyId,
  rentAmount,
  onClose,
}: {
  tenancyId: string;
  who: string;
  propertyId?: string;
  rentAmount?: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canSeeCharges = useCan('charges:view');
  const charges = useMoveInCharges(propertyId ?? '', canSeeCharges);
  const active = activeMoveInCharges(charges.data ?? []);

  const issue = useMutation({
    mutationFn: () => api.post<DataEnvelope<Invoice>>(`/tenancies/${tenancyId}/move-in-invoice`),
    onSuccess: async (result) => {
      const inv = result?.data;
      toast.saved(inv ? `Move-in invoice ${inv.number} was issued to ${who}.` : `A move-in invoice was issued to ${who}.`);
      await Promise.all(AFTER_INVOICE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
      if (inv?.id) navigate(`/app/invoices/${inv.id}`);
    },
  });

  const knowsCharges = Boolean(propertyId) && canSeeCharges;

  return (
    <Sheet
      title={`Issue move-in invoice — ${who}`}
      busy={issue.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={issue.isPending}>Cancel</button>
          <button type="button" className="nx-btn nx-btn--primary" onClick={() => issue.mutate()}
            disabled={issue.isPending || (knowsCharges && charges.isSuccess && active.length === 0)}>
            {issue.isPending ? 'Issuing…' : 'Issue invoice'}
          </button>
        </>
      )}
    >
      <div className="pf__dialogform">
        <p className="ad__muted">Bills the deposit and move-in fees set up for this property. A tenancy can have only one move-in invoice.</p>
        {knowsCharges ? (
          charges.isPending ? <p className="ad__muted" role="status">Loading charges…</p>
            : charges.isError ? <p className="nx-sheet__error">{billingErrorMessage(charges.error)}</p>
              : active.length === 0 ? <p className="nx-sheet__error">This property has no active move-in charges. Add them under Charges first.</p>
                : <MoveInChargeList charges={active} rentMinor={rentAmount ?? null} />
        ) : null}
        {issue.isError ? <p className="nx-sheet__error" role="alert">{billingErrorMessage(issue.error)}</p> : null}
      </div>
    </Sheet>
  );
}
