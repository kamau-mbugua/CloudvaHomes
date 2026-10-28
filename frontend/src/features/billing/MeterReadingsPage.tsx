import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { currentPeriod, formatPeriod } from '../../lib/periods';
import { calculateReading, formatQuantity, parseQuantity, trimQuantity } from '../../lib/quantity';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { Sheet } from '../../components/Sheet';
import { OPTIONS_PAGE_SIZE, keys as portfolioKeys } from '../portfolio/api';
import { splitFormError } from '../portfolio/formErrors';
import { useForm, useListFilters } from '../portfolio/hooks';
import { RECORD_STATUS } from '../portfolio/labels';
import type { Unit } from '../portfolio/types';
import { Badge, Field } from '../portfolio/ui';
import { billingErrorMessage, keys, useChargeTypes } from './api';
import { splitRowErrors, uploadRowErrors } from './rules';
import { MeterPhotoCell } from './MeterPhoto';
import type { PendingPhoto } from './MeterPhoto';
import type { ChargeType, Meter, ReadingSheetRow } from './types';
import { MonthPicker, PropertySelect } from './ui';

/**
 * Meter readings (`/app/meter-readings`): property → metered charge → month, then a sheet
 * with one row per active meter. Previous defaults to the last reading; consumption and
 * amount are worked out as you type with exact decimal arithmetic (see lib/quantity.ts).
 * "Save all" upserts every changed row in one call. The Meters tab adds and edits meters.
 */

type Tab = 'readings' | 'meters';

export function MeterReadingsPage() {
  const filters = useListFilters();
  const propertyId = filters.get('propertyId');
  const tab: Tab = filters.get('tab') === 'meters' ? 'meters' : 'readings';
  const canSeeProperties = useCan('properties:view');

  return (
    <div className="pg">
      <div className="ad__filters">
        <PropertySelect value={propertyId} onChange={(id) => filters.setFilter({ propertyId: id, chargeTypeId: '' })} />
        {propertyId ? (
          <div className="pf__tabs" role="tablist" aria-label="Meters">
            <button type="button" role="tab" aria-selected={tab === 'readings'} className="pf__tab" onClick={() => filters.setFilter({ tab: '' })}>Readings</button>
            <button type="button" role="tab" aria-selected={tab === 'meters'} className="pf__tab" onClick={() => filters.setFilter({ tab: 'meters' })}>Meters</button>
          </div>
        ) : null}
      </div>

      {!canSeeProperties ? (
        <div className="ad__tablewrap"><EmptyState title="Readings are kept per property" detail="Your role cannot list properties, so it cannot open a property’s meters." /></div>
      ) : !propertyId ? (
        <div className="ad__tablewrap"><EmptyState title="Choose a property" detail="Then the metered charge (water, power) and the month to read." /></div>
      ) : tab === 'meters' ? (
        <MetersTab propertyId={propertyId} />
      ) : (
        <ReadingsTab propertyId={propertyId} />
      )}
    </div>
  );
}

function useMeteredCharges(propertyId: string) {
  return useChargeTypes({ propertyId, kind: 'METERED' });
}

// ---------------------------------------------------------------- readings

