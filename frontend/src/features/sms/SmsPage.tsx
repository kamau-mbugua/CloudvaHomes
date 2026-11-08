import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan, useSession } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { CardSkeleton, TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { Fact } from '../portfolio/ui';
import { SMS_PAGE_SIZE, smsErrorMessage, smsKeys, useSmsAccount } from './api';
import { BuySmsSheet } from './BuySmsSheet';
import { bannerFor, smsModeLabel, usageStatusLabel } from './rules';
import type { SmsAccountView, SmsTopUpRow, SmsUsageRow, SmsUsageStatus } from './types';

type SmsTab = 'usage' | 'top-ups';

/**
 * Settings → SMS (`/app/settings/sms`): how the organisation's messages to tenants and guests
 * are sent, its KodiHub SMS units (balance, bought, used, Buy SMS), its low-balance level and,
 * on its own SMS account, the KodiHub fallback switch; plus usage and top-up lists.
 * Login and security codes are always sent by KodiHub and never use units.
 */
export function SmsPage() {
  const account = useSmsAccount();
  if (account.isPending) return <CardSkeleton count={2} />;
  if (account.isError) return <div className="pg"><p className="ad__error" role="alert">{smsErrorMessage(account.error)}</p></div>;
  return <Sms account={account.data} />;
}

function Sms({ account }: { account: SmsAccountView }) {
  const session = useSession();
  const canManage = useCan('sms:manage');
  const [params, setParams] = useSearchParams();
  const tab: SmsTab = params.get('tab') === 'top-ups' ? 'top-ups' : 'usage';
  const buying = params.get('buy') === '1';
  const banner = bannerFor(account);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (value === null) p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: true },
    );

  return (
    <div className="pg hb">
      <div className="hb__top">
        <section className={`ag__card hb__owed ${banner?.tone === 'danger' ? 'hb__owed--alert' : banner ? 'hb__owed--warn' : ''}`} aria-labelledby="sms-balance">
          <div className="hb__cardhead">
            <h3 id="sms-balance">{account.mode === 'PLATFORM' ? 'SMS units' : 'SMS'}</h3>
          </div>
          <p className="ad__muted">{smsModeLabel(account)}</p>
          {account.mode === 'PLATFORM' || account.balance > 0 ? (
            <p className="hb__amount num">{account.balance.toLocaleString('en-KE')} <span className="sms__unit">units left</span></p>
          ) : null}
          {account.failing ? (
            <p className="hb__overdue">Your SMS account isn’t sending: {account.failing.reason}. Since {formatDateTime(account.failing.since)}.</p>
          ) : null}
          {canManage && account.canBuyInApp ? (
            <button type="button" className="nx-btn nx-btn--primary hb__paybtn" onClick={() => setParam('buy', '1')}>Buy SMS</button>
          ) : !canManage ? (
            <p className="hint">Your role can see SMS but not buy units. Ask your organisation’s owner.</p>
          ) : (
            <p className="hint">Buying in the app isn’t available right now.</p>
          )}
        </section>

        <section className="ag__card" aria-labelledby="sms-facts">
          <h3 id="sms-facts">How it works</h3>
          <dl className="pf__facts hb__facts">
            <Fact label="Price per unit">{formatKES(Number(account.unitPrice))}</Fact>
            <Fact label="Units bought">{account.unitsBought.toLocaleString('en-KE')}</Fact>
            <Fact label="Units used">{account.unitsUsed.toLocaleString('en-KE')}</Fact>
          </dl>
          <p className="ad__muted">
            One unit is one SMS of up to 160 characters (70 with emoji); longer messages use more. Sign-in and security
            codes are sent by KodiHub and never use your units.
          </p>
        </section>

        {canManage ? <SmsSettingsCard account={account} /> : null}
      </div>

      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="SMS lists">
          <button type="button" role="tab" aria-selected={tab === 'usage'} className="pf__tab" onClick={() => setParam('tab', null)}>
            Messages sent
          </button>
          <button type="button" role="tab" aria-selected={tab === 'top-ups'} className="pf__tab" onClick={() => setParam('tab', 'top-ups')}>
            Top-ups
          </button>
        </div>
      </div>
      {tab === 'usage' ? <UsageList /> : <TopUpList />}

      {buying && canManage ? <BuySmsSheet ownPhone={session.user.phone} onClose={() => setParam('buy', null)} /> : null}
    </div>
  );
}

