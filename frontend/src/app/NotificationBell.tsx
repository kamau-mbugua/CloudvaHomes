import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api/client';
import { formatDay } from '../lib/dates';

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

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => api.get<NotificationsResponse>('/notifications?page=1&pageSize=15'),
    refetchInterval: 45_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${encodeURIComponent(id)}/read`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all', {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

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
            width: 340,
            maxHeight: 420,
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
            <strong style={{ fontSize: '0.9rem' }}>Notifications</strong>
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

          {items.length === 0 ? (
            <p className="ad__muted" style={{ margin: '1rem 0', textAlign: 'center', fontSize: '0.85rem' }}>
              You’re all caught up.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.55rem 0.65rem',
                      borderRadius: 8,
                      border: '1px solid var(--border, #e6ecf5)',
                      background: item.readAt ? 'transparent' : 'rgba(10, 62, 107, 0.06)',
                      cursor: 'pointer',
                      display: 'grid',
                      gap: '0.2rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline' }}>
                      <strong style={{ fontSize: '0.83rem' }}>{item.title}</strong>
                      <span className="ad__sub" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                        {formatDay(item.createdAt.slice(0, 10))}
                      </span>
                    </div>
                    <span className="ad__sub" style={{ fontSize: '0.8rem' }}>{item.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
