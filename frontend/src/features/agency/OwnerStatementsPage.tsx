import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { currentPeriod, isPeriod } from '../../lib/periods';
import { useLandlordOptions } from '../portfolio/api';
import { useListFilters } from '../portfolio/hooks';
import { checkMonthRange } from '../reports/rules';
import { agencyErrorMessage, downloadLandlordStatement, useLandlordStatement } from './api';
import { MonthRangeBar, StatementView } from './ui';

/**
 * Owner statements (`/app/owner-statements`): pick a landlord and a month range, see the
 * statement, download it as a PDF. Choices live in the address, so a statement can be
 * linked and reloaded.
 */
export function OwnerStatementsPage() {
  const filters = useListFilters();
  const thisMonth = currentPeriod();
  const landlordId = filters.get('landlordId');
  const from = isPeriod(filters.get('from')) ? filters.get('from') : thisMonth;
  const to = isPeriod(filters.get('to')) ? filters.get('to') : thisMonth;
  const rangeError = checkMonthRange(from, to, thisMonth);
  const landlords = useLandlordOptions();
  const landlord = (landlords.data?.data ?? []).find((l) => l.id === landlordId);
  const statement = useLandlordStatement(landlordId, { from, to }, !rangeError);

  return (
    <div className="pg">
      <MonthRangeBar from={from} to={to} max={thisMonth} disabled={!landlordId || Boolean(rangeError)}
        onChange={(r) => filters.setFilter({ from: r.from, to: r.to })}
        onDownload={() => downloadLandlordStatement({ id: landlordId, code: landlord?.code }, { from, to })}>
        <select className="ad__select" aria-label="Landlord" value={landlordId} onChange={(e) => filters.setFilter({ landlordId: e.target.value })}>
          <option value="">{landlords.isPending ? 'Loading…' : 'Choose a landlord…'}</option>
          {(landlords.data?.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
        </select>
      </MonthRangeBar>

      {!landlordId ? (
        <div className="ad__tablewrap">
          <EmptyState title="Choose a landlord" detail="Their statement shows what was collected on their properties, the commission and expenses taken off, and what was paid out." />
        </div>
      ) : rangeError ? <p className="ad__error" role="alert">{rangeError}</p>
        : statement.isError && !statement.data ? <p className="ad__error" role="alert">{agencyErrorMessage(statement.error)}</p>
          : statement.isPending || !statement.data ? <TableSkeleton />
            : <StatementView statement={statement.data} />}
    </div>
  );
}
