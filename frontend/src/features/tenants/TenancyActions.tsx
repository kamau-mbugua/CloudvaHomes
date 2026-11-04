import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay, isDay, todayInNairobi } from '../../lib/dates';
import { saveBlob } from '../../lib/files';
import { useToast } from '../../lib/useToast';
import { ConfirmDialog } from '../../components/ConfirmDelete';
import { MoreMenu, type MoreMenuItem } from '../../components/MoreMenu';
import { tenancyActionLayout, type TenancyAction } from './actionLayout';
import { RenewLeaseSheet, RentChangeSheet } from './LeaseSheets';
import { InspectionSheet } from './InspectionSheet';
import { Sheet } from '../../components/Sheet';
import { MoveInInvoiceDialog } from '../billing/MoveInCharges';
import { OCCUPANCY_KEYS, portfolioErrorMessage } from '../portfolio/api';
import { splitFormError } from '../portfolio/formErrors';
import { personName } from '../portfolio/labels';
import type { Tenancy } from '../portfolio/types';
import { optional } from '../portfolio/forms';
import { useForm } from '../portfolio/hooks';
import { Field } from '../portfolio/ui';
import { uploadErrorMessage, uploadFile } from '../uploads/api';

/**
 * The actions for one tenancy: at most two buttons for the next step (give notice, move
 * out…) and a "More" menu for the rest — lease PDF, signed lease, move-in invoice, withdraw
 * notice, and delete last (for a tenancy recorded by mistake). Which goes where is decided
 * in actionLayout.ts. Used on list rows, the unit page and the tenant page.
 *
 * Only `ACTIVE` and `NOTICE` tenancies change; an ended one only offers delete. Each
 * change moves occupancy, so units, properties, tenants and tenancies are all refreshed.
 */

type TenancyLike = Pick<Tenancy, 'id' | 'status' | 'startDate' | 'endDate' | 'hasSignedLease' | 'leaseEndDate' | 'rentChanges'> & {
  tenant: Pick<Tenancy['tenant'], 'firstName' | 'lastName'>;
  unit?: Pick<Tenancy['unit'], 'number'> & { property?: { id: string; code?: string } };
  /** For listing the move-in charges; taken from `unit.property` when absent. */
  propertyId?: string;
  rentAmount?: number;
};

