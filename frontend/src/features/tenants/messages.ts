import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import type { Label } from '../portfolio/labels';
import { portfolioErrorMessage } from '../portfolio/api';

/**
 * Phase 7 staff pieces around a tenant: the message log (`GET /messages`, paged), its
 * labels, and the plain-English messages for portal access and reminders.
 */

export type MessageKind = 'REMINDER_DUE' | 'REMINDER_OVERDUE' | 'REMINDER_MANUAL' | 'PORTAL_ACCESS';
export type MessageStatus = 'SENT' | 'FAILED';

export interface Message {
  id: string;
  tenantId: string | null;
  kind: MessageKind;
  channel: 'SMS' | 'EMAIL';
  to: string;
  text: string;
  status: MessageStatus;
  error: string | null;
  /** Sent by the daily reminder job rather than by a person. */
  automatic?: boolean;
  createdAt: string;
}

export const MESSAGE_KIND: Record<MessageKind, string> = {
  REMINDER_DUE: 'Reminder — due soon',
  REMINDER_OVERDUE: 'Reminder — overdue',
  REMINDER_MANUAL: 'Reminder — sent by staff',
  PORTAL_ACCESS: 'Portal sign-in link',
};

export const MESSAGE_STATUS: Record<MessageStatus, Label> = {
  SENT: { label: 'Sent', tone: 'ad__badge--ok' },
  FAILED: { label: 'Failed', tone: 'ad__badge--alert' },
};

export const messageKeys = { messages: ['messages'] as const };

export const MESSAGES_PAGE_SIZE = 10;

export function useTenantMessages(tenantId: string, page: number, enabled = true) {
  return useQuery({
    queryKey: [...messageKeys.messages, { tenantId, page }],
    queryFn: () => api.get<PageEnvelope<Message>>('/messages', { tenantId, page, pageSize: MESSAGES_PAGE_SIZE }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Messages for portal access and reminders; the rest falls through to the portfolio ones. */
export function tenantMessagingError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NO_CONTACT':
        return 'This tenant has no phone number on file, so there’s nowhere to send it. Add one with Edit, then try again.';
      case 'NOTHING_DUE':
        return 'This tenant owes nothing right now, so no reminder was sent.';
      default:
        return portfolioErrorMessage(error);
    }
  }
  return portfolioErrorMessage(error);
}
