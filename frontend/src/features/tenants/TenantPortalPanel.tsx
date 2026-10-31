import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { Pager } from '../../components/Pager';
import { TableSkeleton } from '../../components/Loading';
import { Sheet } from '../../components/Sheet';
import { keys } from '../portfolio/api';
import { personName } from '../portfolio/labels';
import type { Tenant } from '../portfolio/types';
import { Badge } from '../portfolio/ui';
import { unwrap } from '../payments/rules';
import { MESSAGE_KIND, MESSAGE_STATUS, messageKeys, tenantMessagingError, useTenantMessages } from './messages';
import type { Message } from './messages';

/**
 * Phase 7 on the staff tenant page: tenant-portal access (give / remove), "Send reminder
 * now", the automatic-reminders opt-out, and the log of every message sent to them.
 * Changing anything needs `tenants:update`; the log needs `tenants:view`.
 */
export function TenantPortalPanel({ tenant }: { tenant: Tenant }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canUpdate = useCan('tenants:update');
  const [removing, setRemoving] = useState(false);
  const name = personName(tenant);
  const access = tenant.portal ?? null;

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.tenants }),
    queryClient.invalidateQueries({ queryKey: messageKeys.messages }),
  ]);

  const give = useMutation({
    mutationFn: () => api.post<unknown>(`/tenants/${tenant.id}/portal-access`),
    onSuccess: async () => {
      toast.saved(`${name} can now sign in to the tenant portal. We texted them the link.`);
      await refresh();
    },
    onError: (error) => toast.failed(tenantMessagingError(error)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete<unknown>(`/tenants/${tenant.id}/portal-access`),
    onSuccess: async () => {
      setRemoving(false);
      toast.saved(`${name} can no longer sign in to the tenant portal.`);
      await refresh();
    },
    onError: (error) => toast.failed(tenantMessagingError(error)),
  });

  const remind = useMutation({
    mutationFn: () => api.post<unknown>(`/tenants/${tenant.id}/reminder`).then((body) => unwrap<Message>(body)),
    onSuccess: async (message) => {
      if (message?.status === 'FAILED') toast.failed(`The reminder to ${message.to} failed${message.error ? `: ${message.error}` : ''}.`);
      else toast.saved(message?.to ? `Reminder sent to ${message.to}.` : 'Reminder sent.');
      await queryClient.invalidateQueries({ queryKey: messageKeys.messages });
    },
    onError: (error) => toast.failed(tenantMessagingError(error)),
  });

  const optOut = useMutation({
    mutationFn: (remindersOff: boolean) => api.patch<unknown>(`/tenants/${tenant.id}`, { remindersOff }),
    onSuccess: async (_r, remindersOff) => {
      toast.saved(remindersOff ? `${name} won’t get automatic reminders.` : `${name} will get automatic reminders again.`);
      await queryClient.invalidateQueries({ queryKey: keys.tenants });
    },
    onError: (error) => toast.failed(tenantMessagingError(error)),
  });

  return (
    <>
      <section className="fm__section">
        <div className="pf__sectionhead"><h2>Portal and reminders</h2></div>
        <div className="tm__portal">
          <div className="ag__card">
            <h3>Tenant portal</h3>
            {access === null ? (
              <p className="ad__muted">Not known — the server didn’t say.</p>
            ) : access.hasAccess ? (
              <p>
                <span className="ad__badge ad__badge--ok">Has access</span>{' '}
                {access.invitedAt ? <span className="ad__muted">since {formatDateTime(access.invitedAt)}</span> : null}
              </p>
            ) : (
              <p><span className="ad__badge ad__badge--off">No access</span></p>
            )}
            <p className="hint">
              With access, {tenant.firstName} signs in on their phone with a one-time code to see what they owe, their invoices,
              statement and receipts, and to pay by M-Pesa. Only their own records.
            </p>
            {canUpdate && access ? (
              <div className="ag__cardactions">
                {access.hasAccess ? (
                  <>
                    <button type="button" className="nx-btn" disabled={give.isPending} onClick={() => give.mutate()}>
                      {give.isPending ? 'Sending…' : 'Send the link again'}
                    </button>
                    <button type="button" className="nx-btn nx-btn--danger" disabled={remove.isPending} onClick={() => setRemoving(true)}>Remove access</button>
                  </>
                ) : (
                  <button type="button" className="nx-btn nx-btn--primary" disabled={give.isPending} onClick={() => give.mutate()}>
                    {give.isPending ? 'Giving access…' : 'Give portal access'}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <div className="ag__card">
            <h3>Rent reminders</h3>
            <label className="tm__toggle">
              <input type="checkbox" checked={!tenant.remindersOff} disabled={!canUpdate || optOut.isPending}
                onChange={(e) => optOut.mutate(!e.target.checked)} />
              <span>
                <strong>Send automatic reminders</strong>
                <span className="ad__muted">When your organisation has reminders switched on (Settings → Organisation). Untick if {tenant.firstName} asked not to get them.</span>
              </span>
            </label>
            {canUpdate ? (
              <div className="ag__cardactions">
                <button type="button" className="nx-btn" disabled={remind.isPending} onClick={() => remind.mutate()}>
                  {remind.isPending ? 'Sending…' : 'Send reminder now'}
                </button>
              </div>
            ) : null}
            <p className="hint">“Send reminder now” texts what they owe today, even if automatic reminders are off.</p>
          </div>
        </div>
      </section>

      <TenantMessages tenantId={tenant.id} />

      {removing ? (
        <Sheet
          title={`Remove ${name}’s portal access?`}
          busy={remove.isPending}
          onClose={() => setRemoving(false)}
          footer={(
            <>
              <button type="button" className="nx-btn" onClick={() => setRemoving(false)} disabled={remove.isPending}>Keep access</button>
              <button type="button" className="nx-btn nx-btn--danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
                {remove.isPending ? 'Removing…' : 'Remove access'}
              </button>
            </>
          )}
        >
          <p>They will no longer be able to sign in to the tenant portal. Their records are not changed, and you can give access again at any time.</p>
        </Sheet>
      ) : null}
    </>
  );
}

/** Every message sent to the tenant, newest first (`GET /messages?tenantId=`, paged). */
function TenantMessages({ tenantId }: { tenantId: string }) {
  const canView = useCan('tenants:view');
  const [page, setPage] = useState(1);
  const list = useTenantMessages(tenantId, page, canView);
  if (!canView) return null;
  const rows = list.data?.data ?? [];

  return (
    <section className="fm__section">
      <div className="pf__sectionhead"><h2>Messages</h2></div>
      {list.isError ? <p className="ad__error" role="alert">{tenantMessagingError(list.error)}</p>
        : list.isPending ? <TableSkeleton rows={2} />
          : rows.length === 0 ? <p className="ad__muted">No messages sent yet.</p>
            : (
              <ul className="tm__msgs">
                {rows.map((m) => (
                  <li key={m.id} className="tm__msg">
                    <div className="tm__msghead">
                      <strong>{MESSAGE_KIND[m.kind] ?? m.kind}</strong>
                      <Badge table={MESSAGE_STATUS} value={m.status} />
                      <span className="ad__muted">{formatDateTime(m.createdAt)} · {m.channel === 'EMAIL' ? 'E-mail' : 'SMS'} to <span className="num">{m.to}</span>{m.automatic ? ' · automatic' : ''}</span>
                    </div>
                    <p>{m.text}</p>
                    {m.status === 'FAILED' && m.error ? <p className="tm__msgerr">Failed: {m.error}</p> : null}
                  </li>
                ))}
              </ul>
            )}
      <Pager meta={list.data?.meta} onPage={setPage} />
    </section>
  );
}
