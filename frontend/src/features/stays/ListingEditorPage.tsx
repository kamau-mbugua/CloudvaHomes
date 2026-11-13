import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { ConfirmDialog } from '../../components/ConfirmDelete';
import { usePropertyOptions } from '../portfolio/api';
import {
  COMMON_AMENITIES,
  fromApiRules,
  staysErrorMessage,
  staysKeys,
  toApiRules,
  validateStayRules,
} from './api';
import { formatKES } from '../../lib/money';
import { fromMinor, toMinorString } from './money';
import { LocationPicker } from './LocationPicker';
import type { StayLocation } from './location';
import { PhotoManager } from './PhotoManager';
import { RulesFields } from './RulesFields';
import { SpecialPricesSheet } from './SpecialPricesSheet';
import type { Listing, StayRules } from './types';

function ListingEditorForm({
  existing,
  defaultPropertyId,
}: {
  existing: Listing | null;
  defaultPropertyId: string;
}) {
  const isNew = !existing;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const canCreate = useCan('listings:create');
  const canUpdate = useCan('listings:update');
  const canDelete = useCan('listings:delete');
  const canEdit = isNew ? canCreate : canUpdate;

  const properties = usePropertyOptions(true);

  const [propertyId, setPropertyId] = useState(existing?.propertyId ?? defaultPropertyId);
  const [unitNumber, setUnitNumber] = useState(existing?.unit.number ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [area, setArea] = useState(existing?.area ?? '');
  const [location, setLocation] = useState<StayLocation | null>(() =>
    existing?.location
      ? {
          address: existing.location.address,
          lat: existing.location.lat,
          lng: existing.location.lng,
          placeId: existing.location.placeId,
        }
      : null,
  );
  const [description, setDescription] = useState(existing?.description ?? '');
  const [bedrooms, setBedrooms] = useState(existing?.bedrooms ?? 1);
  const [bathrooms, setBathrooms] = useState(existing?.bathrooms ?? 1);
  const [maxGuests, setMaxGuests] = useState(existing?.maxGuests ?? 2);
  const [minNights, setMinNights] = useState(existing?.minNights ?? 1);
  const [amenities, setAmenities] = useState<string[]>(existing?.amenities ?? []);
  const [nightlyKes, setNightlyKes] = useState(
    existing ? fromMinor(existing.nightlyPrice) : '',
  );
  const [weekendKes, setWeekendKes] = useState(
    existing?.weekendPrice ? fromMinor(existing.weekendPrice) : '',
  );
  const [cleaningKes, setCleaningKes] = useState(
    existing ? fromMinor(existing.cleaningFee) : '0',
  );
  const [weeklyDiscountPct, setWeeklyDiscountPct] = useState(
    existing?.weeklyDiscountBps ? Math.round(existing.weeklyDiscountBps / 100) : 0,
  );
  const [checkInInstructions, setCheckInInstructions] = useState(
    existing?.checkInInstructions ?? '',
  );
  const [useDefaultRules, setUseDefaultRules] = useState(
    existing ? existing.rulesOverride === null : true,
  );
  const [rulesOverride, setRulesOverride] = useState<StayRules>(() =>
    fromApiRules(existing?.rulesOverride),
  );
  const [published, setPublished] = useState(existing?.published ?? false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [specialPricesOpen, setSpecialPricesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleAmenity = (item: string) => {
    setAmenities((cur) => (cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item]));
  };

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (isNew) {
        return api.post<DataEnvelope<Listing>>('/host/listings', body);
      }
      return api.patch<DataEnvelope<Listing>>(`/host/listings/${existing.id}`, body);
    },
    onSuccess: async (res) => {
      toast.saved(isNew ? 'Listing created.' : 'Listing saved.');
      await queryClient.invalidateQueries({ queryKey: staysKeys.listings });
      await queryClient.invalidateQueries({ queryKey: staysKeys.listing(res.data.id) });
      if (isNew) {
        navigate(`/app/listings/${res.data.id}`, { replace: true });
      }
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/host/listings/${existing?.id}`),
    onSuccess: async () => {
      toast.saved('Listing deleted.');
      await queryClient.invalidateQueries({ queryKey: staysKeys.listings });
      navigate('/app/listings', { replace: true });
    },
    onError: (err) => toast.failed(staysErrorMessage(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (isNew && !propertyId) {
      setLocalError('Choose a property.');
      return;
    }
    const nightlyMinor = toMinorString(nightlyKes);
    if (!nightlyMinor || BigInt(nightlyMinor) <= 0n) {
      setLocalError('Enter a whole-shilling nightly price.');
      return;
    }
    let weekendMinor: string | null = null;
    if (weekendKes.trim() !== '') {
      weekendMinor = toMinorString(weekendKes);
      if (!weekendMinor || BigInt(weekendMinor) <= 0n) {
        setLocalError('Weekend price must be in whole shillings.');
        return;
      }
    }
    const cleaningMinor = cleaningKes.trim() === '' ? '0' : toMinorString(cleaningKes);
    if (!cleaningMinor) {
      setLocalError('Cleaning fee must be in whole shillings.');
      return;
    }

    if (!useDefaultRules) {
      const ruleErr = validateStayRules(rulesOverride);
      if (ruleErr) {
        setLocalError(ruleErr);
        return;
      }
    }

    if (location && location.address.trim().length < 3) {
      setLocalError('Add the address guests see for the location, or remove the location.');
      return;
    }

    const payload: Record<string, unknown> = {
      ...(isNew ? { propertyId } : {}),
      unitNumber: unitNumber.trim(),
      title: title.trim(),
      area: area.trim() || null,
      location: location ? { ...location, address: location.address.trim() } : null,
      description: description.trim() || null,
      bedrooms,
      bathrooms,
      maxGuests,
      minNights,
      amenities,
      nightlyPrice: nightlyMinor,
      weekendPrice: weekendMinor,
      cleaningFee: cleaningMinor,
      weeklyDiscountBps: weeklyDiscountPct > 0 ? weeklyDiscountPct * 100 : null,
      checkInInstructions: checkInInstructions.trim() || null,
      rulesOverride: useDefaultRules ? null : toApiRules(rulesOverride),
      published,
    };
    save.mutate(payload);
  };

  const errMsg = localError ?? (save.isError ? staysErrorMessage(save.error) : null);

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <form onSubmit={submit} style={{ display: 'grid', gap: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="listing-property">Property</label>
            </div>
            <select
              id="listing-property"
              className="au__input"
              value={propertyId}
              disabled={!isNew || !canEdit}
              onChange={(e) => setPropertyId(e.target.value)}
              required
            >
              <option value="">Choose a property…</option>
              {(properties.data?.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="listing-unit">Unit number or code</label>
            </div>
            <input
              id="listing-unit"
              className="au__input"
              type="text"
              placeholder="e.g. A1 or Cottage 2"
              value={unitNumber}
              disabled={!canEdit}
              onChange={(e) => setUnitNumber(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="au__field">
          <div className="au__labelrow">
            <label htmlFor="listing-title">Listing title</label>
          </div>
          <input
            id="listing-title"
            className="au__input"
            type="text"
            placeholder="e.g. Sunny 1BR in Kilimani"
            value={title}
            disabled={!canEdit}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="au__field">
          <div className="au__labelrow">
            <label htmlFor="listing-area">Neighbourhood / area (shown to guests)</label>
          </div>
          <input
            id="listing-area"
            className="au__input"
            type="text"
            placeholder="e.g. Kilimani, Nairobi"
            value={area}
            disabled={!canEdit}
            onChange={(e) => setArea(e.target.value)}
          />
        </div>

        <LocationPicker value={location} onChange={setLocation} disabled={!canEdit} />

        <div className="au__field">
          <div className="au__labelrow">
            <label htmlFor="listing-desc">Description</label>
          </div>
          <textarea
            id="listing-desc"
            className="au__input"
            rows={3}
            placeholder="Tell guests what makes this unit special…"
            value={description}
            disabled={!canEdit}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="listing-bedrooms">Bedrooms</label>
            </div>
            <input
              id="listing-bedrooms"
              className="au__input"
              type="number"
              min={0}
              max={30}
              value={bedrooms}
              disabled={!canEdit}
              onChange={(e) => setBedrooms(Number(e.target.value))}
            />
          </div>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="listing-bathrooms">Bathrooms</label>
            </div>
            <input
              id="listing-bathrooms"
              className="au__input"
              type="number"
              min={1}
              max={30}
              value={bathrooms}
              disabled={!canEdit}
              onChange={(e) => setBathrooms(Number(e.target.value))}
            />
          </div>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="listing-guests">Max guests</label>
            </div>
            <input
              id="listing-guests"
              className="au__input"
              type="number"
              min={1}
              max={50}
              value={maxGuests}
              disabled={!canEdit}
              onChange={(e) => setMaxGuests(Number(e.target.value))}
            />
          </div>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="listing-minnights">Min nights</label>
            </div>
            <input
              id="listing-minnights"
              className="au__input"
              type="number"
              min={1}
              max={365}
              value={minNights}
              disabled={!canEdit}
              onChange={(e) => setMinNights(Number(e.target.value))}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="listing-nightly">Nightly price (KES)</label>
            </div>
            <input
              id="listing-nightly"
              className="au__input"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 4500"
              value={nightlyKes}
              disabled={!canEdit}
              onChange={(e) => setNightlyKes(e.target.value)}
              required
            />
          </div>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="listing-weekend">Weekend Fri/Sat (KES)</label>
            </div>
            <input
              id="listing-weekend"
              className="au__input"
              type="text"
              inputMode="numeric"
              placeholder="Optional"
              value={weekendKes}
              disabled={!canEdit}
              onChange={(e) => setWeekendKes(e.target.value)}
            />
          </div>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="listing-cleaning">Cleaning fee (KES)</label>
            </div>
            <input
              id="listing-cleaning"
              className="au__input"
              type="text"
              inputMode="numeric"
              value={cleaningKes}
              disabled={!canEdit}
              onChange={(e) => setCleaningKes(e.target.value)}
            />
          </div>
          <div className="au__field">
            <div className="au__labelrow">
              <label htmlFor="listing-discount">7+ night discount (%)</label>
            </div>
            <input
              id="listing-discount"
              className="au__input"
              type="number"
              min={0}
              max={90}
              value={weeklyDiscountPct}
              disabled={!canEdit}
              onChange={(e) => setWeeklyDiscountPct(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="au__field">
          <div className="au__labelrow">
            <label>Amenities</label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {COMMON_AMENITIES.map((item) => {
              const active = amenities.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleAmenity(item)}
                  className="nx-btn nx-btn--sm"
                  style={{
                    background: active ? 'var(--primary)' : 'var(--card)',
                    color: active ? 'var(--primary-foreground)' : 'var(--text-secondary)',
                    borderColor: active ? 'var(--primary)' : 'var(--border)',
                  }}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        <div className="au__field">
          <div className="au__labelrow">
            <label htmlFor="listing-checkin-info">
              Check-in instructions (shared only with confirmed guests)
            </label>
          </div>
          <textarea
            id="listing-checkin-info"
            className="au__input"
            rows={2}
            placeholder="Gate code, keybox code, Wi-Fi password, caretaker contact…"
            value={checkInInstructions}
            disabled={!canEdit}
            onChange={(e) => setCheckInInstructions(e.target.value)}
          />
        </div>

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            padding: '1rem',
            display: 'grid',
            gap: '0.75rem',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={useDefaultRules}
              disabled={!canEdit}
              onChange={(e) => setUseDefaultRules(e.target.checked)}
            />
            Use my default booking & cancellation rules
          </label>
          {!useDefaultRules ? (
            <RulesFields value={rulesOverride} onChange={setRulesOverride} disabled={!canEdit} />
          ) : null}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={published}
            disabled={!canEdit}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Published on my booking site
        </label>

        {errMsg ? (
          <p className="au__error" role="alert">
            {errMsg}
          </p>
        ) : null}

        {canEdit ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {!isNew && canDelete ? (
              <button
                type="button"
                className="nx-btn nx-btn--danger"
                onClick={() => setConfirmDelete(true)}
              >
                Delete listing
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className="nx-btn nx-btn--primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : isNew ? 'Create listing' : 'Save changes'}
            </button>
          </div>
        ) : null}
      </form>

      {existing ? (
        <>
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 0 }} />
          <PhotoManager listing={existing} canEdit={canEdit} />

          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 0 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
                Special date prices ({existing.specialPrices.length})
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {existing.specialPrices.length === 0
                  ? 'No holiday or seasonal price overrides configured.'
                  : existing.specialPrices
                      .map(
                        (sp) =>
                          `${sp.fromDate} → ${sp.toDate}: ${formatKES(Number(sp.nightlyPrice))}${sp.label ? ` (${sp.label})` : ''}`,
                      )
                      .join(' · ')}
              </p>
            </div>
            {canEdit ? (
              <button
                type="button"
                className="nx-btn nx-btn--sm"
                onClick={() => setSpecialPricesOpen(true)}
              >
                Manage special prices
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {existing && specialPricesOpen ? (
        <SpecialPricesSheet listing={existing} onClose={() => setSpecialPricesOpen(false)} />
      ) : null}

      {existing && confirmDelete ? (
        <ConfirmDialog
          what={`"${existing.title}"`}
          busy={remove.isPending}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => remove.mutate()}
        />
      ) : null}
    </div>
  );
}

export function ListingEditorPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const isNew = !listingId || listingId === 'new';

  const properties = usePropertyOptions(true);
  const detail = useQuery({
    queryKey: staysKeys.listing(listingId ?? 'new'),
    queryFn: () => api.get<DataEnvelope<Listing>>(`/host/listings/${listingId}`),
    enabled: !isNew,
  });

  if (!isNew && detail.isPending) {
    return <p style={{ padding: '1rem', color: 'var(--text-muted)' }}>Loading listing…</p>;
  }

  const existing = detail.data?.data ?? null;
  const defaultPropertyId = properties.data?.data?.[0]?.id ?? '';

  return (
    <ListingEditorForm
      key={existing ? `${existing.id}:${existing.updatedAt}` : `new:${defaultPropertyId}`}
      existing={existing}
      defaultPropertyId={defaultPropertyId}
    />
  );
}
