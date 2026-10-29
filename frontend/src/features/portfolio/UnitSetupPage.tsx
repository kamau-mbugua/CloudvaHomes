import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { Sheet } from '../../components/Sheet';
import { keys, portfolioErrorMessage, useCatalogue } from './api';
import type { CatalogueKind } from './api';
import { splitFormError } from './formErrors';
import { PortfolioCsvImportSheet } from './PortfolioCsvImportSheet';
import type { CatalogueItem } from './types';
import { nullable, optional } from './forms';
import { useForm } from './hooks';
import { Field } from './ui';

/**
 * Unit setup: the organisation's unit categories, types and features, one tab each.
 * They are organisation-wide (not per property) and short, so each tab is a plain list.
 *
 * A name is unique within its list (`409 NAME_TAKEN`); something units still use can't
 * be deleted (`409 IN_USE`).
 */

const TABS: { id: string; kind: CatalogueKind; label: string; singular: string; example: string; explain: string }[] = [
  {
    id: 'categories', kind: 'unit-categories', label: 'Categories', singular: 'category', example: 'e.g. Executive',
    explain: 'The grade or class of a unit, e.g. Standard, Executive, Commercial.',
  },
  {
    id: 'types', kind: 'unit-types', label: 'Types', singular: 'type', example: 'e.g. 2 Bedroom',
    explain: 'The layout of a unit, e.g. Bedsitter, 1 Bedroom, Shop.',
  },
  {
    id: 'features', kind: 'unit-features', label: 'Features', singular: 'feature', example: 'e.g. Balcony',
    explain: 'Things a unit has, e.g. Balcony, Parking, Borehole water. A unit can have several.',
  },
];

export function UnitSetupPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0];
  const canCreate = useCan('unit-categories:create');
  const [importingCsv, setImportingCsv] = useState(false);

  return (
    <div className="pg">
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Unit setup">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === tab.id} className="pf__tab"
              onClick={() => setParams(t.id === TABS[0].id ? {} : { tab: t.id }, { replace: true })}>
              {t.label}
            </button>
          ))}
        </div>
        {canCreate ? (
          <button type="button" className="nx-btn nx-btn--sm" onClick={() => setImportingCsv(true)}>Import CSV</button>
        ) : null}
      </div>
      {/* Keyed so switching tabs starts each list fresh (its sheet closed). */}
      <CatalogueList key={tab.id} {...tab} />
      {importingCsv ? (
        <PortfolioCsvImportSheet onClose={() => setImportingCsv(false)} />
      ) : null}
    </div>
  );
}

function CatalogueList({ kind, label, singular, example, explain }: (typeof TABS)[number]) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canCreate = useCan('unit-categories:create');
  const canUpdate = useCan('unit-categories:update');
  const canDelete = useCan('unit-categories:delete');
  const list = useCatalogue(kind);
  const [editing, setEditing] = useState<CatalogueItem | 'new' | null>(null);

  const remove = useMutation({
    mutationFn: (item: CatalogueItem) => api.delete(`/${kind}/${item.id}`),
    onSuccess: async (_r, item) => {
      toast.saved(`The “${item.name}” ${singular} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.catalogue(kind) });
    },
    onError: (error) => toast.failed(portfolioErrorMessage(error)),
  });

  const rows = list.data ?? [];

  return (
    <>
      <div className="ad__filters">
        <p className="ad__muted pg-grow">{explain}</p>
        {canCreate ? (
          <button type="button" className="nx-btn nx-btn--primary pg-push" onClick={() => setEditing('new')}>Add {singular}</button>
        ) : null}
      </div>

      {list.isError ? <p className="ad__error" role="alert">{portfolioErrorMessage(list.error)}</p> : null}

      {list.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          <EmptyState title={`No ${label.toLowerCase()} yet`} detail={`Add the ${label.toLowerCase()} you use (${example.replace('e.g. ', '')}, …).`}
            action={canCreate ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setEditing('new')}>Add {singular}</button> : undefined} />
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table ad__table--compact">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th className="num">Units</th>
                <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.description ?? <span className="ad__muted">—</span>}</td>
                  <td className="num">{item.unitCount}</td>
                  <td className="ad__rowactions">
                    <div>
                      {canUpdate ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(item)}>Edit</button> : null}
                      {canDelete ? (
                        <ConfirmDelete
                          what={`the “${item.name}” ${singular}`}
                          consequence={item.unitCount > 0
                            ? `${item.unitCount} ${item.unitCount === 1 ? 'unit uses' : 'units use'} it, so it can’t be deleted until they are changed.`
                            : undefined}
                          busy={remove.isPending && remove.variables?.id === item.id}
                          onConfirm={() => remove.mutate(item)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <CatalogueSheet kind={kind} singular={singular} example={example}
          item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}

function CatalogueSheet({ kind, singular, example, item, onClose }: {
  kind: CatalogueKind;
  singular: string;
  example: string;
  item?: CatalogueItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<'name' | 'description'>({ name: item?.name ?? '', description: item?.description ?? '' });
  const { values, errors, set } = form;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (item ? api.patch(`/${kind}/${item.id}`, body) : api.post(`/${kind}`, body)),
    onSuccess: async () => {
      toast.saved(`The “${values.name.trim()}” ${singular} was ${item ? 'saved' : 'added'}.`);
      await queryClient.invalidateQueries({ queryKey: keys.catalogue(kind) });
      // Unit rows show these names.
      if (item) await queryClient.invalidateQueries({ queryKey: keys.units });
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, {
        fields: ['name', 'description'],
        conflicts: { NAME_TAKEN: 'name' },
        describe: portfolioErrorMessage,
      });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!values.name.trim()) {
      form.setErrors({ name: 'Give it a name.' });
      return;
    }
    form.setErrors({});
    form.setGeneral(null);
    save.mutate(item
      ? { name: values.name.trim(), description: nullable(values.description) }
      : { name: values.name.trim(), description: optional(values.description) });
  };

  return (
    <Sheet
      title={item ? `Edit ${singular}` : `Add ${singular}`}
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="catalogue-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : item ? 'Save' : `Add ${singular}`}
          </button>
        </>
      )}
    >
      <form id="catalogue-form" className="pf__dialogform" onSubmit={submit} noValidate>
        <Field id="cat-name" label="Name" error={errors.name}>
          <input id="cat-name" value={values.name} onChange={(e) => set('name', e.target.value)} placeholder={example}
            autoComplete="off" aria-invalid={Boolean(errors.name)} />
        </Field>
        <Field id="cat-desc" label="Description" error={errors.description} optional>
          <input id="cat-desc" value={values.description} onChange={(e) => set('description', e.target.value)} autoComplete="off" />
        </Field>
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}