function ReadingsTab({ propertyId }: { propertyId: string }) {
  const filters = useListFilters();
  const charges = useMeteredCharges(propertyId);
  const choices = (charges.data ?? []).filter((c) => c.status === 'ACTIVE');
  const wanted = filters.get('chargeTypeId');
  const charge = choices.find((c) => c.id === wanted) ?? choices[0];
  const thisMonth = currentPeriod();
  const period = filters.get('period') || thisMonth;

  if (charges.isError) return <p className="ad__error" role="alert">{billingErrorMessage(charges.error)}</p>;
  if (charges.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (!charge) {
    return (
      <div className="ad__tablewrap">
        <EmptyState title="No metered charges" detail="Add a recurring charge of kind “Metered” (e.g. Water at KES 150 per m³) under Charges, then its meters." />
      </div>
    );
  }

  return (
    <section>
      <div className="ad__filters">
        <select className="ad__select" aria-label="Metered charge" value={charge.id} onChange={(e) => filters.setFilter({ chargeTypeId: e.target.value })}>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <MonthPicker value={period} max={thisMonth} onChange={(p) => filters.setFilter({ period: p })} />
        <span className="ad__muted num">{charge.unitRate !== null ? `${formatKES(charge.unitRate)} per ${charge.unitLabel || 'unit'}` : ''}</span>
      </div>
      <ReadingSheet propertyId={propertyId} charge={charge} period={period} />
    </section>
  );
}

function ReadingSheet({ propertyId, charge, period }: { propertyId: string; charge: ChargeType; period: string }) {
  const sheet = useQuery({
    queryKey: [...keys.readings, 'sheet', { propertyId, chargeTypeId: charge.id, period }],
    queryFn: () => api.get<DataEnvelope<ReadingSheetRow[]>>('/meter-readings/sheet', { propertyId, chargeTypeId: charge.id, period })
      .then((r) => r.data),
  });

  if (sheet.isError) return <p className="ad__error" role="alert">{billingErrorMessage(sheet.error)}</p>;
  if (sheet.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (sheet.data.length === 0) {
    return (
      <div className="ad__tablewrap">
        <EmptyState title="No active meters" detail="Add meters for this charge on the Meters tab." />
      </div>
    );
  }
  return <ReadingForm key={`${charge.id}-${period}-${sheet.dataUpdatedAt}`} charge={charge} period={period} rows={sheet.data} />;
}

interface RowValues { previous: string; current: string; note: string }

function ReadingForm({ charge, period, rows }: { charge: ChargeType; period: string; rows: ReadingSheetRow[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canSave = useCan('meters:create');
  const canDelete = useCan('meters:delete');
  const unit = charge.unitLabel || '';

  const initial: Record<string, RowValues> = Object.fromEntries(rows.map((r) => [r.meter.id, {
    previous: r.reading?.previous ?? r.suggestedPrevious,
    current: r.reading?.current ?? '',
    note: r.reading?.note ?? '',
  }]));
  const [values, setValues] = useState(initial);
  const [photos, setPhotos] = useState<Record<string, PendingPhoto>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  const setRow = (meterId: string, change: Partial<RowValues>) => setValues((v) => ({ ...v, [meterId]: { ...v[meterId], ...change } }));
  const isChanged = (r: ReadingSheetRow) => {
    const a = values[r.meter.id];
    const b = initial[r.meter.id];
    return a.previous.trim() !== b.previous.trim() || a.current.trim() !== b.current.trim() || a.note.trim() !== b.note.trim()
      || Boolean(photos[r.meter.id]);
  };
  const changed = rows.filter((r) => !r.reading?.billed && isChanged(r));
  const calcs = Object.fromEntries(rows.map((r) => [r.meter.id, calculateReading(values[r.meter.id].previous, values[r.meter.id].current, charge.unitRate)]));

  const totals = rows.reduce((acc, r) => {
    const c = calcs[r.meter.id];
    if (c.state !== 'ok') return acc;
    const used = parseQuantity(c.consumption);
    return {
      milli: acc.milli + (used.ok ? used.milli : 0n),
      amount: acc.amount + (c.amount ?? 0),
      count: acc.count + 1,
    };
  }, { milli: 0n, amount: 0, count: 0 });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: keys.readings });
    await queryClient.invalidateQueries({ queryKey: keys.meters });
    await queryClient.invalidateQueries({ queryKey: keys.runPreview });
  };

  const save = useMutation({
    mutationFn: (readings: { meterId: string; previous: string; current: string; note?: string; photoUploadId?: string }[]) =>
      api.put('/meter-readings', { period, readings }),
    onSuccess: async (_r, readings) => {
      toast.saved(`${readings.length} ${readings.length === 1 ? 'reading' : 'readings'} saved for ${formatPeriod(period)}.`);
      await refresh();
    },
    onError: (error, readings) => {
      const photoErrors = uploadRowErrors(error, 'readings', readings.map((r) => r.meterId),
        'This photo couldn’t be attached. Take it again, then save.');
      if (photoErrors) {
        setErrors(photoErrors);
        setGeneral('Nothing was saved. A photo couldn’t be attached — retake it on the marked rows.');
        setPhotos((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !(id in photoErrors))));
        return;
      }
      // 422 details name `readings.3.current`: row 3 of what was sent.
      const { byRow, general: message } = splitRowErrors(error, 'readings', readings.map((r) => r.meterId), (e) => billingErrorMessage(e));
      setErrors(byRow);
      setGeneral(message);
    },
  });

  const remove = useMutation({
    mutationFn: (readingId: string) => api.delete(`/meter-readings/${readingId}`),
    onSuccess: async () => {
      toast.saved('The reading was removed.');
      await refresh();
    },
    onError: (error) => toast.failed(billingErrorMessage(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    const readings: { meterId: string; previous: string; current: string; note?: string; photoUploadId?: string }[] = [];
    for (const r of changed) {
      const v = values[r.meter.id];
      const c = calcs[r.meter.id];
      if (c.state === 'invalid') { found[r.meter.id] = c.error; continue; }
      if (c.state === 'empty') {
        found[r.meter.id] = r.reading ? 'To clear a saved reading, use Remove.' : 'Enter the current reading.';
        continue;
      }
      const prev = parseQuantity(v.previous);
      const curr = parseQuantity(v.current);
      if (!prev.ok || !curr.ok) continue;
      readings.push({
        meterId: r.meter.id,
        previous: formatQuantity(prev.milli),
        current: formatQuantity(curr.milli),
        note: v.note.trim() || undefined,
        photoUploadId: photos[r.meter.id]?.upload.id,
      });
    }
    setErrors(found);
    setGeneral(null);
    if (Object.keys(found).length > 0 || readings.length === 0) return;
    save.mutate(readings);
  };

  const editable = canSave && !save.isPending;

  return (
    <form onSubmit={submit} noValidate>
      <div className="ad__tablewrap">
        <table className="ad__table bl__grid bl__readings">
          <thead>
            <tr>
              <th>Meter</th>
              <th className="num">Previous</th>
              <th className="num">Current</th>
              <th className="num">Used{unit ? ` (${unit})` : ''}</th>
              <th className="num">Amount</th>
              <th>Note</th>
              <th>Photo</th>
              <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = values[r.meter.id];
              const c = calcs[r.meter.id];
              const billed = Boolean(r.reading?.billed);
              const bad = errors[r.meter.id] ?? (c.state === 'invalid' ? c.error : undefined);
              const badField = c.state === 'invalid' ? c.field : 'current';
              return (
                <tr key={r.meter.id}>
                  <td>
                    <strong>{r.unit.number}</strong>
                    <span className="ad__sub num">{r.meter.serialNo}</span>
                    {r.reading ? (
                      <span className="ad__sub">
                        {billed ? 'Billed · ' : ''}{r.reading.readBy ? `${r.reading.readBy.name}, ` : ''}{formatDateTime(r.reading.readAt)}
                      </span>
                    ) : null}
                  </td>
                  <td className="num">
                    <div className={`fld bl__cell ${bad && badField === 'previous' ? 'is-bad' : ''}`}>
                      <input aria-label={`Previous reading, unit ${r.unit.number}`} value={v.previous} inputMode="decimal" autoComplete="off"
                        disabled={billed || !editable} onChange={(e) => setRow(r.meter.id, { previous: e.target.value })} />
                    </div>
                  </td>
                  <td className="num">
                    <div className={`fld bl__cell ${bad && badField === 'current' ? 'is-bad' : ''}`}>
                      <input aria-label={`Current reading, unit ${r.unit.number}`} value={v.current} inputMode="decimal" autoComplete="off"
                        placeholder="Not read" disabled={billed || !editable} onChange={(e) => setRow(r.meter.id, { current: e.target.value })}
                        aria-invalid={Boolean(bad)} />
                      {bad ? <span className="fld__err">{bad}</span> : null}
                    </div>
                  </td>
                  <td className="num">{c.state === 'ok' ? trimQuantity(c.consumption) : <span className="ad__muted">—</span>}</td>
                  <td className="num">{c.state === 'ok' && c.amount !== null ? formatKES(c.amount) : <span className="ad__muted">—</span>}</td>
                  <td>
                    <div className="fld bl__cell bl__note">
                      <input aria-label={`Note, unit ${r.unit.number}`} value={v.note} autoComplete="off" maxLength={200}
                        disabled={billed || !editable} onChange={(e) => setRow(r.meter.id, { note: e.target.value })} />
                    </div>
                  </td>
                  <td>
                    <MeterPhotoCell
                      unitNumber={r.unit.number}
                      readingId={r.reading?.id ?? null}
                      savedPhoto={Boolean(r.reading?.photo)}
                      pending={photos[r.meter.id] ?? null}
                      onPicked={(photo) => {
                        setPhotos((current) => ({ ...current, [r.meter.id]: photo }));
                        setErrors((current) => { const next = { ...current }; delete next[r.meter.id]; return next; });
                      }}
                      canTake={canSave && !billed}
                      disabled={!editable}
                    />
                  </td>
                  <td className="ad__rowactions">
                    <div>
                      {r.reading && !billed && canDelete ? (
                        <ConfirmDelete label="Remove" verb="Remove" what={`the ${formatPeriod(period)} reading for ${r.unit.number}`}
                          consequence="The meter will have no reading this month, so it won’t be billed. The next reading covers both months."
                          busy={remove.isPending && remove.variables === r.reading.id}
                          onConfirm={() => r.reading && remove.mutate(r.reading.id)} />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th>{totals.count} of {rows.length} read</th>
              <th /><th />
              <th className="num">{trimQuantity(formatQuantity(totals.milli))}</th>
              <th className="num">{formatKES(totals.amount)}</th>
              <th /><th /><th />
            </tr>
          </tfoot>
        </table>
      </div>
      {general ? <p className="ad__error pg-gap" role="alert">{general}</p> : null}
      {canSave ? (
        <div className="pg-actions pg-gap">
          <span className="ad__muted pg-grow">A meter left unread gets no line this month; its next reading covers both months.</span>
          <button type="button" className="nx-btn" disabled={changed.length === 0 || save.isPending}
            onClick={() => { setValues(initial); setPhotos({}); setErrors({}); setGeneral(null); }}>Discard</button>
          <button type="submit" className="nx-btn nx-btn--primary" disabled={changed.length === 0 || save.isPending}>
            {save.isPending ? 'Saving…' : changed.length > 0 ? `Save ${changed.length} ${changed.length === 1 ? 'reading' : 'readings'}` : 'Save all'}
          </button>
        </div>
      ) : <p className="ad__muted pg-gap">Your role can view readings but not enter them.</p>}
    </form>
  );
}

// ---------------------------------------------------------------- meters

function MetersTab({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canCreate = useCan('meters:create');
  const canUpdate = useCan('meters:update');
  const canDelete = useCan('meters:delete');
  const [editing, setEditing] = useState<Meter | 'new' | null>(null);

  const meters = useQuery({
    queryKey: [...keys.meters, { propertyId }],
    queryFn: () => api.get<DataEnvelope<Meter[]> | PageEnvelope<Meter>>('/meters', { propertyId }).then((r) => r.data),
  });

  const remove = useMutation({
    mutationFn: (meter: Meter) => api.delete(`/meters/${meter.id}`),
    onSuccess: async (_r, meter) => {
      toast.saved(`Meter ${meter.serialNo} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.meters });
      await queryClient.invalidateQueries({ queryKey: keys.chargeTypes });
    },
    onError: (error) => toast.failed(billingErrorMessage(error, {
      IN_USE: 'This meter has readings, so it can’t be deleted. Mark it inactive instead.',
    })),
  });

  const rows = meters.data ?? [];

  return (
    <section>
      <div className="pf__sectionhead bl__tabhead">
        <p className="ad__muted pg-grow">One meter per unit for each metered charge.</p>
        {canCreate ? <button type="button" className="nx-btn nx-btn--primary" onClick={() => setEditing('new')}>Add meter</button> : null}
      </div>
      {meters.isError ? <p className="ad__error" role="alert">{billingErrorMessage(meters.error)}</p>
        : meters.isPending ? <p className="ad__muted" role="status">Loading…</p>
          : rows.length === 0 ? (
            <div className="ad__tablewrap">
              <EmptyState title="No meters yet" detail="Add a meter for each unit on a metered charge so its readings can be billed."
                action={canCreate ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setEditing('new')}>Add meter</button> : undefined} />
            </div>
          ) : (
            <div className="ad__tablewrap">
              <table className="ad__table">
                <thead>
                  <tr>
                    <th>Serial no.</th>
                    <th>Unit</th>
                    <th>Charge</th>
                    <th className="num">Initial</th>
                    <th>Last reading</th>
                    <th>Status</th>
                    <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td><strong className="num">{m.serialNo}</strong></td>
                      <td>{m.unit.number}</td>
                      <td>{m.chargeType.name}</td>
                      <td className="num">{trimQuantity(m.initialReading)}</td>
                      <td>
                        {m.lastReading
                          ? <><span className="num">{trimQuantity(m.lastReading.current)}</span>{m.chargeType.unitLabel ? ` ${m.chargeType.unitLabel}` : ''}<span className="ad__sub">{formatPeriod(m.lastReading.period)}</span></>
                          : <span className="ad__muted">None yet</span>}
                      </td>
                      <td><Badge table={RECORD_STATUS} value={m.status} /></td>
                      <td className="ad__rowactions">
                        <div>
                          {canUpdate ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(m)}>Edit</button> : null}
                          {canDelete ? (
                            <ConfirmDelete what={`meter ${m.serialNo}`} busy={remove.isPending && remove.variables?.id === m.id}
                              consequence="A meter with readings can’t be deleted — mark it inactive instead."
                              onConfirm={() => remove.mutate(m)} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      {editing ? <MeterSheet propertyId={propertyId} meter={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

const METER_FIELDS = ['unitId', 'chargeTypeId', 'serialNo', 'initialReading', 'status'] as const;
type MeterField = (typeof METER_FIELDS)[number];

function MeterSheet({ propertyId, meter, onClose }: { propertyId: string; meter?: Meter; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const charges = useMeteredCharges(propertyId);
  const units = useQuery({
    queryKey: [...portfolioKeys.units, 'of-property', propertyId],
    queryFn: () => api.get<PageEnvelope<Unit>>('/units', { propertyId, pageSize: OPTIONS_PAGE_SIZE }),
    enabled: !meter,
    staleTime: 30_000,
  });
  const form = useForm<MeterField>({
    unitId: meter?.unit.id ?? '',
    chargeTypeId: meter?.chargeType.id ?? '',
    serialNo: meter?.serialNo ?? '',
    initialReading: meter ? trimQuantity(meter.initialReading) : '0',
    status: meter?.status ?? 'ACTIVE',
  });
  const { values, errors, set } = form;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (meter
      ? api.patch<DataEnvelope<Meter>>(`/meters/${meter.id}`, body)
      : api.post<DataEnvelope<Meter>>('/meters', body)),
    onSuccess: async () => {
      toast.saved(`Meter ${values.serialNo.trim()} was ${meter ? 'saved' : 'added'}.`);
      await queryClient.invalidateQueries({ queryKey: keys.meters });
      await queryClient.invalidateQueries({ queryKey: keys.readings });
      await queryClient.invalidateQueries({ queryKey: keys.chargeTypes });
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, {
        fields: METER_FIELDS,
        conflicts: { SERIAL_TAKEN: 'serialNo', METER_EXISTS: 'unitId' },
        describe: (e) => billingErrorMessage(e),
      });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<MeterField, string>> = {};
    if (!meter && !values.unitId) found.unitId = 'Choose the unit.';
    if (!meter && !values.chargeTypeId) found.chargeTypeId = 'Choose the metered charge.';
    if (!values.serialNo.trim()) found.serialNo = 'The number printed on the meter.';
    const initial = meter ? null : parseQuantity(values.initialReading || '0');
    if (initial && !initial.ok) found.initialReading = initial.error;
    form.setErrors(found);
    form.setGeneral(null);
    if (Object.keys(found).length > 0) return;

    if (meter) save.mutate({ serialNo: values.serialNo.trim(), status: values.status });
    else {
      save.mutate({
        unitId: values.unitId,
        chargeTypeId: values.chargeTypeId,
        serialNo: values.serialNo.trim(),
        initialReading: initial?.ok ? formatQuantity(initial.milli) : undefined,
      });
    }
  };

  const chargeRows = (charges.data ?? []).filter((c) => c.status === 'ACTIVE');

  return (
    <Sheet
      title={meter ? `Edit meter ${meter.serialNo}` : 'Add a meter'}
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="meter-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : meter ? 'Save meter' : 'Add meter'}
          </button>
        </>
      )}
    >
      <form id="meter-form" className="pf__dialogform" onSubmit={submit} noValidate>
        {meter ? (
          <p className="ad__muted">Unit {meter.unit.number} · {meter.chargeType.name}. The unit and charge can’t be changed; add a new meter instead.</p>
        ) : (
          <>
            <Field id="mt-unit" label="Unit" error={errors.unitId ?? (units.isError ? billingErrorMessage(units.error) : undefined)}>
              <select id="mt-unit" value={values.unitId} onChange={(e) => set('unitId', e.target.value)} aria-invalid={Boolean(errors.unitId)}>
                <option value="">{units.isPending ? 'Loading…' : 'Choose a unit…'}</option>
                {(units.data?.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.number}</option>)}
              </select>
            </Field>
            <Field id="mt-charge" label="Metered charge" error={errors.chargeTypeId}
              hint={charges.isSuccess && chargeRows.length === 0 ? 'Add a metered charge under Charges first.' : undefined}>
              <select id="mt-charge" value={values.chargeTypeId} onChange={(e) => set('chargeTypeId', e.target.value)} aria-invalid={Boolean(errors.chargeTypeId)}>
                <option value="">{charges.isPending ? 'Loading…' : 'Choose a charge…'}</option>
                {chargeRows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field id="mt-serial" label="Serial number" error={errors.serialNo}>
          <input id="mt-serial" value={values.serialNo} onChange={(e) => set('serialNo', e.target.value)} autoComplete="off"
            aria-invalid={Boolean(errors.serialNo)} />
        </Field>
        {meter ? (
          <Field id="mt-status" label="Status" error={errors.status} hint="Inactive meters are left off the readings sheet.">
            <select id="mt-status" value={values.status} onChange={(e) => set('status', e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </Field>
        ) : (
          <Field id="mt-initial" label="Initial reading" error={errors.initialReading} hint="What the meter shows today; the first month’s use is measured from here.">
            <input id="mt-initial" value={values.initialReading} onChange={(e) => set('initialReading', e.target.value)} inputMode="decimal"
              autoComplete="off" aria-invalid={Boolean(errors.initialReading)} />
          </Field>
        )}
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}