function SmsSettingsCard({ account }: { account: SmsAccountView }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [level, setLevel] = useState(String(account.lowBalanceLevel));
  const [fallback, setFallback] = useState(account.fallbackToPlatform);
  const [error, setError] = useState<string | null>(null);
  const dirty = level !== String(account.lowBalanceLevel) || fallback !== account.fallbackToPlatform;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<unknown>('/sms', body),
    onSuccess: async () => {
      toast.saved('SMS settings saved.');
      await queryClient.invalidateQueries({ queryKey: smsKeys.account });
    },
    onError: (e) => setError(smsErrorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const n = Number(level);
    if (!Number.isInteger(n) || n < 0) {
      setError('Enter a whole number of units, 0 or more.');
      return;
    }
    setError(null);
    save.mutate({ lowBalanceLevel: n, ...(account.mode === 'OWN' ? { fallbackToPlatform: fallback } : {}) });
  };

  return (
    <section className="ag__card" aria-labelledby="sms-settings">
      <h3 id="sms-settings">Warnings</h3>
      <form onSubmit={submit} noValidate className="sms__form">
        <div className="fld">
          <label htmlFor="sms-low">Warn me below (units)</label>
          <input id="sms-low" inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value)} />
          <span className="hint">Owners get a notice and an email, at most once a day.</span>
        </div>
        {account.mode === 'OWN' ? (
          <label className="sms__check">
            <input type="checkbox" checked={fallback} onChange={(e) => setFallback(e.target.checked)} />
            <span>If my SMS account fails, send through KodiHub using my units</span>
          </label>
        ) : null}
        {error ? <p className="fld__err" role="alert">{error}</p> : null}
        <button type="submit" className="nx-btn nx-btn--sm" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </form>
    </section>
  );
}

const STATUS_TONE: Record<SmsUsageStatus, string> = { SENT: 'ad__badge--ok', FAILED: 'ad__badge--bad', NO_UNITS: 'ad__badge--warn' };

function UsageList() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<SmsUsageStatus | ''>('');
  const list = useQuery({
    queryKey: [...smsKeys.usage, page, status],
    queryFn: () =>
      api.get<PageEnvelope<SmsUsageRow>>('/sms/usage', { page, pageSize: SMS_PAGE_SIZE, ...(status ? { status } : {}) }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="ad__filters">
        <select className="ad__select" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as SmsUsageStatus | ''); setPage(1); }}>
          <option value="">All messages</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
          <option value="NO_UNITS">Not sent — no SMS units</option>
        </select>
      </div>
      {list.isPending ? <TableSkeleton rows={5} /> : list.isError ? (
        <p className="ad__error" role="alert">{smsErrorMessage(list.error)}</p>
      ) : list.data.data.length === 0 ? (
        <div className="ad__tablewrap"><EmptyState title="No messages yet" detail="Messages to your tenants and guests show here." /></div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr><th>When</th><th>To</th><th>Message</th><th className="num">Units</th><th>Status</th></tr>
            </thead>
            <tbody>
              {list.data.data.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.at)}</td>
                  <td className="num">{r.to}</td>
                  <td>{r.type.replace(/_/g, ' ')}{r.route === 'PLATFORM_FREE' ? <span className="ad__sub">Sent free by KodiHub</span> : null}</td>
                  <td className="num">{r.units}</td>
                  <td>
                    <span className={`ad__badge ${STATUS_TONE[r.status]}`}>{usageStatusLabel(r.status)}</span>
                    {r.status === 'FAILED' && r.reason ? <span className="ad__sub">{r.reason}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={setPage} />
    </>
  );
}

function TopUpList() {
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...smsKeys.topUps, page],
    queryFn: () => api.get<PageEnvelope<SmsTopUpRow>>('/sms/top-ups', { page, pageSize: SMS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  if (list.isPending) return <TableSkeleton rows={4} />;
  if (list.isError) return <p className="ad__error" role="alert">{smsErrorMessage(list.error)}</p>;
  if (list.data.data.length === 0) {
    return <div className="ad__tablewrap"><EmptyState title="No top-ups yet" detail="Units you buy show here." /></div>;
  }
  return (
    <>
      <div className="ad__tablewrap">
        <table className="ad__table">
          <thead>
            <tr><th>When</th><th className="num">Units</th><th className="num">Paid</th><th>How</th><th className="num">Balance after</th></tr>
          </thead>
          <tbody>
            {list.data.data.map((r) => (
              <tr key={r.id}>
                <td>{formatDateTime(r.at)}</td>
                <td className="num">{r.units > 0 ? `+${r.units.toLocaleString('en-KE')}` : r.units.toLocaleString('en-KE')}</td>
                <td className="num">{r.amount ? formatKES(Number(r.amount)) : '—'}</td>
                <td>
                  {r.kind === 'PURCHASE' ? (r.source === 'C2B' ? 'M-Pesa paybill' : 'M-Pesa prompt') : 'Added by KodiHub'}
                  {r.mpesaReceipt ? <span className="ad__sub num">{r.mpesaReceipt}</span> : null}
                  {r.reason ? <span className="ad__sub">{r.reason}</span> : null}
                </td>
                <td className="num">{r.balanceAfter.toLocaleString('en-KE')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager meta={list.data.meta} onPage={setPage} />
    </>
  );
}