export function TenancyActions({ tenancy, size = 'sm' }: { tenancy: TenancyLike; size?: 'sm' | 'md' }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canView = useCan('tenancies:view');
  const canUpdate = useCan('tenancies:update');
  const canDelete = useCan('tenancies:delete');
  const canInvoice = useCan('invoices:create');
  const [dialog, setDialog] = useState<'notice' | 'moveOut' | 'moveInInvoice' | 'signedLease' | 'withdraw' | 'delete' | 'renew' | 'rentChange' | 'inspectIn' | 'inspectOut' | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const who = personName(tenancy.tenant);
  const where = tenancy.unit ? ` from ${tenancy.unit.number}` : '';
  const refresh = () => Promise.all(OCCUPANCY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

  const downloadLeasePdf = async () => {
    setDownloadingPdf(true);
    try {
      const blob = await api.blob(`/tenancies/${tenancy.id}/lease/pdf`);
      const unitLabel = tenancy.unit?.number ? `-${tenancy.unit.number}` : '';
      saveBlob(blob, `Lease${unitLabel}.pdf`, 'application/pdf');
    } catch (error) {
      toast.failed(portfolioErrorMessage(error));
    } finally {
      setDownloadingPdf(false);
    }
  };

  const withdraw = useMutation({
    mutationFn: () => api.delete(`/tenancies/${tenancy.id}/notice`),
    onSuccess: async () => {
      toast.saved(`${who}’s notice was withdrawn. The tenancy is active again.`);
      await refresh();
    },
    onError: (error) => toast.failed(portfolioErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/tenancies/${tenancy.id}`),
    onSuccess: async () => {
      toast.saved(`The tenancy for ${who} was deleted.`);
      await refresh();
    },
    onError: (error) => toast.failed(portfolioErrorMessage(error)),
  });

  const btn = `nx-btn ${size === 'sm' ? 'nx-btn--sm' : ''}`;
  const busy = withdraw.isPending || remove.isPending || downloadingPdf;

  if (!canView && !canUpdate && !canDelete && !canInvoice) return null;

  const layout = tenancyActionLayout(
    tenancy.status,
    { view: canView, update: canUpdate, delete: canDelete, invoice: canInvoice },
    { hasSignedLease: tenancy.hasSignedLease, pendingRentChanges: tenancy.rentChanges?.length ?? 0 },
  );
  const ACTIONS: Record<TenancyAction, MoreMenuItem> = {
    notice: { label: 'Give notice', onSelect: () => setDialog('notice') },
    changeNotice: { label: 'Change notice', onSelect: () => setDialog('notice') },
    withdrawNotice: { label: 'Withdraw notice', onSelect: () => setDialog('withdraw') },
    moveOut: { label: 'Move out', onSelect: () => setDialog('moveOut') },
    leasePdf: { label: downloadingPdf ? 'Preparing lease PDF…' : 'Lease PDF', onSelect: () => void downloadLeasePdf(), disabled: downloadingPdf },
    attachLease: { label: tenancy.hasSignedLease ? 'Signed lease' : 'Attach signed lease', onSelect: () => setDialog('signedLease') },
    moveInInvoice: { label: 'Issue move-in invoice', onSelect: () => setDialog('moveInInvoice') },
    inspectIn: { label: 'Move-in inspection', onSelect: () => setDialog('inspectIn') },
    inspectOut: { label: 'Move-out inspection', onSelect: () => setDialog('inspectOut') },
    renew: { label: 'Renew lease', onSelect: () => setDialog('renew') },
    rentChange: { label: tenancy.rentChanges?.length ? 'Change rent (1 scheduled)' : 'Change rent', onSelect: () => setDialog('rentChange') },
    delete: { label: 'Delete tenancy', onSelect: () => setDialog('delete'), danger: true },
  };

  return (
    <>
      {layout.buttons.map((a) => (
        <button key={a} type="button" className={btn} disabled={busy} onClick={ACTIONS[a].onSelect}>
          {ACTIONS[a].label}
        </button>
      ))}
      <MoreMenu
        size={size}
        items={layout.menu.map((a) => ({ ...ACTIONS[a], disabled: ACTIONS[a].disabled || busy }))}
        ariaLabel={`More actions for ${who}${tenancy.unit ? `’s tenancy in ${tenancy.unit.number}` : ''}`}
      />

      {dialog === 'inspectIn' ? <InspectionSheet tenancyId={tenancy.id} kind="MOVE_IN" who={who} onClose={() => setDialog(null)} /> : null}
      {dialog === 'inspectOut' ? <InspectionSheet tenancyId={tenancy.id} kind="MOVE_OUT" who={who} onClose={() => setDialog(null)} /> : null}
      {dialog === 'renew' ? <RenewLeaseSheet tenancy={tenancy} who={who} onClose={() => setDialog(null)} /> : null}
      {dialog === 'rentChange' ? <RentChangeSheet tenancy={tenancy} who={who} onClose={() => setDialog(null)} /> : null}
      {dialog === 'withdraw' ? (
        <ConfirmDialog
          verb="Withdraw"
          what={`${who}’s notice`}
          consequence="The tenancy becomes active again with no end date."
          busy={withdraw.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => withdraw.mutate()}
        />
      ) : null}
      {dialog === 'delete' ? (
        <ConfirmDialog
          what={`the tenancy for ${who}${where}`}
          consequence="Only for a tenancy recorded by mistake and never invoiced — to end a real one, use Move out. This cannot be undone."
          busy={remove.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => remove.mutate()}
        />
      ) : null}
      {dialog === 'notice' ? <NoticeDialog tenancy={tenancy} who={who} onClose={() => setDialog(null)} onDone={refresh} /> : null}
      {dialog === 'moveInInvoice' ? (
        <MoveInInvoiceDialog
          tenancyId={tenancy.id}
          who={who}
          propertyId={tenancy.propertyId ?? tenancy.unit?.property?.id}
          rentAmount={tenancy.rentAmount}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'moveOut' ? <MoveOutDialog tenancy={tenancy} who={who} onClose={() => setDialog(null)} onDone={refresh} /> : null}
      {dialog === 'signedLease' ? (
        <SignedLeaseDialog
          tenancy={tenancy}
          who={who}
          canUpdate={canUpdate}
          onClose={() => setDialog(null)}
          onDone={refresh}
        />
      ) : null}
    </>
  );
}

/** Notice: the expected last day. Can be given again to change the date. */
function NoticeDialog({ tenancy, who, onClose, onDone }: {
  tenancy: TenancyLike;
  who: string;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const toast = useToast();
  const form = useForm<'endDate'>({ endDate: tenancy.status === 'NOTICE' && tenancy.endDate ? tenancy.endDate : '' });

  const give = useMutation({
    mutationFn: (endDate: string) => api.post(`/tenancies/${tenancy.id}/notice`, { endDate }),
    onSuccess: async (_r, endDate) => {
      toast.saved(`${who} is on notice to leave on ${formatDay(endDate)}.`);
      await onDone();
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, { fields: ['endDate'], describe: portfolioErrorMessage });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const endDate = form.values.endDate;
    const error = !isDay(endDate) ? 'Choose the date they expect to leave.'
      : endDate < tenancy.startDate ? `Must be on or after the move-in date (${formatDay(tenancy.startDate)}).` : null;
    form.setErrors(error ? { endDate: error } : {});
    form.setGeneral(null);
    if (!error) give.mutate(endDate);
  };

  return (
    <Sheet
      title={tenancy.status === 'NOTICE' ? `Change notice — ${who}` : `Give notice — ${who}`}
      busy={give.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={give.isPending}>Cancel</button>
          <button type="submit" form="notice-form" className="nx-btn nx-btn--primary" disabled={give.isPending}>
            {give.isPending ? 'Saving…' : 'Save notice'}
          </button>
        </>
      )}
    >
      <form id="notice-form" className="pf__dialogform" onSubmit={submit} noValidate>
        <p className="ad__muted">The unit shows as on notice until they move out. Notice can be withdrawn.</p>
        <Field id="nt-end" label="Expected move-out date" error={form.errors.endDate}>
          <input id="nt-end" type="date" min={tenancy.startDate} value={form.values.endDate}
            onChange={(e) => form.set('endDate', e.target.value)} aria-invalid={Boolean(form.errors.endDate)} />
        </Field>
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}

/** Move-out: the actual last day (≥ the start) and why. Ends the tenancy; the unit is vacant again. */
function MoveOutDialog({ tenancy, who, onClose, onDone }: {
  tenancy: TenancyLike;
  who: string;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const toast = useToast();
  const today = todayInNairobi();
  const form = useForm<'endDate' | 'reason'>({
    endDate: tenancy.status === 'NOTICE' && tenancy.endDate ? tenancy.endDate : today,
    reason: '',
  });

  const moveOut = useMutation({
    mutationFn: (body: { endDate: string; reason?: string }) => api.post(`/tenancies/${tenancy.id}/move-out`, body),
    onSuccess: async (_r, body) => {
      toast.saved(`${who} moved out on ${formatDay(body.endDate)}.`);
      await onDone();
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, { fields: ['endDate', 'reason'], describe: portfolioErrorMessage });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const { endDate, reason } = form.values;
    const error = !isDay(endDate) ? 'Choose the day they moved out.'
      : endDate < tenancy.startDate ? `Must be on or after the move-in date (${formatDay(tenancy.startDate)}).` : null;
    form.setErrors(error ? { endDate: error } : {});
    form.setGeneral(null);
    if (!error) moveOut.mutate({ endDate, reason: optional(reason) });
  };

  return (
    <Sheet
      title={`Move out — ${who}`}
      busy={moveOut.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={moveOut.isPending}>Cancel</button>
          <button type="submit" form="moveout-form" className="nx-btn nx-btn--primary" disabled={moveOut.isPending}>
            {moveOut.isPending ? 'Saving…' : 'Move out'}
          </button>
        </>
      )}
    >
      <form id="moveout-form" className="pf__dialogform" onSubmit={submit} noValidate>
        <p className="ad__muted">Ends the tenancy and makes the unit vacant. Settle the deposit afterwards from the tenant’s page (Deposits).</p>
        <Field id="mo-end" label="Move-out date" error={form.errors.endDate}>
          <input id="mo-end" type="date" min={tenancy.startDate} value={form.values.endDate}
            onChange={(e) => form.set('endDate', e.target.value)} aria-invalid={Boolean(form.errors.endDate)} />
        </Field>
        <Field id="mo-reason" label="Reason" error={form.errors.reason} optional>
          <textarea id="mo-reason" rows={2} value={form.values.reason} onChange={(e) => form.set('reason', e.target.value)}
            placeholder="e.g. Relocated for work" />
        </Field>
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}

function SignedLeaseDialog({
  tenancy,
  who,
  canUpdate,
  onClose,
  onDone,
}: {
  tenancy: TenancyLike;
  who: string;
  canUpdate: boolean;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const attach = useMutation({
    mutationFn: async (selected: File) => {
      const uploaded = await uploadFile('LEASE_DOCUMENT', selected);
      return api.post(`/tenancies/${tenancy.id}/lease-document`, { uploadId: uploaded.id });
    },
    onSuccess: async () => {
      toast.saved(`Signed lease attached for ${who}.`);
      await onDone();
      onClose();
    },
    onError: (err) => {
      setError(uploadErrorMessage(err, portfolioErrorMessage));
    },
  });

  const downloadExisting = async () => {
    setDownloading(true);
    try {
      const blob = await api.blob(`/tenancies/${tenancy.id}/lease-document`);
      const ext = blob.type === 'application/pdf' ? 'pdf' : 'jpg';
      saveBlob(blob, `Signed-Lease-${tenancy.unit?.number ?? tenancy.id}.${ext}`, blob.type);
    } catch (err) {
      toast.failed(portfolioErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError('Choose a signed lease PDF or photo scan to upload.');
      return;
    }
    setError(null);
    attach.mutate(file);
  };

  return (
    <Sheet
      title={`Signed lease — ${who}`}
      busy={attach.isPending}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={attach.isPending}>
            Close
          </button>
          {canUpdate ? (
            <button
              type="submit"
              form="signed-lease-form"
              className="nx-btn nx-btn--primary"
              disabled={attach.isPending || !file}
            >
              {attach.isPending
                ? 'Uploading…'
                : tenancy.hasSignedLease
                  ? 'Replace signed lease'
                  : 'Attach signed lease'}
            </button>
          ) : null}
        </>
      }
    >
      <form id="signed-lease-form" className="pf__dialogform" onSubmit={submit} noValidate>
        <p className="ad__muted">
          Store the executed lease scan (PDF or photo up to 10 MB). Once attached, both staff and
          the tenant can download it from their portal.
        </p>
        {tenancy.hasSignedLease ? (
          <div>
            <button
              type="button"
              className="nx-btn nx-btn--sm"
              onClick={downloadExisting}
              disabled={downloading}
            >
              {downloading ? 'Downloading…' : 'Download current signed lease'}
            </button>
          </div>
        ) : null}
        {canUpdate ? (
          <Field id="lease-file" label={tenancy.hasSignedLease ? 'Upload replacement file' : 'Signed lease file (PDF or photo)'}>
            <input
              id="lease-file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
          </Field>
        ) : null}
        {error ? (
          <p className="nx-sheet__error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}

