import PDFDocument from 'pdfkit';

/**
 * Shared institutional accounting & layout primitives for server-rendered A4 PDFs
 * (Tenant Invoices, Platform Invoices, Payment Receipts, Tenant Statements, Owner Statements).
 *
 * Uses built-in Helvetica / Helvetica-Bold only so no external font files need to ship in the
 * container image. Keep all characters within Windows-1252 (WinAnsiEncoding).
 */

export const PDF_BRAND = {
  brandDark: '#111827',
  brandAccent: '#1F2937',
  brandSoft: '#F9FAFB',
  brandBorder: '#D1D5DB',
  ink: '#111827',
  inkSecondary: '#374151',
  muted: '#6B7280',
  surface: '#F9FAFB',
  tableHeaderBg: '#F3F4F6',
  tableZebraBg: '#FAFAFA',
  border: '#E5E7EB',
  borderStrong: '#9CA3AF',
  ruleHeavy: '#111827',
  successText: '#14532D',
  successBg: '#F0FDF4',
  successBorder: '#86EFAC',
  warnText: '#7C2D12',
  warnBg: '#FFF7ED',
  warnBorder: '#FDBA74',
  dangerText: '#7F1D1D',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FCA5A5',
  neutralText: '#1F2937',
  neutralBg: '#F3F4F6',
  neutralBorder: '#D1D5DB',
} as const;

export const DEFAULT_SYSTEM_INVOICE_INSTRUCTIONS =
  'Always quote your unique Tenant Account Reference when paying via M-Pesa Paybill, Buy Goods Till, or Bank Transfer so your payment is reconciled automatically. This is an official computer-generated invoice issued via KodiHub and is valid without a physical signature.';

export const DEFAULT_SYSTEM_RECEIPT_INSTRUCTIONS =
  'This is an official computer-generated receipt issued via KodiHub and is valid without a physical signature or stamp. Please retain this receipt for your records. Cheques and bank transfers are subject to bank clearing.';

export interface DocumentInstructions {
  invoiceInstructions: string | null;
  receiptInstructions: string | null;
}

export interface SystemDocumentInstructions {
  invoiceInstructions: string;
  receiptInstructions: string;
}

/** Reads organisation-specific invoice & receipt instructions from `Organization.settings`. */
export function readOrgDocumentInstructions(settings: unknown): DocumentInstructions {
  const s = (settings as { documentInstructions?: Partial<DocumentInstructions> } | null)
    ?.documentInstructions;
  const inv =
    typeof s?.invoiceInstructions === 'string' && s.invoiceInstructions.trim()
      ? s.invoiceInstructions.trim()
      : null;
  const rct =
    typeof s?.receiptInstructions === 'string' && s.receiptInstructions.trim()
      ? s.receiptInstructions.trim()
      : null;
  return {
    invoiceInstructions: inv,
    receiptInstructions: rct,
  };
}

/** Reads platform-wide system invoice & receipt instructions from `PlatformSettings.emailTemplates`. */
export function readSystemDocumentInstructions(
  rawEmailTemplates: unknown,
): SystemDocumentInstructions {
  const container =
    rawEmailTemplates && typeof rawEmailTemplates === 'object' && !Array.isArray(rawEmailTemplates)
      ? ((rawEmailTemplates as Record<string, unknown>)._pdfInstructions as
          Partial<DocumentInstructions> | undefined)
      : undefined;
  const inv =
    typeof container?.invoiceInstructions === 'string' && container.invoiceInstructions.trim()
      ? container.invoiceInstructions.trim()
      : DEFAULT_SYSTEM_INVOICE_INSTRUCTIONS;
  const rct =
    typeof container?.receiptInstructions === 'string' && container.receiptInstructions.trim()
      ? container.receiptInstructions.trim()
      : DEFAULT_SYSTEM_RECEIPT_INSTRUCTIONS;
  return {
    invoiceInstructions: inv,
    receiptInstructions: rct,
  };
}

