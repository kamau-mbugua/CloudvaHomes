import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { saveBlob } from '../../lib/files';

/** Who a receipt goes to when it is sent again (contacts only when the viewer may see them). */
export interface ReceiptRecipient {
  name: string;
  phone?: string | null;
  email?: string | null;
  /** Unknown (undefined) when the list doesn't say, e.g. rent payments. */
  hasPhone?: boolean;
  hasEmail?: boolean;
}

/** One receipt the screen can preview, download and send. */
export interface ReceiptRef {
  number: string;
  /** API path of the PDF. */
  pdfPath: string;
  /** API path that sends it again. */
  sendPath: string;
  recipient: ReceiptRecipient;
}

export interface ReceiptSendResult {
  sms: boolean;
  email: boolean;
}

/** A short-stay payment's receipt (`SRC-…`). */
export function stayReceiptRef(
  bookingId: string,
  payment: { id: string; number: string },
  recipient: ReceiptRecipient,
): ReceiptRef {
  const base = `/host/bookings/${bookingId}/payments/${payment.id}/receipt`;
  return { number: payment.number, pdfPath: base, sendPath: `${base}/send`, recipient };
}

/** A rent payment's receipt (`RCT-…`). */
export function rentReceiptRef(payment: {
  id: string;
  number: string;
  tenant: { firstName: string; lastName: string; phone?: string | null };
}): ReceiptRef {
  return {
    number: payment.number,
    pdfPath: `/payments/${payment.id}/receipt`,
    sendPath: `/payments/${payment.id}/receipt/send`,
    recipient: {
      name: `${payment.tenant.firstName} ${payment.tenant.lastName}`.trim(),
      phone: payment.tenant.phone ?? null,
      hasPhone: payment.tenant.phone ? true : undefined,
    },
  };
}

/** What "Send" will do, in words, before the host presses it. */
export function sendPlan(r: ReceiptRecipient): string[] {
  const lines: string[] = [];
  if (r.hasPhone === false) lines.push('No phone number on file, so no SMS.');
  else lines.push(`SMS${r.phone ? ` to ${r.phone}` : ''} with a link to the receipt.`);
  if (r.hasEmail === false) lines.push('No email on file, so no email.');
  else if (r.email) lines.push(`Email to ${r.email} with the receipt PDF attached.`);
  else lines.push('Email with the receipt PDF attached, if there is an email on file.');
  return lines;
}

/** What actually went out, for the toast. */
export function sentMessage(number: string, r: ReceiptSendResult): { ok: boolean; text: string } {
  if (r.sms && r.email) return { ok: true, text: `Receipt ${number} sent by SMS and email.` };
  if (r.sms) return { ok: true, text: `Receipt ${number} sent by SMS.` };
  if (r.email) return { ok: true, text: `Receipt ${number} sent by email.` };
  return {
    ok: false,
    text: `Receipt ${number} could not be sent: no phone or email reached. Check the contact details and SMS units.`,
  };
}

export const fetchReceiptPdf = (ref: ReceiptRef) => api.blob(ref.pdfPath);

export async function downloadReceipt(ref: ReceiptRef): Promise<void> {
  saveBlob(await fetchReceiptPdf(ref), `${ref.number || 'receipt'}.pdf`, 'application/pdf');
}

export async function sendReceipt(ref: ReceiptRef): Promise<ReceiptSendResult> {
  const res = await api.post<DataEnvelope<ReceiptSendResult>>(ref.sendPath, {});
  return res.data;
}
