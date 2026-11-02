import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api/client';
import { formatDay } from '../lib/dates';
import { useToast } from '../lib/useToast';

export interface UserNotificationItem {
  id: string;
  userId: string;
  orgId: string | null;
  tenantId: string | null;
  kind: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  data: UserNotificationItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    unreadCount: number;
  };
}

const NOTIFICATIONS_KEY = ['user-notifications'] as const;

function kindMeta(kind: string): { label: string; color: string; bg: string } {
  const k = kind.toUpperCase();
  if (k.includes('PAYMENT')) {
    return { label: 'Payment', color: '#1b6d1b', bg: 'rgba(132, 189, 0, 0.16)' };
  }
  if (k.includes('INVOICE')) {
    return { label: 'Invoice', color: '#002b4d', bg: 'rgba(0, 43, 77, 0.1)' };
  }
  if (k.includes('REMINDER')) {
    return { label: 'Reminder', color: '#b45309', bg: 'rgba(245, 158, 11, 0.16)' };
  }
  if (k.includes('MAINTENANCE')) {
    return { label: 'Maintenance', color: '#0369a1', bg: 'rgba(14, 165, 233, 0.14)' };
  }
  if (k.includes('UNIT_ASSIGNED') || k.includes('TENANCY')) {
    return { label: 'Tenancy', color: '#4338ca', bg: 'rgba(99, 102, 241, 0.14)' };
  }
  return { label: 'Alert', color: '#475569', bg: 'rgba(100, 116, 139, 0.14)' };
}

function browserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return window.Notification.permission;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(
    browserNotificationPermission,
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, filter],
    queryFn: () =>
      api.get<NotificationsResponse>(
        `/notifications?page=1&pageSize=25${filter === 'unread' ? '&unreadOnly=true' : ''}`,
      ),
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${encodeURIComponent(id)}/read`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all', {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

  const dismissOne = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${encodeURIComponent(id)}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

  useEffect(() => {
    const rows = query.data?.data;
    if (!rows) return;
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(rows.map((r) => r.id));
      return;
    }
    const newlyArrived = rows.filter((r) => !r.readAt && !seenIdsRef.current!.has(r.id));
    for (const r of rows) {
      seenIdsRef.current.add(r.id);
    }
    if (newlyArrived.length > 0) {
      const latest = newlyArrived[0]!;
      toast.saved(`${latest.title}: ${latest.body}`);
      if (perm === 'granted' && typeof window !== 'undefined' && 'Notification' in window) {
        try {
          new window.Notification(latest.title, {
            body: latest.body,
            tag: latest.id,
          });
        } catch {
          // Ignore browser Notification constructor restrictions
        }
      }
    }
  }, [query.data, perm, toast]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const unread = query.data?.meta.unreadCount ?? 0;
  const items = query.data?.data ?? [];

  const requestDesktopAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const next = await window.Notification.requestPermission();
      setPerm(next);
      if (next === 'granted') {
        toast.saved('Desktop push alerts enabled for this browser.');
      }
    } catch {
      // Ignore
    }
  };

  const handleSelect = (item: UserNotificationItem) => {
    if (!item.readAt) {
      markRead.mutate(item.id);
    }
    setOpen(false);
    if (item.actionUrl) {
      const target =
        item.actionUrl === '/maintenance' ? '/app/maintenance' : item.actionUrl;
      navigate(target);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="sh__icon"
        onClick={() => setOpen((was) => !was)}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        title="Notifications"
        style={{ position: 'relative' }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? (
          <span
            className="num"
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 999,
              background: '#c92a2a',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              lineHeight: '16px',
              textAlign: 'center',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: 360,
            maxHeight: 460,
            overflowY: 'auto',
            background: 'var(--card)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 60,
            padding: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>
              Notifications {unread > 0 ? `(${unread})` : ''}
            </strong>
            {unread > 0 ? (
              <button
                type="button"
                className="au__link"
                style={{ fontSize: '0.78rem' }}
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
            <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
              <button
                type="button"
                onClick={() => setFilter('all')}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: 999,
                  border: '1px solid var(--border, #d8e1ee)',
                  background: filter === 'all' ? 'var(--primary, #002b4d)' : 'transparent',
                  color: filter === 'all' ? '#fff' : 'inherit',
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter('unread')}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: 999,
                  border: '1px solid var(--border, #d8e1ee)',
                  background: filter === 'unread' ? 'var(--primary, #002b4d)' : 'transparent',
                  color: filter === 'unread' ? '#fff' : 'inherit',
                  cursor: 'pointer',
                }}
              >
                Unread ({unread})
              </button>
            </div>

            {perm === 'default' ? (
              <button
                type="button"
                className="au__link"
                style={{ fontSize: '0.73rem' }}
                onClick={() => void requestDesktopAlerts()}
              >
                Enable desktop alerts
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="ad__muted" style={{ margin: '1.25rem 0', textAlign: 'center', fontSize: '0.85rem' }}>
              {filter === 'unread' ? 'No unread notifications.' : 'You’re all caught up.'}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
              {items.map((item) => {
                const badge = kindMeta(item.kind);
                return (
                  <li key={item.id} style={{ position: 'relative' }}>
                    <div
                      style={{
                        borderRadius: 8,
                        border: '1px solid var(--border, #e6ecf5)',
                        background: item.readAt ? 'transparent' : 'rgba(10, 62, 107, 0.06)',
                        display: 'flex',
                        alignItems: 'stretch',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(item)}
                        style={{
                          flex: 1,
                          textAlign: 'left',
                          padding: '0.55rem 0.65rem',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          display: 'grid',
                          gap: '0.25rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.1rem 0.42rem',
                              borderRadius: 999,
                              color: badge.color,
                              background: badge.bg,
                              textTransform: 'uppercase',
                              letterSpacing: '0.03em',
                            }}
                          >
                            {badge.label}
                          </span>
                          <span className="ad__sub" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                            {formatDay(item.createdAt.slice(0, 10))}
                          </span>
                        </div>
                        <strong style={{ fontSize: '0.83rem' }}>{item.title}</strong>
                        <span className="ad__sub" style={{ fontSize: '0.8rem' }}>{item.body}</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Dismiss notification"
                        title="Dismiss"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissOne.mutate(item.id);
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--muted-foreground, #64748b)',
                          padding: '0 0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
