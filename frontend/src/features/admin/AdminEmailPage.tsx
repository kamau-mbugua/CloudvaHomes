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
import { PAGE_SIZE, keys, platformErrorMessage, usePlatformEmailSettings, usePlatformEmailTemplates } from '../platform/api';
import type { PlatformEmailLog, PlatformEmailSettings, PlatformEmailTemplate } from '../platform/types';

type EmailTab = 'settings' | 'templates' | 'broadcast' | 'logs';

/**
 * Admin → Email & Logs (`/admin/email`): SMTP configuration, system email templates,
 * broadcast to active organisation owners, and searchable delivery logs (`platform_email_logs`).
 */
export function AdminEmailPage() {
  const filters = useListFilters();
  const rawTab = filters.get('tab');
  const tab: EmailTab =
    rawTab === 'templates' || rawTab === 'broadcast' || rawTab === 'logs' ? rawTab : 'settings';

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
            aria-selected={tab === 'templates'}
            className="pf__tab"
            onClick={() => filters.setFilter({ tab: 'templates' })}
          >
            Email templates
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

      {tab === 'settings' ? (
        <EmailSettingsTab />
      ) : tab === 'templates' ? (
        <EmailTemplatesTab />
      ) : tab === 'broadcast' ? (
        <BroadcastTab />
      ) : (
        <EmailLogsTab />
      )}
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
    onError: async (e) => {
      await queryClient.invalidateQueries({ queryKey: keys.emailLogs });
      setError(platformErrorMessage(e));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setError('Enter a valid SMTP port (1 to 65535).');
      return;
    }
    const matchFrom = /^(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+)>$/.exec(fromEmail.trim());
    const cleanFromEmail = matchFrom ? matchFrom[2]!.trim() : fromEmail.trim();
    const cleanFromName = fromName.trim() || matchFrom?.[1]?.trim() || null;
    if (cleanFromEmail !== fromEmail) setFromEmail(cleanFromEmail);
    save.mutate({
      host: host.trim() || null,
      port: parsedPort,
      username: user.trim() || null,
      ...(password ? { password } : {}),
      encryption,
      fromEmail: cleanFromEmail || null,
      fromName: cleanFromName,
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
          <input id="em-user" autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} />
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
        <Field id="em-name" label="From name" optional hint="e.g. KodiHub">
          <input id="em-name" value={fromName} onChange={(e) => setFromName(e.target.value)} />
        </Field>
        <Field id="em-allow" label="Recipient allowlist" optional wide
          hint="Optional comma- or newline-separated emails or @domains. When set, KodiHub only sends to matching addresses (useful on staging).">
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
    onError: async (e) => {
      await queryClient.invalidateQueries({ queryKey: keys.emailLogs });
      setError(platformErrorMessage(e));
    },
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
      <p>Verify that KodiHub can deliver mail with the current SMTP settings. Every attempt is recorded under “What was sent”.</p>
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

function interpolateSample(template: string, sampleMap: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key: string) =>
    Object.prototype.hasOwnProperty.call(sampleMap, key) ? sampleMap[key]! : full,
  );
}

