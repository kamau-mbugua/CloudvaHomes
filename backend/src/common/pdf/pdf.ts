import PDFDocument from 'pdfkit';

/**
 * Shared bits for server-rendered PDFs (invoices, receipts, statements). Built-in Helvetica
 * only, so no font files ship with the image — it covers Windows-1252 characters, so keep
 * text to those (no arrows or emoji).
 */

/** 2500000n → "25,000.00" (grouped by hand: identical output on every server locale). */
export function money(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${whole}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** An A4 document plus a promise of its bytes once `doc.end()` is called. */
export function a4(title: string, author: string) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: title, Author: author } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const bytes = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc, bytes, left: 50, right: doc.page.width - 50 };
}

export interface OrgHeader {
  name: string;
  phone: string;
  email: string;
  kraPin: string | null;
}

/** Organisation block on the left, document title + facts on the right, from y = 50. */
export function header(
  doc: PDFKit.PDFDocument,
  org: OrgHeader,
  title: string,
  facts: [string, string][],
): void {
  const left = 50;
  const width = doc.page.width - 100;
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor('#000')
    .text(org.name, left, 50, { width: width / 2 });
  doc.font('Helvetica').fontSize(9).fillColor('#444');
  for (const line of [org.phone, org.email, org.kraPin ? `KRA PIN ${org.kraPin}` : null]) {
    if (line) doc.text(line, { width: width / 2 });
  }
  doc
    .fillColor('#000')
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(title, left, 50, { width, align: 'right' });
  doc.font('Helvetica').fontSize(10);
  for (const [k, v] of facts) doc.text(`${k}: ${v}`, left, undefined, { width, align: 'right' });
}
