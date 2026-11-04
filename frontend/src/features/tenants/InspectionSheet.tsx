import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { unwrap } from '../payments/rules';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { saveBlob } from '../../lib/files';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { CardSkeleton } from '../../components/Loading';
import { portfolioErrorMessage } from '../portfolio/api';
import { Field } from '../portfolio/ui';
import { PrivateFilePreview } from '../uploads/ui';
import { uploadErrorMessage, uploadFile } from '../uploads/api';
import {
  CONDITION_LABEL,
  compareItems,
  draftFromInspection,
  type Inspection,
  type InspectionDraft,
  type InspectionKind,
  type ItemCondition,
  inspectionKeys,
} from './inspections';

const MAX_PHOTOS = 6;
const CONDITIONS: ItemCondition[] = ['GOOD', 'FAIR', 'POOR', 'DAMAGED'];

/**
 * A move-in or move-out inspection: a checklist of areas with a condition, note and photos
 * (taken with the phone camera). The move-out one shows the move-in condition beside each
 * area and flags anything worse. Once the tenant has acknowledged it, editing reopens it.
 */
export function InspectionSheet({ tenancyId, kind, who, onClose }: {
  tenancyId: string;
  kind: InspectionKind;
  who: string;
  onClose: () => void;
}) {
  const list = useQuery({
    queryKey: inspectionKeys(tenancyId),
    queryFn: () => api.get<unknown>(`/tenancies/${tenancyId}/inspections`).then((b) => unwrap<Inspection[]>(b)),
  });
  const title = `${kind === 'MOVE_IN' ? 'Move-in' : 'Move-out'} inspection — ${who}`;
  if (list.isPending) return <Sheet title={title} onClose={onClose}><CardSkeleton count={2} /></Sheet>;
  if (list.isError) return <Sheet title={title} onClose={onClose}><p className="ad__error" role="alert">{portfolioErrorMessage(list.error)}</p></Sheet>;
  const saved = list.data.find((i) => i.kind === kind);
  const moveIn = list.data.find((i) => i.kind === 'MOVE_IN');
  return (
    <InspectionForm
      key={saved?.id ?? 'new'}
      tenancyId={tenancyId}
      kind={kind}
      title={title}
      saved={saved}
      moveIn={kind === 'MOVE_OUT' ? moveIn : undefined}
      onClose={onClose}
    />
  );
}