function EmailTemplatesTab() {
  const query = usePlatformEmailTemplates();
  const [selectedKey, setSelectedKey] = useState<string>('owner_welcome');

  if (query.isPending) return <p className="ad__muted" role="status">Loading email templates…</p>;
  if (query.isError) return <p className="ad__error" role="alert">{platformErrorMessage(query.error)}</p>;

  const templates = query.data ?? [];
  const active = templates.find((t) => t.key === selectedKey) ?? templates[0];

  if (!active) {
    return (
      <div className="ad__tablewrap">
        <EmptyState title="No email templates found" detail="System email templates will appear here." />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div className="fm__section" style={{ padding: '1rem 1.25rem' }}>
        <div className="mp__cardhead" style={{ marginBottom: '0.5rem' }}>
          <div>
            <h2>System email templates</h2>
            <p style={{ margin: '0.25rem 0 0 0' }}>
              Control the subject and message body for every automated email KodiHub sends. Use{' '}
              <code>{'{{variable}}'}</code> placeholders to insert dynamic organisation, user, and invoice details.
            </p>
          </div>
          <span className="ad__badge ad__badge--info">
            {templates.filter((t) => t.customized).length} of {templates.length} customised
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Select an email template"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '0.6rem',
            marginTop: '0.75rem',
          }}
        >
          {templates.map((tpl) => {
            const isSelected = tpl.key === active.key;
            return (
              <button
                key={tpl.key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedKey(tpl.key)}
                style={{
                  textAlign: 'left',
                  padding: '0.75rem 0.9rem',
                  borderRadius: '10px',
                  border: isSelected ? '2px solid #3f6212' : '1px solid var(--border, #e5e5e0)',
                  background: isSelected ? 'rgba(63, 98, 18, 0.06)' : 'var(--surface, #fff)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.3rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.7 }}>
                    {tpl.category}
                  </span>
                  <span className={`ad__badge ${tpl.customized ? 'ad__badge--ok' : 'ad__badge--off'}`}>
                    {tpl.customized ? 'Customised' : 'Default'}
                  </span>
                </div>
                <strong style={{ fontSize: '0.92rem' }}>{tpl.name}</strong>
              </button>
            );
          })}
        </div>
      </div>

      <EmailTemplateEditor
        key={`${active.key}-${active.updatedAt ?? 'default'}-${active.subject}-${active.body}`}
        template={active}
      />
    </div>
  );
}

function EmailTemplateEditor({ template }: { template: PlatformEmailTemplate }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [testTo, setTestTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const sampleMap = Object.fromEntries(template.variables.map((v) => [v.key, v.sample]));
  const previewSubject = interpolateSample(subject, sampleMap);
  const previewBody = interpolateSample(body, sampleMap);
  const isDirty = subject !== template.subject || body !== template.body;
  const differsFromDefault = subject !== template.defaultSubject || body !== template.defaultBody;

  const save = useMutation({
    mutationFn: (payload: { subject?: string; body?: string; reset?: boolean }) =>
      api
        .put<unknown>(`/platform/email/templates/${encodeURIComponent(template.key)}`, payload)
        .then((res) => unwrap<PlatformEmailTemplate>(res)),
    onSuccess: async (updated, vars) => {
      toast.saved(vars.reset ? `${template.name} reset to default.` : `${template.name} saved.`);
      setSubject(updated.subject);
      setBody(updated.body);
      await queryClient.invalidateQueries({ queryKey: keys.emailTemplates });
    },
    onError: (e) => {
      setError(platformErrorMessage(e));
    },
  });

  const sendTest = useMutation({
    mutationFn: (to: string) =>
      api
        .post<unknown>(`/platform/email/templates/${encodeURIComponent(template.key)}/test`, {
          to,
          subject: subject.trim(),
          body: body.trim(),
        })
        .then((res) => unwrap<{ sent: boolean; to: string; subject: string }>(res)),
    onSuccess: async (res) => {
      toast.saved(`Sample "${template.name}" email sent to ${res.to}.`);
      setTestTo('');
      await queryClient.invalidateQueries({ queryKey: keys.emailLogs });
    },
    onError: async (e) => {
      await queryClient.invalidateQueries({ queryKey: keys.emailLogs });
      setTestError(platformErrorMessage(e));
    },
  });

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (subject.trim().length < 2 || body.trim().length < 2) {
      setError('Both subject and email body are required.');
      return;
    }
    save.mutate({ subject: subject.trim(), body: body.trim() });
  };

  const handleReset = () => {
    setError(null);
    setSubject(template.defaultSubject);
    setBody(template.defaultBody);
    if (template.customized) {
      save.mutate({ reset: true });
    }
  };

  const handleInsertVariable = (varKey: string) => {
    const token = `{{${varKey}}}`;
    setBody((prev) => (prev.endsWith(' ') || prev.endsWith('\n') || !prev ? `${prev}${token}` : `${prev} ${token}`));
  };

  const handleSendTest = (event: FormEvent) => {
    event.preventDefault();
    setTestError(null);
    if (!testTo.trim() || !testTo.includes('@')) {
      setTestError('Enter a valid recipient email address.');
      return;
    }
    sendTest.mutate(testTo.trim());
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
      <form className="fm__section" onSubmit={handleSave} noValidate style={{ margin: 0 }}>
        <div className="mp__cardhead">
          <div>
            <h2>{template.name}</h2>
            <p style={{ margin: '0.25rem 0 0 0' }}>{template.description}</p>
          </div>
          <div className="mp__badges">
            <span className={`ad__badge ${template.customized ? 'ad__badge--ok' : 'ad__badge--off'}`}>
              {template.customized ? 'Customised' : 'System default'}
            </span>
          </div>
        </div>

        <div className="fm__grid">
          <Field id="et-subject" label="Email subject" wide>
            <input
              id="et-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={300}
            />
          </Field>

          <Field
            id="et-body"
            label="Email body"
            wide
            hint="Use --- Section Title --- for styled section headings and Label: Value for bold key-value rows."
          >
            <textarea
              id="et-body"
              rows={13}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={20000}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.86rem' }}
            />
          </Field>
        </div>

        <div style={{ marginTop: '0.9rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.45rem' }}>
            Available placeholders (click to insert into body):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {template.variables.map((v) => (
              <button
                key={v.key}
                type="button"
                className="nx-btn nx-btn--ghost"
                title={`${v.description} — e.g. ${v.sample}`}
                onClick={() => handleInsertVariable(v.key)}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.78rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="ad__error" role="alert">{error}</p> : null}

        <div className="pg-actions" style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem', justifyContent: 'space-between' }}>
          <button
            type="button"
            className="nx-btn nx-btn--ghost"
            disabled={save.isPending || (!template.customized && !differsFromDefault)}
            onClick={handleReset}
          >
            Reset to default
          </button>
          <button
            type="submit"
            className="nx-btn nx-btn--primary"
            disabled={save.isPending || !isDirty}
          >
            {save.isPending ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </form>

      <div style={{ display: 'grid', gap: '1.25rem' }}>
        <div className="fm__section" style={{ margin: 0 }}>
          <div className="mp__cardhead">
            <h2>Live sample preview</h2>
            <span className="ad__badge ad__badge--info">Sample data</span>
          </div>
          <p style={{ marginBottom: '0.75rem' }}>
            Shows how this template renders when populated with sample organisation and billing data.
          </p>

          <div
            style={{
              border: '1px solid #e5e5e0',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#ffffff',
            }}
          >
            <div style={{ background: '#1a2e05', color: '#ffffff', padding: '0.85rem 1.15rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.98rem', letterSpacing: '-0.01em' }}>KodiHub</strong>
              <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>Subject: {previewSubject}</span>
            </div>
            <div
              style={{
                padding: '1.15rem',
                whiteSpace: 'pre-wrap',
                fontSize: '0.88rem',
                lineHeight: 1.6,
                color: '#1f2937',
              }}
            >
              {previewBody}
            </div>
            <div
              style={{
                padding: '0.65rem 1.15rem',
                background: '#fafaf7',
                borderTop: '1px solid #ecece6',
                fontSize: '0.75rem',
                color: '#6b7280',
              }}
            >
              Sent by KodiHub · Property Management Platform
            </div>
          </div>

          <details style={{ marginTop: '0.85rem', fontSize: '0.82rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Placeholder reference &amp; sample values</summary>
            <div className="ad__tablewrap" style={{ marginTop: '0.5rem' }}>
              <table className="ad__table">
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th>Meaning</th>
                    <th>Sample value</th>
                  </tr>
                </thead>
                <tbody>
                  {template.variables.map((v) => (
                    <tr key={v.key}>
                      <td><code>{`{{${v.key}}}`}</code></td>
                      <td>{v.description}</td>
                      <td className="ad__muted">{v.sample}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <form className="fm__section" onSubmit={handleSendTest} noValidate style={{ margin: 0 }}>
          <h2>Send test of this template</h2>
          <p>
            Sends this template (including any unsaved edits above) populated with sample values to verify formatting in your inbox.
          </p>
          <div className="fm__grid">
            <Field id="et-test-to" label="Recipient email" wide>
              <input
                id="et-test-to"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
          </div>
          {testError ? <p className="ad__error" role="alert">{testError}</p> : null}
          <div className="pg-actions">
            <button type="submit" className="nx-btn" disabled={sendTest.isPending}>
              {sendTest.isPending ? 'Sending sample…' : 'Send sample email'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
          <EmptyState title="No emails logged yet" detail="Every email KodiHub sends or attempts to send appears here." />
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
