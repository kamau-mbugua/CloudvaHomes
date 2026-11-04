import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { formatDay } from '../../lib/dates';
import { saveBlob } from '../../lib/files';
import { useToast } from '../../lib/useToast';
import { unwrap } from '../payments/rules';
import { CONDITION_LABEL, type Inspection } from '../tenants/inspections';

const path = (tenantId: string, tenancyId: string) =>
  `/tenant/accounts/${encodeURIComponent(tenantId)}/tenancies/${encodeURIComponent(tenancyId)}/inspections`;

/**
 * The tenant's view of their move-in / move-out inspections (phase 13): each area's
 * condition, the PDF, and "I've checked this" to acknowledge it.
 */
export function TenantInspections({ tenantId, tenancyId }: { tenantId: string; tenancyId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = ['tenant', tenantId, 'inspections', tenancyId];
  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<unknown>(path(tenantId, tenancyId)).then((b) => unwrap<Inspection[]>(b)),
  });
  const ack = useMutation({
    mutationFn: (kind: string) => api.post(`${path(tenantId, tenancyId)}/${kind}/acknowledge`, {}),
    onSuccess: async () => {
      toast.saved('Thanks — the inspection is marked as checked.');
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () => toast.failed('That didn’t go through. Try again.'),
  });
  const pdf = async (kind: string) => {
    try {
      const blob = await api.blob(`${path(tenantId, tenancyId)}/${kind}/pdf`);
      saveBlob(blob, `${kind === 'MOVE_IN' ? 'Move-in' : 'Move-out'}-inspection.pdf`, 'application/pdf');
    } catch {
      toast.failed('The PDF could not be downloaded. Try again.');
    }
  };
  if (!list.data?.length) return null;
  return (
    <div className="tp__inspections">
      {list.data.map((i) => (
        <details key={i.id} className="tp__inspection">
          <summary>
            {i.kind === 'MOVE_IN' ? 'Move-in' : 'Move-out'} inspection · {formatDay(i.inspectedOn)}
            {i.tenantAcknowledgedAt ? <span className="ad__badge ad__badge--ok">Checked</span> : <span className="ad__badge ad__badge--alert">Please check</span>}
          </summary>
          <ul className="tp__rows">
            {i.items.map((item) => (
              <li key={item.area}>
                <span>{item.area}</span>
                <span>{CONDITION_LABEL[item.condition]}{item.note ? ` · ${item.note}` : ''}</span>
              </li>
            ))}
          </ul>
          <div className="pf__actions">
            <button type="button" className="nx-btn nx-btn--sm" onClick={() => void pdf(i.kind)}>PDF</button>
            {!i.tenantAcknowledgedAt ? (
              <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" disabled={ack.isPending} onClick={() => ack.mutate(i.kind)}>
                I’ve checked this
              </button>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}
