import PDFDocument from 'pdfkit';

/**
 * Shared executive branding & layout primitives for server-rendered A4 PDFs
 * (Tenant Invoices, Platform Invoices, Payment Receipts, Tenant Statements, Owner Statements).
 *
 * Uses built-in Helvetica / Helvetica-Bold only so no external font files need to ship in the
 * container image. Keep all characters within Windows-1252 (WinAnsiEncoding).
 */

export const PDF_BRAND = {
  brandDark: '#0F291E',
  brandAccent: '#15803D',
  brandSoft: '#F0FDF4',
  brandBorder: '#BBF7D0',
  ink: '#0F172A',
  inkSecondary: '#334155',
  muted: '#64748B',
  surface: '#F8FAFC',
  tableHeaderBg: '#0F291E',
  tableZebraBg: '#F8FAFC',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  successText: '#166534',
  successBg: '#DCFCE7',
  successBorder: '#86EFAC',
  warnText: '#9A3412',
  warnBg: '#FFEDD5',
  warnBorder: '#FDBA74',
  dangerText: '#991B1B',
  dangerBg: '#FEE2E2',
  dangerBorder: '#FCA5A5',
  neutralText: '#334155',
  neutralBg: '#F1F5F9',
  neutralBorder: '#CBD5E1',
} as const;

/** 2500000n → "25,000.00" (grouped by hand: identical output on every server locale). */
export function money(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${whole}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Extracts up to 2 uppercase monogram initials from an organisation name. */
export function monogramOf(name: string): string {
  if (name.trim().toLowerCase() === 'kodihub') return 'KH';
  const words = name
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return 'KH';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase();
}

/** Draws the signature KodiHub top brand bar across the page. */
export function drawTopBrandBar(doc: PDFKit.PDFDocument): void {
  const pageWidth = doc.page.width;
  doc.save();
  doc.rect(0, 0, pageWidth, 8).fill(PDF_BRAND.brandDark);
  doc.rect(0, 8, pageWidth, 2.5).fill(PDF_BRAND.brandAccent);
  doc.restore();
}

/** An A4 document plus a promise of its bytes once `doc.end()` is called. */
export function a4(title: string, author: string) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Title: title,
      Author: author,
      Creator: 'KodiHub Property & Rental Management',
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const bytes = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  drawTopBrandBar(doc);
  doc.on('pageAdded', () => {
    drawTopBrandBar(doc);
  });

  return { doc, bytes, left: 50, right: doc.page.width - 50 };
}

export interface OrgHeader {
  name: string;
  phone: string;
  email: string;
  kraPin: string | null;
  subtitle?: string;
}

export interface StatusBadgeOptions {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}

/**
 * Draws a branded executive header:
 * - Left: Monogram badge + Organisation name, subtitle, and contact details.
 * - Right: Document title, optional status pill badge, and structured metadata rows.
 * - Bottom: Subtle divider rule and advances `doc.y` cleanly below the header.
 */
