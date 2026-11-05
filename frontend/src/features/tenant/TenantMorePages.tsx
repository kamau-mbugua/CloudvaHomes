import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDay } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { CardSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { PasswordSection, ProfileSection } from '../account/AccountPage';
import { downloadTenantLeasePdf, downloadTenantSignedLease, tenantErrorMessage, useTenantNotices } from './api';
import { homeText, noticeLink } from './rules';
import { useTenantContext } from './tenantContext';
import { TenantInspections } from './TenantInspections';
import type { ConsolidatedTenancy } from './types';

/**
 * Documents, Notices and My profile (tenant portal redesign). Documents and Notices follow
 * the home switcher; My profile is about the person.
 */

export function TenantDocumentsPage() {
  const { overview, scope } = useTenantContext();
  const homes = overview.tenancies.filter((t) =>
    (t.status === 'ACTIVE' || t.status === 'NOTICE') && (scope.kind === 'all' || t.id === scope.tenancyId));
  return (
    <div className="ow__stack">
      <h1 className="ow__h1">Documents</h1>
      {homes.length === 0 ? <div className="ph"><EmptyState title="No current home" detail="Documents for the homes you rent show here." /></div> : null}
      {homes.map((t) => <HomeDocuments key={t.id} home={t} />)}
    </div>
  );
}

function HomeDocuments({ home }: { home: ConsolidatedTenancy }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (what: string, job: () => Promise<void>) => {
    setBusy(what);
    try {
      await job();
    } catch (e) {
      toast.failed(tenantErrorMessage(e, home.orgName));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="ag__card" aria-label={homeText(home)}>
      <div className="tp__cardhead"><h3>{homeText(home)}</h3><span className="ad__sub">{home.orgName}</span></div>
      <dl className="tp__facts">
        <div><dt>Since</dt><dd>{formatDay(home.startDate)}</dd></div>
        {home.leaseEndDate ? <div><dt>Lease ends</dt><dd>{formatDay(home.leaseEndDate)}</dd></div> : null}
      </dl>
      <div className="pf__actions">
        <button type="button" className="nx-btn nx-btn--sm" disabled={busy !== null} onClick={() => void run('lease', () => downloadTenantLeasePdf(home.tenantId, home))}>
          {busy === 'lease' ? 'Preparing…' : 'Lease agreement PDF'}
        </button>
        {home.hasSignedLease ? (
          <button type="button" className="nx-btn nx-btn--sm" disabled={busy !== null} onClick={() => void run('signed', () => downloadTenantSignedLease(home.tenantId, home))}>
            {busy === 'signed' ? 'Preparing…' : 'Signed lease copy'}
          </button>
        ) : null}
      </div>
      <TenantInspections tenantId={home.tenantId} tenancyId={home.id} />
    </section>
  );
}

export function TenantNoticesPage() {
  const { scope } = useTenantContext();
  const [page, setPage] = useState(1);
  const list = useTenantNotices(page, scope.kind === 'home' ? scope.tenantId : undefined);
  const rows = list.data?.rows ?? [];
  return (
    <div className="ow__stack">
      <h1 className="ow__h1">Notices</h1>
      {list.isError ? <p className="ad__error" role="alert">{tenantErrorMessage(list.error)}</p>
        : list.isPending ? <CardSkeleton count={2} />
          : rows.length === 0 ? <div className="ph"><EmptyState title="No notices yet" detail="Messages from your landlord or agency show here." /></div>
            : (
              <ul className="tp__rows tp__rows--card">
                {rows.map((n) => {
                  const to = noticeLink(n.actionUrl);
                  const body = (
                    <span className="tp__rowmain">
                      <strong>{n.title}{n.readAt ? null : <span className="ad__badge ad__badge--warn tpn__new">New</span>}</strong>
                      <span className="ad__sub">{[n.orgName, formatDay(n.createdAt.slice(0, 10))].filter(Boolean).join(' · ')}</span>
                      <span className="ad__sub tpn__body">{n.body}</span>
                    </span>
                  );
                  return <li key={n.id}>{to ? <Link className="tp__row" to={to}>{body}</Link> : <div className="tp__row tp__row--static">{body}</div>}</li>;
                })}
              </ul>
            )}
      <Pager meta={list.data?.meta} onPage={setPage} />
    </div>
  );
}

export function TenantProfilePage() {
  const { accounts } = useTenantContext();
  return (
    <div className="ow__stack">
      <h1 className="ow__h1">My profile</h1>
      <section className="ag__card"><ProfileSection /></section>
      <p className="ad__muted">
        To change your phone number or email, ask {accounts.length === 1 ? accounts[0]!.organization.name : 'your landlord or agency'} —
        they use them to reach you and you sign in with them.
      </p>
      <section className="ag__card"><PasswordSection /></section>
      <section className="ag__card">
        <h3>You rent from</h3>
        <ul className="tp__rows">
          {accounts.map((a) => (
            <li key={a.tenantId} className="tp__row tp__row--static">
              <span className="tp__rowmain"><strong>{a.organization.name}</strong><span className="ad__sub">Account {a.name}</span></span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
