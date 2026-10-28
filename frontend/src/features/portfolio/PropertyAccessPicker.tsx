import { portfolioErrorMessage, usePropertyOptions } from './api';
import { CheckList } from './ui';

/**
 * "Limit to properties" for a member (Settings → Users). An empty list means every
 * property — so the choice is shown as two options rather than as an empty checklist,
 * which would read as "none". Choosing "Only some" with nothing ticked is caught by
 * `propertyAccessValue` before saving.
 */
export function PropertyAccessPicker({
  limited,
  onLimitedChange,
  value,
  onChange,
  error,
  disabled = false,
}: {
  limited: boolean;
  onLimitedChange: (limited: boolean) => void;
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
  disabled?: boolean;
}) {
  const properties = usePropertyOptions();
  const rows = properties.data?.data ?? [];
  // Ids already on the membership that this list does not include (beyond the first 100)
  // stay selected and are counted, so saving does not silently drop them.
  const unknown = value.filter((id) => !rows.some((p) => p.id === id));

  return (
    <div className={`fld fm__wide ${error ? 'is-bad' : ''}`}>
      <span className="fld__label">Properties</span>
      <div className="pf__radios" role="radiogroup" aria-label="Properties">
        <label className="fld__check">
          <input type="radio" name="prop-access" checked={!limited} disabled={disabled} onChange={() => onLimitedChange(false)} />
          All properties
        </label>
        <label className="fld__check">
          <input type="radio" name="prop-access" checked={limited} disabled={disabled} onChange={() => onLimitedChange(true)} />
          Only some
        </label>
      </div>
      {limited ? (
        properties.isPending ? <span className="hint">Loading properties…</span>
          : properties.isError ? <span className="fld__err">{portfolioErrorMessage(properties.error)}</span>
            : rows.length === 0 ? <span className="hint">There are no properties yet.</span>
              : (
                <CheckList
                  name="Properties"
                  options={rows.map((p) => ({ id: p.id, label: `${p.name} (${p.code})` }))}
                  value={value}
                  onChange={onChange}
                  disabled={disabled}
                />
              )
      ) : null}
      {error ? <span className="fld__err">{error}</span>
        : limited ? (
          <span className="hint">
            They see only these properties, their units, tenancies and tenants.
            {unknown.length > 0 ? ` Plus ${unknown.length} not listed here.` : ''}
          </span>
        ) : <span className="hint">They see every property, including ones added later.</span>}
    </div>
  );
}

