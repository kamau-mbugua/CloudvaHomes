import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { Sheet } from '../../components/Sheet';
import { portfolioErrorMessage, usePropertyOptions } from '../portfolio/api';
import { useListFilters } from '../portfolio/hooks';
import { MAX_BROADCAST_LENGTH, broadcastSummary, counterLabel, type BroadcastCounts } from './rules';

interface Broadcast extends BroadcastCounts {
  id: string;
  propertyIds: string[];
  text: string;
  createdAt: string;
}

const KEY = ['broadcasts'] as const;
const PAGE_SIZE = 20;

/**
 * Tenants → Messages (phase 13): notices sent to the tenants of chosen properties — SMS to
 * everyone, optionally email, and an in-app notice for tenants who use the portal.
 */
export function MessagesPage() {
  const canSend = useCan('messages:send');
  const filters = useListFilters();
  const [composing, setComposing] = useState(false);
  const list = useQuery({
    queryKey: [...KEY, { page: filters.page }],
    queryFn: () => api.get<PageEnvelope<Broadcast>>('/broadcasts', { page: filters.page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    // Keep counts moving while something is still sending.
    refetchInterval: (q) => (q.state.data?.data.some((b) => b.status !== 'DONE') ? 2000 : false),
  });
  const properties = usePropertyOptions(true);
  const names = new Map((properties.data?.data ?? []).map((p) => [p.id, p.name]));
  const rows = list.data?.data ?? [];

  return (
    <div className="pg">
      <div className="ad__filters">
        <p className="ad__muted ms__lede">Notices to your tenants — water cuts, meetings, rule changes. Each goes as an SMS, with an optional email and a notice in the tenant app.</p>
        {canSend ? (
          <button type="button" className="nx-btn nx-btn--primary pg-push" onClick={() => setComposing(true)}>New notice</button>
        ) : null}
      </div>
      {list.isError ? <p className="ad__error" role="alert">{portfolioErrorMessage(list.error)}</p> : null}
      {list.isPending ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="ad__tablewrap">
          <EmptyState title="No notices yet" detail="Send one to the tenants of one or more properties."
            action={canSend ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setComposing(true)}>New notice</button> : undefined} />
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Sent</th>
                <th>Notice</th>
                <th>To</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{formatDateTime(b.createdAt)}</td>
                  <td className="ms__text">{b.text}</td>
                  <td>{b.propertyIds.map((id) => names.get(id) ?? 'A property').join(', ')}</td>
                  <td className={b.failed ? 'ms__warn' : undefined}>{broadcastSummary(b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />
      {composing ? <BroadcastSheet onClose={() => setComposing(false)} /> : null}
    </div>
  );
}

function BroadcastSheet({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const properties = usePropertyOptions(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [alsoEmail, setAlsoEmail] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMutation({
    mutationFn: (propertyIds: string[]) =>
      api.post<DataEnvelope<{ recipients: number; withEmail: number; withPortal: number }>>('/broadcasts/preview', { propertyIds }),
  });
  const { mutate: runPreview } = preview;
  useEffect(() => {
    if (picked.length) runPreview(picked);
  }, [picked, runPreview]);
  const counts = picked.length ? preview.data?.data : undefined;

  const send = useMutation({
    mutationFn: () => api.post('/broadcasts', { propertyIds: picked, text: text.trim(), alsoEmail }),
    onSuccess: async () => {
      toast.saved(`Sending your notice to ${counts?.recipients ?? 'the'} tenants.`);
      await queryClient.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: (e) => {
      setConfirming(false);
      setError(portfolioErrorMessage(e));
    },
  });

  const next = () => {
    if (!picked.length) return setError('Choose at least one property.');
    if (!text.trim()) return setError('Write the notice.');
    if (text.length > MAX_BROADCAST_LENGTH) return setError(`Keep it to ${MAX_BROADCAST_LENGTH} characters.`);
    if (!counts?.recipients) return setError('There are no current tenants in those properties.');
    setError(null);
    setConfirming(true);
  };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Sheet
      title={confirming ? 'Send this notice?' : 'New notice to tenants'}
      busy={send.isPending}
      onClose={onClose}
      footer={confirming ? (
        <>
          <button type="button" className="nx-btn" onClick={() => setConfirming(false)} disabled={send.isPending}>Back</button>
          <button type="button" className="nx-btn nx-btn--primary" onClick={() => send.mutate()} disabled={send.isPending}>
            {send.isPending ? 'Sending…' : `Send to ${counts?.recipients} tenants`}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="nx-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="nx-btn nx-btn--primary" onClick={next}>Review</button>
        </>
      )}
    >
      {confirming ? (
        <>
          <blockquote className="ms__quote">{text.trim()}</blockquote>
          <p>
            {counts?.recipients} tenants get an SMS ({counterLabel(text.trim(), counts?.recipients ?? 0).split(' · ').slice(1).join(' · ')}).
            {alsoEmail ? ` ${counts?.withEmail} also ${counts?.withEmail === 1 ? 'gets' : 'get'} an email.` : ''}{' '}
            {counts?.withPortal} {counts?.withPortal === 1 ? 'sees' : 'see'} it in the tenant app.
          </p>
          <p className="ad__muted">Texts can’t be recalled once sent.</p>
        </>
      ) : (
        <>
          <fieldset className="ms__props">
            <legend>Send to the current tenants of</legend>
            {(properties.data?.data ?? []).map((p) => (
              <label key={p.id} className="fld__check">
                <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                {p.name}
              </label>
            ))}
          </fieldset>
          <p className="ad__muted" role="status">
            {!picked.length ? 'Choose one or more properties.'
              : preview.isPending ? 'Counting tenants…'
              : counts ? `${counts.recipients} tenants · ${counts.withEmail} have email · ${counts.withPortal} use the tenant app` : null}
          </p>
          <label className="fld" htmlFor="bc-text">
            <span>Notice</span>
            <textarea id="bc-text" className="nx-input ms__area" rows={5} value={text} maxLength={MAX_BROADCAST_LENGTH}
              placeholder="e.g. Water will be off on Saturday from 9am to noon for tank cleaning."
              onChange={(e) => setText(e.target.value)} />
            <span className="hint">{counterLabel(text, counts?.recipients ?? 0)}</span>
          </label>
          <label className="fld__check">
            <input type="checkbox" checked={alsoEmail} onChange={(e) => setAlsoEmail(e.target.checked)} />
            Also send by email to tenants who have an email address
          </label>
          {error ? <p className="nx-sheet__error" role="alert">{error}</p> : null}
        </>
      )}
    </Sheet>
  );
}