/** 2500000n → "25,000.00" (grouped by hand: identical output on every server locale). */
export function money(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${whole}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Draws a crisp top architectural rule across the page. */
export function drawTopBrandBar(doc: PDFKit.PDFDocument): void {
  const pageWidth = doc.page.width;
  doc.save();
  doc.rect(0, 0, pageWidth, 4).fill(PDF_BRAND.ruleHeavy);
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
 * Draws an authoritative, editorial accounting header:
 * - Left: "ISSUED BY" overline, Organisation name, and contact details (Tel, Email, KRA PIN).
 * - Right: Document title, crisp rectangular status tag, and a two-column metadata table
 *   (Label on left, Value right-aligned on right — never overlapping).
 * - Bottom: 1.2pt solid rule and advances `doc.y` cleanly below the header.
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

  // Left column: Issuer details
  const leftColWidth = width * 0.52;
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(PDF_BRAND.muted)
    .text(org.subtitle ? org.subtitle.toUpperCase() : 'ISSUED BY', left, topY, {
      width: leftColWidth,
    });

  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(PDF_BRAND.ink)
    .text(org.name, left, doc.y + 2, { width: leftColWidth });

  doc.font('Helvetica').fontSize(8.5).fillColor(PDF_BRAND.inkSecondary);
  const contactLines = [
    org.phone ? `Tel: ${org.phone}` : null,
    org.email ? `Email: ${org.email}` : null,
    org.kraPin ? `KRA PIN: ${org.kraPin}` : null,
  ].filter((x): x is string => Boolean(x));

  if (contactLines.length > 0) {
    let contactY = doc.y + 4;
    for (const line of contactLines) {
      doc.text(line, left, contactY, { width: leftColWidth });
      contactY = doc.y + 1;
    }
  }
  const leftBottomY = Math.max(doc.y, topY + 46);

  // Right column: Document Title + Status Tag + Two-Column Key-Value Metadata Grid
  const rightColWidth = 210;
  const rightColX = right - rightColWidth;

  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .fillColor(PDF_BRAND.ink)
    .text(title.toUpperCase(), rightColX, topY, {
      width: rightColWidth,
      align: 'right',
    });

  let rightY = doc.y + 4;

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

    doc.font('Helvetica-Bold').fontSize(7);
    const tagText = badge.label.toUpperCase();
    const tagWidth = Math.max(doc.widthOfString(tagText) + 14, 54);
    const tagHeight = 14;
    const tagX = right - tagWidth;

    doc.save();
    doc
      .rect(tagX, rightY, tagWidth, tagHeight)
      .lineWidth(0.75)
      .fillAndStroke(toneColors.bg, toneColors.border);
    doc.restore();
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor(toneColors.text)
      .text(tagText, tagX, rightY + 3.5, {
        width: tagWidth,
        align: 'center',
        lineBreak: false,
      });

    rightY += tagHeight + 6;
  }

  // Draw each fact row in a strict 2-column table (Label left, Value right-aligned)
  const labelW = 68;
  const valueX = rightColX + labelW + 6;
  const valueW = rightColWidth - labelW - 6;

  if (facts.length > 0) {
    doc.save();
    doc
      .moveTo(rightColX, rightY)
      .lineTo(right, rightY)
      .lineWidth(0.5)
      .strokeColor(PDF_BRAND.border)
      .stroke();
    doc.restore();
    rightY += 4;
  }

  for (const [k, v] of facts) {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(PDF_BRAND.muted)
      .text(k.toUpperCase(), rightColX, rightY, {
        width: labelW,
        align: 'left',
        lineBreak: false,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(PDF_BRAND.ink)
      .text(v, valueX, rightY - 0.5, {
        width: valueW,
        align: 'right',
      });
    const rowBottom = Math.max(doc.y, rightY + 11) + 3;
    doc.save();
    doc
      .moveTo(rightColX, rowBottom)
      .lineTo(right, rowBottom)
      .lineWidth(0.4)
      .strokeColor(PDF_BRAND.border)
      .stroke();
    doc.restore();
    rightY = rowBottom + 4;
  }

  const dividerY = Math.max(leftBottomY, rightY) + 8;
  doc.save();
  doc
    .moveTo(left, dividerY)
    .lineTo(right, dividerY)
    .lineWidth(1.2)
    .strokeColor(PDF_BRAND.ruleHeavy)
    .stroke();
  doc.restore();

  doc.fillColor(PDF_BRAND.ink).font('Helvetica').fontSize(10);
  doc.x = left;
  doc.y = dividerY + 12;
  return doc.y;
}

/**
 * Draws a structured Instructions & Verification section on Invoices and Receipts,
 * combining Organisation Instructions (set by the landlord/agency) and System Instructions
 * (set by the platform admin), plus an optional audit/verification sign-off row.
 */
export function drawInstructionsAndSignoff(
  doc: PDFKit.PDFDocument,
  startY: number,
  opts: {
    orgName: string;
    orgInstructions?: string | null;
    systemInstructions?: string | null;
    extraTitle?: string;
    extraLines?: string[];
    signoffLeft?: string;
    signoffCenter?: string;
    signoffRight?: string;
  },
): number {
  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;
  let y = startY;

  const hasExtra = Boolean(opts.extraLines && opts.extraLines.length > 0);
  const orgText = opts.orgInstructions?.trim() || null;
  const sysText = opts.systemInstructions?.trim() || null;

  if (hasExtra || orgText || sysText) {
    doc.save();
    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .lineWidth(0.75)
      .strokeColor(PDF_BRAND.borderStrong)
      .stroke();
    doc.restore();
    y += 8;

    if (hasExtra && opts.extraLines) {
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(PDF_BRAND.ink)
        .text((opts.extraTitle ?? 'PAYMENT METHODS & INSTRUCTIONS').toUpperCase(), left, y, {
          width,
        });
      y = doc.y + 3;
      doc.font('Helvetica').fontSize(8.5).fillColor(PDF_BRAND.inkSecondary);
      for (const line of opts.extraLines) {
        doc.text(line, left, y, { width });
        y = doc.y + 1.5;
      }
      y += 6;
    }

    if (orgText) {
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(PDF_BRAND.ink)
        .text(`${opts.orgName.toUpperCase()} — INSTRUCTIONS & TERMS`, left, y, { width });
      y = doc.y + 3;
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(PDF_BRAND.inkSecondary)
        .text(orgText, left, y, { width, lineGap: 1.5 });
      y = doc.y + 8;
    }

    if (sysText) {
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor(PDF_BRAND.muted)
        .text('SYSTEM NOTICE', left, y, { width });
      y = doc.y + 2.5;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(PDF_BRAND.muted)
        .text(sysText, left, y, { width, lineGap: 1.2 });
      y = doc.y + 8;
    }
  }

  if (opts.signoffLeft || opts.signoffCenter || opts.signoffRight) {
    const boxH = 22;
    doc.save();
    doc
      .rect(left, y, width, boxH)
      .lineWidth(0.5)
      .fillAndStroke(PDF_BRAND.surface, PDF_BRAND.border);
    doc.restore();

    const colW = width / 3;
    const textY = y + 7;
    if (opts.signoffLeft) {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(PDF_BRAND.inkSecondary)
        .text(opts.signoffLeft, left + 8, textY, {
          width: colW - 12,
          align: 'left',
          lineBreak: false,
        });
    }
    if (opts.signoffCenter) {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(PDF_BRAND.inkSecondary)
        .text(opts.signoffCenter, left + colW, textY, {
          width: colW,
          align: 'center',
          lineBreak: false,
        });
    }
    if (opts.signoffRight) {
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(PDF_BRAND.ink)
        .text(opts.signoffRight, left + colW * 2, textY, {
          width: colW - 8,
          align: 'right',
          lineBreak: false,
        });
    }
    y += boxH + 8;
  }

  doc.y = y;
  return y;
}

/**
 * Draws the institutional document footer at the bottom of the current page.
 */
export function footer(doc: PDFKit.PDFDocument, centerNote?: string, reference?: string): void {
  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;
  const footerLineY = doc.page.height - 58;

  doc.save();
  doc
    .moveTo(left, footerLineY)
    .lineTo(right, footerLineY)
    .lineWidth(0.6)
    .strokeColor(PDF_BRAND.borderStrong)
    .stroke();
  doc.restore();

  const leftLabel = reference
    ? `Ref: ${reference}${centerNote ? `  ·  ${centerNote}` : ''}`
    : (centerNote ?? 'Official accounting document');

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(PDF_BRAND.muted)
    .text(leftLabel, left, footerLineY + 6, {
      width: width * 0.72,
      align: 'left',
      lineBreak: false,
    });

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(PDF_BRAND.muted)
    .text('KodiHub Financial Ledger', left + width * 0.72, footerLineY + 6, {
      width: width * 0.28,
      align: 'right',
      lineBreak: false,
    });
}