export function header(
  doc: PDFKit.PDFDocument,
  org: OrgHeader,
  title: string,
  facts: readonly (readonly [string, string])[],
  badge?: StatusBadgeOptions,
): number {
  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;
  const topY = 34;

  // Monogram tile
  const initials = monogramOf(org.name);
  doc.save();
  doc.roundedRect(left, topY, 38, 38, 7).fill(PDF_BRAND.brandDark);
  doc.restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#FFFFFF')
    .text(initials, left, topY + 12, { width: 38, align: 'center', lineBreak: false });

  // Organisation text block next to monogram
  const orgTextX = left + 48;
  const orgTextWidth = width * 0.52 - 48;
  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .fillColor(PDF_BRAND.ink)
    .text(org.name, orgTextX, topY, { width: orgTextWidth });

  const subtitle =
    org.subtitle ??
    (org.name.trim().toLowerCase() === 'kodihub'
      ? 'Platform Subscription & Billing'
      : 'Property & Rental Management');
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(PDF_BRAND.brandAccent)
    .text(subtitle.toUpperCase(), orgTextX, doc.y + 1, { width: orgTextWidth });

  doc.font('Helvetica').fontSize(8.5).fillColor(PDF_BRAND.inkSecondary);
  const contactLines = [
    org.phone ? `Tel: ${org.phone}` : null,
    org.email ? `Email: ${org.email}` : null,
    org.kraPin ? `KRA PIN: ${org.kraPin}` : null,
  ].filter((x): x is string => Boolean(x));

  if (contactLines.length > 0) {
    doc.moveDown(0.25);
    for (const line of contactLines) {
      doc.text(line, orgTextX, undefined, { width: orgTextWidth });
    }
  }
  const leftBottomY = Math.max(doc.y, topY + 42);

  // Right side: Document title + optional status pill + metadata facts
  const rightColWidth = width * 0.45;
  const rightColX = right - rightColWidth;

  doc
    .font('Helvetica-Bold')
    .fontSize(17)
    .fillColor(PDF_BRAND.brandDark)
    .text(title.toUpperCase(), rightColX, topY, {
      width: rightColWidth,
      align: 'right',
    });

  let rightY = doc.y + 3;

  if (badge) {
    const toneColors = {
      success: {
        bg: PDF_BRAND.successBg,
        border: PDF_BRAND.successBorder,
        text: PDF_BRAND.successText,
      },
      warning: {
        bg: PDF_BRAND.warnBg,
        border: PDF_BRAND.warnBorder,
        text: PDF_BRAND.warnText,
      },
      danger: {
        bg: PDF_BRAND.dangerBg,
        border: PDF_BRAND.dangerBorder,
        text: PDF_BRAND.dangerText,
      },
      neutral: {
        bg: PDF_BRAND.neutralBg,
        border: PDF_BRAND.neutralBorder,
        text: PDF_BRAND.neutralText,
      },
    }[badge.tone];

    doc.font('Helvetica-Bold').fontSize(8);
    const pillText = badge.label.toUpperCase();
    const pillWidth = Math.max(doc.widthOfString(pillText) + 18, 56);
    const pillHeight = 16;
    const pillX = right - pillWidth;

    doc.save();
    doc
      .roundedRect(pillX, rightY, pillWidth, pillHeight, 8)
      .fillAndStroke(toneColors.bg, toneColors.border);
    doc.restore();
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(toneColors.text)
      .text(pillText, pillX, rightY + 4.5, {
        width: pillWidth,
        align: 'center',
        lineBreak: false,
      });

    rightY += pillHeight + 6;
  }

  for (const [k, v] of facts) {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(PDF_BRAND.muted)
      .text(`${k}: `, rightColX, rightY, {
        width: rightColWidth,
        align: 'right',
        continued: true,
      });
    doc.font('Helvetica-Bold').fillColor(PDF_BRAND.ink).text(v);
    rightY = doc.y + 1;
  }

  const dividerY = Math.max(leftBottomY, rightY) + 12;
  doc.save();
  doc
    .moveTo(left, dividerY)
    .lineTo(right, dividerY)
    .lineWidth(1)
    .strokeColor(PDF_BRAND.border)
    .stroke();
  doc.restore();

  doc.fillColor(PDF_BRAND.ink).font('Helvetica').fontSize(10);
  doc.x = left;
  doc.y = dividerY + 14;
  return doc.y;
}

/**
 * Draws the branded KodiHub footer at the bottom of the current page.
 */
export function footer(doc: PDFKit.PDFDocument, centerNote?: string, reference?: string): void {
  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;
  const footerLineY = doc.page.height - 64;

  if (centerNote) {
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(PDF_BRAND.brandDark)
      .text(centerNote, left, footerLineY - 16, {
        width,
        align: 'center',
        lineBreak: false,
      });
  }

  doc.save();
  doc
    .moveTo(left, footerLineY)
    .lineTo(right, footerLineY)
    .lineWidth(0.75)
    .strokeColor(PDF_BRAND.border)
    .stroke();
  doc.restore();

  const leftLabel = reference
    ? `${reference} · Official document generated via KodiHub`
    : 'Official document generated via KodiHub';

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(PDF_BRAND.muted)
    .text(leftLabel, left, footerLineY + 7, {
      width: width * 0.6,
      align: 'left',
      lineBreak: false,
    });

  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(PDF_BRAND.brandAccent)
    .text('Powered by KodiHub', left + width * 0.6, footerLineY + 7, {
      width: width * 0.4,
      align: 'right',
      lineBreak: false,
    });
}
