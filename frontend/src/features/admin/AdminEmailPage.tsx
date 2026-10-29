import { useState } from 'react';
import type { FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { unwrap } from '../payments/rules';
import { useListFilters } from '../portfolio/hooks';
import { Field } from '../portfolio/ui';
import { PAGE_SIZE, keys, platformErrorMessage, usePlatformEmailSettings } from '../platform/api';
import type { PlatformEmailLog, PlatformEmailSettings } from '../platform/types';

type EmailTab = 'settings' | 'broadcast' | 'logs';

/**
 * Admin → Email & Logs (`/admin/email`): SMTP configuration, test sender, broadcast to
 * active organisation owners, and searchable delivery logs (`platform_email_logs`).
 */
export function AdminEmailPage() {
  const filters = useListFilters();
  const rawTab = filters.get('tab');
  const tab: EmailTab = rawTab === 'broadcast' || rawTab === 'logs' ? rawTab : 'settings';

  return (
    <div className="pg">
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Email management">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'settings'}
            className="pf__tab"
            onClick={() => filters.setFilter({ tab: '' })}
          >
            SMTP settings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'broadcast'}
            className="pf__tab"
            onClick={() => filters.setFilter({ tab: 'broadcast' })}
          >
            Broadcast
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'logs'}
            className="pf__tab"
            onClick={() => filters.setFilter({ tab: 'logs' })}
          >
            What was sent
          </button>
        </div>
      </div>

      {tab === 'settings' ? <EmailSettingsTab /> : tab === 'broadcast' ? <BroadcastTab /> : <EmailLogsTab />}
    </div>
  );
}

function EmailSettingsTab() {
  const query = usePlatformEmailSettings();

  if (query.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (query.isError) return <p className="ad__error" role="alert">{platformErrorMessage(query.error)}</p>;

  const s = query.data;
  const isConfigured = s.configured ?? Boolean(s.host || s.source === 'env' || s.source === 'database');
  return (
    <div className="pg-narrow">
      <SmtpForm key={`${s.host ?? ''}-${s.port}-${s.username ?? s.user ?? ''}-${s.fromEmail ?? ''}-${s.fromName ?? ''}-${s.encryption}-${s.allowlist ?? ''}-${s.passwordSet}`} settings={s} />
      <TestEmailSection configured={isConfigured} />
    </div>
  );
}

function SmtpForm({ settings }: { settings: PlatformEmailSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [host, setHost] = useState(settings.host ?? '');
  const [port, setPort] = useState(String(settings.port ?? 587));
  const [user, setUser] = useState(settings.username ?? settings.user ?? '');
  const [password, setPassword] = useState('');
  const [encryption, setEncryption] = useState<'tls' | 'ssl' | 'none'>(settings.encryption ?? 'tls');
  const [fromEmail, setFromEmail] = useState(settings.fromEmail ?? '');
  const [fromName, setFromName] = useState(settings.fromName ?? '');
  const [allowlist, setAllowlist] = useState(settings.allowlist ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<unknown>('/platform/email/settings', body),
    onSuccess: async () => {
      toast.saved('Email settings saved.');
      setPassword('');
      await queryClient.invalidateQueries({ queryKey: keys.emailSettings });
    },
    onError: (e) => setError(platformErrorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setError('Enter a valid SMTP port (1 to 65535).');
      return;
    }
    save.mutate({
      host: host.trim() || null,
      port: parsedPort,
      username: user.trim() || null,
      ...(password ? { password } : {}),
      encryption,
      fromEmail: fromEmail.trim() || null,
      fromName: fromName.trim() || null,
      allowlist: allowlist.trim() || null,
    });
  };

  const isConfigured = settings.configured ?? Boolean(settings.host || settings.source === 'env' || settings.source === 'database');

  return (
    <form className="fm__section" onSubmit={submit} noValidate autoComplete="off">
      <div className="mp__cardhead">
        <h2>Outgoing mail (SMTP)</h2>
        <div className="mp__badges">
          {isConfigured
            ? <span className="ad__badge ad__badge--ok">Connected ({settings.source})</span>
            : <span className="ad__badge ad__badge--off">Not configured</span>}
          {settings.passwordSet ? <span className="ad__badge ad__badge--info">Password saved</span> : null}
        </div>
      </div>
      <p>
        Used for owner invitations, password resets, admin 2FA verification codes, and platform broadcasts.
      </p>

      <div className="fm__grid">
        <Field id="em-host" label="SMTP host" hint="e.g. smtp.gmail.com or smtp.mailgun.org">
          <input id="em-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" />
        </Field>
        <Field id="em-port" label="Port" hint="587 for TLS, 465 for SSL">
          <input id="em-port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} />
        </Field>
        <Field id="em-user" label="Username">
          <input id="em-user" value={user} onChange={(e) => setUser(e.target.value)} />
        </Field>
        <Field id="em-enc" label="Encryption">
          <select id="em-enc" value={encryption} onChange={(e) => setEncryption(e.target.value as 'tls' | 'ssl' | 'none')}>
            <option value="tls">TLS (STARTTLS)</option>
            <option value="ssl">SSL</option>
            <option value="none">None</option>
          </select>
        </Field>
        <Field id="em-pass" label="Password" optional hint={settings.passwordSet ? 'Leave blank to keep the saved password.' : 'Stored encrypted.'}>
          <input id="em-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field id="em-from" label="From address" hint="e.g. noreply@hodi.co.ke">
          <input id="em-from" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
        </Field>
        <Field id="em-name" label="From name" optional hint="e.g. Hodi">
          <input id="em-name" value={fromName} onChange={(e) => setFromName(e.target.value)} />
        </Field>
        <Field id="em-allow" label="Recipient allowlist" optional wide
          hint="Optional comma- or newline-separated emails or @domains. When set, Hodi only sends to matching addresses (useful on staging).">
          <textarea id="em-allow" rows={2} value={allowlist} onChange={(e) => setAllowlist(e.target.value)} placeholder="e.g. @hodi.co.ke, qa@example.com" />
        </Field>
      </div>

      {error ? <p className="ad__error" role="alert">{error}</p> : null}

      <div className="pg-actions">
        <button type="submit" className="nx-btn nx-btn--primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save SMTP settings'}
        </button>
      </div>
    </form>
  );
}

function TestEmailSection({ configured }: { configured: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: (email: string) =>
      api.post<unknown>('/platform/email/test', { to: email }).then((res) => unwrap<{ sent: boolean; error?: string }>(res)),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: keys.emailLogs });
      if (res.sent) {
        toast.saved(`Test email sent to ${to}.`);
        setTo('');
      } else {
        setError(res.error ?? 'Failed to send test email. Check What was sent for details.');
      }
    },
    onError: (e) => setError(platformErrorMessage(e)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!to.trim() || !to.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    send.mutate(to.trim());
  };

  return (
    <form className="fm__section" onSubmit={submit} noValidate>
      <h2>Send a test email</h2>
      <p>Verify that Hodi can deliver mail with the current SMTP settings. Every attempt is recorded under “What was sent”.</p>
      <div className="fm__grid">
        <Field id="em-test" label="Recipient email" wide>
          <input id="em-test" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" />
        </Field>
      </div>
      {error ? <p className="ad__error" role="alert">{error}</p> : null}
      <div className="pg-actions">
        <button type="submit" className="nx-btn" disabled={send.isPending || !configured}>
          {send.isPending ? 'Sending…' : 'Send test email'}
        </button>
      </div>
    </form>
  );
}

function BroadcastTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const broadcast = useMutation({
    mutationFn: (payload: { subject: string; body: string }) =>
      api.post<unknown>('/platform/email/broadcast', payload).then((res) =>
        unwrap<{ total?: number; sent?: number; failed?: number; totalRecipients?: number; sentCount?: number }>(res),
      ),
    onSuccess: async (res) => {
      const sent = res.sent ?? res.sentCount ?? 0;
      const total = res.total ?? res.totalRecipients ?? 0;
      toast.saved(`Broadcast sent to ${sent} of ${total} organisation owners.`);
      setSubject('');
      setBody('');
      await queryClient.invalidateQueries({ queryKey: keys.emailLogs });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 422) {
        setError('Enter a subject (at least 2 characters) and message (at least 5 characters).');
        return;
      }
      setError(platformErrorMessage(e));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (subject.trim().length < 2 || body.trim().length < 5) {
      setError('Enter both a subject and message body.');
      return;
    }
    broadcast.mutate({ subject: subject.trim(), body: body.trim() });
  };

  return (
    <div className="pg-narrow">
      <form className="fm__section" onSubmit={submit} noValidate>
        <h2>Email all active organisation owners</h2>
        <p>Sends an announcement to the primary owner of every organisation currently in Trial, Active, or Grace status.</p>
        <div className="fm__grid">
          <Field id="eb-subject" label="Subject" wide>
            <input id="eb-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </Field>
          <Field id="eb-body" label="Message" wide>
            <textarea id="eb-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} />
          </Field>
        </div>
        {error ? <p className="ad__error" role="alert">{error}</p> : null}
        <div className="pg-actions">
          <button type="submit" className="nx-btn nx-btn--primary" disabled={broadcast.isPending}>
            {broadcast.isPending ? 'Sending broadcast…' : 'Send to all owners'}
          </button>
        </div>
      </form>
    </div>
  );
}

function EmailLogsTab() {
  const filters = useListFilters();
  const { q, page } = filters;
  const status = filters.get('status');

  const list = useQuery({
    queryKey: [...keys.emailLogs, { q, status, page }],
    queryFn: () => api.get<PageEnvelope<PlatformEmailLog>>('/platform/email/logs', { q, status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.data ?? [];

  return (
    <div>
      <div className="ad__filters">
        <input
          className="ad__search"
          type="search"
          placeholder="Search by recipient or subject…"
          aria-label="Search email logs"
          value={filters.search}
          onChange={(e) => filters.setSearch(e.target.value)}
        />
        <select
          className="ad__select"
          aria-label="Delivery status"
          value={status}
          onChange={(e) => filters.setFilter({ status: e.target.value })}
        >
          <option value="">All statuses</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {list.isError ? <p className="ad__error" role="alert">{platformErrorMessage(list.error)}</p> : null}

      {list.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="ad__tablewrap">
          <EmptyState title="No emails logged yet" detail="Every email Hodi sends or attempts to send appears here." />
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Sent</th>
                <th>Recipient</th>
                <th>Subject</th>
                <th>Template</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td><strong>{log.to ?? log.recipient}</strong></td>
                  <td>
                    {log.subject}
                    {log.error ? <span className="ad__sub ad__owed">{log.error}</span> : null}
                  </td>
                  <td><span className="num">{log.kind ?? log.template ?? '—'}</span></td>
                  <td>
                    <span className={`ad__badge ${log.status === 'SENT' ? 'ad__badge--ok' : 'ad__badge--warn'}`}>
                      {log.status === 'SENT' ? 'Sent' : 'Failed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />
    </div>
  );
}