function InspectionForm({ tenancyId, kind, title, saved, moveIn, onClose }: {
  tenancyId: string;
  kind: InspectionKind;
  title: string;
  saved?: Inspection;
  moveIn?: Inspection;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canEdit = useCan('tenancies:update');
  const [draft, setDraft] = useState<InspectionDraft>(() => draftFromInspection(saved, todayInNairobi(), moveIn?.items));
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const acknowledged = Boolean(saved?.tenantAcknowledgedAt);
  const [reopen, setReopen] = useState(false);
  const locked = !canEdit || (acknowledged && !reopen);
  // Saved photos load through the inspection; ones added since, through the upload itself.
  const savedPhotos = new Set((saved?.items ?? []).flatMap((i) => i.photoUploadIds));
  const photoPath = (id: string) =>
    savedPhotos.has(id) ? `/tenancies/${tenancyId}/inspections/${kind}/photos/${id}` : `/uploads/${id}/content`;
  const before = new Map((moveIn?.items ?? []).map((i) => [i.area.trim().toLowerCase(), i.condition]));
  const worse = new Set(
    compareItems(moveIn?.items ?? [], draft.items).filter((r) => r.worse).map((r) => r.area.trim().toLowerCase()),
  );

  const save = useMutation({
    mutationFn: () => api.put(`/tenancies/${tenancyId}/inspections/${kind}`, {
      inspectedOn: draft.inspectedOn,
      inspectorName: draft.inspectorName.trim() || undefined,
      notes: draft.notes.trim() || undefined,
      items: draft.items.map((i) => ({ area: i.area, condition: i.condition, note: i.note.trim() || undefined, photoUploadIds: i.photoUploadIds })),
      ...(reopen ? { reopen: true } : {}),
    }),
    onSuccess: async () => {
      toast.saved('Inspection saved.');
      await queryClient.invalidateQueries({ queryKey: inspectionKeys(tenancyId) });
      onClose();
    },
    onError: (e) => setError(portfolioErrorMessage(e)),
  });

  const setItem = (index: number, patch: Partial<InspectionDraft['items'][number]>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) }));
  const addPhoto = async (index: number, file: File | undefined) => {
    if (!file) return;
    setUploading(index);
    try {
      const up = await uploadFile('INSPECTION_PHOTO', file);
      setItem(index, { photoUploadIds: [...draft.items[index]!.photoUploadIds, up.id] });
    } catch (e) {
      setError(uploadErrorMessage(e, () => 'The photo could not be uploaded. Try again.'));
    } finally {
      setUploading(null);
    }
  };
  const downloadPdf = async () => {
    try {
      const blob = await api.blob(`/tenancies/${tenancyId}/inspections/${kind}/pdf`);
      saveBlob(blob, `${kind === 'MOVE_IN' ? 'Move-in' : 'Move-out'}-inspection.pdf`, 'application/pdf');
    } catch (e) {
      toast.failed(portfolioErrorMessage(e));
    }
  };

  return (
    <Sheet
      title={title}
      wide
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          {saved ? <button type="button" className="nx-btn" onClick={downloadPdf}>Download PDF</button> : null}
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Close</button>
          {!locked ? (
            <button type="button" className="nx-btn nx-btn--primary" disabled={save.isPending || uploading !== null} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save inspection'}
            </button>
          ) : null}
        </>
      )}
    >
      {acknowledged ? (
        <p className="lf__notice" role="status">
          The tenant acknowledged this inspection on {formatDay(saved!.tenantAcknowledgedAt!.slice(0, 10))}.
          {canEdit ? (
            <label className="fld__check ins__reopen">
              <input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} />
              Reopen to make changes (the tenant will need to acknowledge it again)
            </label>
          ) : null}
        </p>
      ) : null}
      {kind === 'MOVE_OUT' && !moveIn ? <p className="ad__muted">There is no move-in inspection to compare with.</p> : null}
      <div className="fm__grid">
        <Field id="ins-date" label="Inspected on">
          <input id="ins-date" type="date" value={draft.inspectedOn} disabled={locked} onChange={(e) => setDraft({ ...draft, inspectedOn: e.target.value })} />
        </Field>
        <Field id="ins-by" label="Inspected by" optional>
          <input id="ins-by" value={draft.inspectorName} disabled={locked} maxLength={100} onChange={(e) => setDraft({ ...draft, inspectorName: e.target.value })} />
        </Field>
      </div>

      <ol className="ins__list">
        {draft.items.map((item, index) => {
          const was = before.get(item.area.trim().toLowerCase());
          const isWorse = worse.has(item.area.trim().toLowerCase());
          return (
            <li key={index} className={`ins__item${isWorse ? ' ins__item--worse' : ''}`}>
              <div className="ins__row">
                <input className="nx-input ins__area" aria-label="Area" value={item.area} disabled={locked} maxLength={60}
                  onChange={(e) => setItem(index, { area: e.target.value })} />
                <div className="ins__conds" role="radiogroup" aria-label={`Condition of ${item.area || 'this area'}`}>
                  {CONDITIONS.map((c) => (
                    <label key={c} className={`ins__cond ins__cond--${c.toLowerCase()}${item.condition === c ? ' is-on' : ''}`}>
                      <input type="radio" name={`cond-${index}`} checked={item.condition === c} disabled={locked}
                        onChange={() => setItem(index, { condition: c })} />
                      {CONDITION_LABEL[c]}
                    </label>
                  ))}
                </div>
                {!locked ? (
                  <button type="button" className="nx-btn nx-btn--sm" aria-label={`Remove ${item.area}`}
                    onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }))}>Remove</button>
                ) : null}
              </div>
              {was ? <p className={`ins__before${isWorse ? ' ins__before--worse' : ''}`}>At move-in: {CONDITION_LABEL[was]}{isWorse ? ' — worse now' : ''}</p> : null}
              <input className="nx-input" aria-label={`Note for ${item.area}`} placeholder="Note (optional)" value={item.note} disabled={locked} maxLength={500}
                onChange={(e) => setItem(index, { note: e.target.value })} />
              <div className="ins__photos">
                {item.photoUploadIds.map((id) => (
                  <PrivateFilePreview key={id} path={photoPath(id)} alt={item.area} className="ins__photo" />
                ))}
                {!locked && item.photoUploadIds.length < MAX_PHOTOS ? (
                  <label className="nx-btn nx-btn--sm ins__add">
                    {uploading === index ? 'Uploading…' : 'Add photo'}
                    <input type="file" accept="image/*" capture="environment" hidden disabled={uploading !== null}
                      onChange={(e) => { void addPhoto(index, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {!locked && draft.items.length < 30 ? (
        <button type="button" className="nx-btn nx-btn--sm" onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { area: '', condition: 'GOOD', note: '', photoUploadIds: [] }] }))}>
          Add an area
        </button>
      ) : null}
      <Field id="ins-notes" label="General notes" optional wide>
        <textarea id="ins-notes" rows={3} value={draft.notes} disabled={locked} maxLength={2000} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </Field>
      {error ? <p className="nx-sheet__error" role="alert">{error}</p> : null}
    </Sheet>
  );
}
