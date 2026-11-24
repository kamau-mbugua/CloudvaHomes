import { a4, footer, header, money, PDF_BRAND } from '../../common/pdf/pdf.js';
import type { IssuedCertificate } from './payment-certificates.service.js';

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** The certificate as a one-page PDF, with the code and where to check it. */
export function renderPaymentCertificatePdf(c: IssuedCertificate): Promise<Buffer> {
  const s = c.summary;
  const { doc, bytes, left, right } = a4(`Payment history ${s.tenantCode}`, c.org.name);
  const width = right - left;
  let y = header(
    doc,
    c.org,
    'Payment history certificate',
    [
      ['Tenant', `${s.tenantName} (${s.tenantCode})`],
      ['Period', `${day(s.from)} – ${day(s.to)}`],
      ['Issued', c.issuedAt.toISOString().slice(0, 10)],
      ['Code', c.code],
    ],
    {
      label: s.unpaid === 0 ? 'No unpaid invoices' : `${s.unpaid} unpaid`,
      tone: s.unpaid === 0 ? 'success' : 'warning',
    },
  );

  y += 6;
  doc
    .font('Helvetica')
    .fontSize(10.5)
    .fillColor(PDF_BRAND.ink)
    .text(
      `${c.org.name} certifies the rent payment record of ${s.tenantName}` +
        (s.homes.length ? `, tenant of ${s.homes.join('; ')},` : '') +
        ` for invoices due between ${day(s.from)} and ${day(s.to)}, as held in KodiHQ.`,
      left,
      y,
      { width },
    );
  y = doc.y + 16;

  const rows: [string, string][] = [
    ['Invoices', String(s.invoices)],
    ['Billed', `KES ${money(BigInt(s.billed))}`],
    ['Paid', `KES ${money(BigInt(s.paid))}`],
    ['Paid in full by the due date', String(s.onTime)],
    ['Paid in full, after the due date', String(s.late)],
    ['Not yet paid in full', String(s.unpaid)],
  ];
  for (const [label, value] of rows) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(PDF_BRAND.muted)
      .text(label, left, y, { width: width * 0.6 });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(PDF_BRAND.ink)
      .text(value, left + width * 0.6, y, { width: width * 0.4, align: 'right' });
    y += 20;
    doc
      .moveTo(left, y - 6)
      .lineTo(right, y - 6)
      .lineWidth(0.4)
      .strokeColor(PDF_BRAND.borderStrong)
      .stroke();
  }

  y += 14;
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(PDF_BRAND.muted)
    .text(
      `Check this certificate at ${c.verifyUrl} — the page shows the same figures. ` +
        'It covers rent and charges invoiced through KodiHQ only, and is not a credit report.',
      left,
      y,
      { width },
    );

  footer(doc, 'Payment history certificate', c.code);
  doc.end();
  return bytes;
}
