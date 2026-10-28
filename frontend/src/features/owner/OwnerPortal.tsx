import { useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { PortalShell } from '../../app/PortalShell';
import { pickOwnerProfile } from '../../lib/auth/owner';
import type { OwnerOf } from '../../lib/auth/types';
import { useSession } from '../../lib/auth/useAuth';
import { currentPeriod } from '../../lib/periods';
import { EmptyState } from '../../components/EmptyState';
import { checkMonthRange } from '../reports/rules';
import {
  downloadOwnerStatement, ownerErrorMessage, useOwnerLandlord, useOwnerRemittances, useOwnerStatement,
} from '../agency/api';
import { PAYOUT_METHOD } from '../agency/labels';
import { ArrearsSummary, BalanceTiles, MonthRangeBar, OccupancySummary, PayoutCards, StatementView } from '../agency/ui';

/**
 * The owner portal (`/owner`): a landlord of an agency sees their own figures, read only.
 * The shared portal shell (`PortalShell`) — no staff sidebar — built for a phone:
 * organisation and landlord in the header, a landlord switcher when they own several
 * profiles, three tabs (Overview, Statements, Payouts) and sign out. Only `/api/v1/owner/*` is called.
 *
 * The chosen landlord is `?landlord=` in the address, so tabs and reloads keep it.
 */

interface OwnerContext { owner: OwnerOf }

const TABS = [
  { to: '/owner', label: 'Overview', end: true },
  { to: '/owner/statements', label: 'Statements', end: false },
  { to: '/owner/payouts', label: 'Payouts', end: false },
];

export function OwnerShell() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const owner = pickOwnerProfile(session.ownerOf, params.get('landlord'));

  if (!owner) return null;
  const search = session.ownerOf.length > 1 ? `?landlord=${encodeURIComponent(owner.landlordId)}` : '';
  const severalAgencies = new Set(session.ownerOf.map((o) => o.organization.id)).size > 1;

  return (
    <PortalShell
      portal="owner"
      label="Owner portal"
      orgName={owner.organization.name}
      accountName={owner.name}
      accounts={session.ownerOf.map((o) => ({ id: o.landlordId, label: severalAgencies ? `${o.name} · ${o.organization.name}` : o.name }))}
      currentId={owner.landlordId}
      switchLabel="Landlord"
      onSwitch={(id) => setParams((p) => { const next = new URLSearchParams(p); next.set('landlord', id); return next; })}
      tabs={TABS}
      search={search}
      footer={`Read only. Questions about these figures? Contact ${owner.organization.name}.`}
      context={{ owner } satisfies OwnerContext}
    />
  );
}

function useOwner(): OwnerOf {
  return useOutletContext<OwnerContext>().owner;
}

export function OwnerOverviewPage() {
  const owner = useOwner();
  const detail = useOwnerLandlord(owner.landlordId);

  if (detail.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (detail.isError) return <div className="ph"><EmptyState title="Not available" detail={ownerErrorMessage(detail.error)} /></div>;
  const d = detail.data;
  const org = d.organization;

  return (
    <div className="ow__stack">
      <h1 className="ow__h1">Hello, {d.landlord?.name ?? owner.name}</h1>
      <BalanceTiles audience="owner" payable={d.balances.payable} depositHeld={d.balances.depositHeld} />

      <section className="ag__card">
        <h3>Where payouts go</h3>
        {d.payout ? (
          <p className="ag__masked"><span>{PAYOUT_METHOD[d.payout.method] ?? String(d.payout.method)}</span><strong className="num">{d.payout.masked}</strong></p>
        ) : <p className="ad__muted">No payout details on file yet. Give them to {org.name}.</p>}
        <p className="hint">If these aren’t yours, contact {org.name} at once. You’re told whenever they change.</p>
      </section>

      {d.occupancy && d.occupancy.rows.length > 0 ? <OccupancySummary report={d.occupancy} title="Your properties" /> : null}
      {d.arrears ? <ArrearsSummary arrears={d.arrears} /> : null}

      <section className="ag__card">
        <h3>Your agency</h3>
        <p className="ow__contact">
          <strong>{org.name}</strong>
          {org.phone ? <a className="num" href={`tel:${org.phone}`}>{org.phone}</a> : null}
          {org.email ? <a href={`mailto:${org.email}`}>{org.email}</a> : null}
        </p>
      </section>
    </div>
  );
}

export function OwnerStatementsPage() {
  const owner = useOwner();
  const thisMonth = currentPeriod();
  const [range, setRange] = useState({ from: thisMonth, to: thisMonth });
  const rangeError = checkMonthRange(range.from, range.to, thisMonth);
  const statement = useOwnerStatement(owner.landlordId, range, !rangeError);

  return (
    <div className="ow__stack">
      <h1 className="ow__h1">Statements</h1>
      <MonthRangeBar from={range.from} to={range.to} max={thisMonth} onChange={setRange} disabled={Boolean(rangeError)}
        onDownload={() => downloadOwnerStatement({ id: owner.landlordId, code: statement.data?.landlord?.code }, range)} />
      {rangeError ? <p className="ad__error" role="alert">{rangeError}</p>
        : statement.isError && !statement.data ? <p className="ad__error" role="alert">{ownerErrorMessage(statement.error)}</p>
          : statement.isPending || !statement.data ? <p className="ad__muted" role="status">Loading…</p>
            : <StatementView statement={statement.data} audience="owner" />}
    </div>
  );
}

export function OwnerPayoutsPage() {
  const owner = useOwner();
  const list = useOwnerRemittances(owner.landlordId);
  const rows = list.data?.data ?? [];

  return (
    <div className="ow__stack">
      <h1 className="ow__h1">Payouts</h1>
      {list.isError ? <p className="ad__error" role="alert">{ownerErrorMessage(list.error)}</p>
        : list.isPending ? <p className="ad__muted" role="status">Loading…</p>
          : rows.length === 0 ? <div className="ph"><EmptyState title="No payouts yet" detail="Each month the agency prepares a payout of what it collected for you, less commission and expenses. They’ll show here." /></div>
            : <PayoutCards rows={rows} />}
    </div>
  );
}
