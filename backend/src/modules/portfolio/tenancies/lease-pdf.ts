import {
  a4,
  footer,
  header,
  money,
  PDF_BRAND,
  type OrgHeader,
  type StatusBadgeOptions,
} from '../../../common/pdf/pdf.js';

export interface LeasePdfInput {
  org: OrgHeader;
  tenancy: {
    id: string;
    status: 'ACTIVE' | 'NOTICE' | 'ENDED';
    rentAmount: bigint;
    billingDay: number;
    depositHeld: bigint;
    startDate: string;
    endDate: string | null;
    unit: {
      id: string;
      number: string;
      floor: number;
      unitType: string | null;
      property: {
        id: string;
        code: string;
        name: string;
        county: string | null;
        area: string | null;
        landlordName: string | null;
      };
    };
    tenant: {
      id: string;
      code: string;
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
      kraPin: string | null;
      idNumberHint: string | null;
    };
  };
  channels: {
    kind: string;
    name: string;
    shortcode: string | null;
    bankName: string | null;
    accountNumber: string | null;
    accountName: string | null;
  }[];
  orgInstructions?: string | null;
}

function statusBadgeFor(status: 'ACTIVE' | 'NOTICE' | 'ENDED'): StatusBadgeOptions {
  if (status === 'ACTIVE') return { label: 'Active lease', tone: 'success' };
  if (status === 'NOTICE') return { label: 'Notice given', tone: 'warning' };
  return { label: 'Ended', tone: 'neutral' };
}

/**
 * Renders an institutional A4 Residential Tenancy Lease Agreement PDF.
 */
export function renderLeasePdf({
  org,
  tenancy: t,
  channels,
  orgInstructions,
}: LeasePdfInput): Promise<Buffer> {
  const leaseRef = `LSE-${t.unit.property.code}-${t.unit.number}-${t.startDate.replace(/-/g, '')}`;
  const { doc, bytes, left, right } = a4(leaseRef, org.name);
  const width = right - left;

  const yAfterHeader = header(
    doc,
    org,
    'Lease Agreement',
    [
      ['Agreement Ref.', leaseRef],
      ['Commencement', t.startDate],
      ['Expiry / End', t.endDate ?? 'Month-to-Month'],
      ['Tenant Code', t.tenant.code],
    ],
    statusBadgeFor(t.status),
  );

  // 1. Two-column Parties & Premises summary box
  const gridTop = yAfterHeader;
  const gridHeight = 86;
  const halfWidth = width / 2;

  doc.save();
  doc
    .rect(left, gridTop, width, gridHeight)
    .lineWidth(0.75)
    .fillAndStroke('#FFFFFF', PDF_BRAND.borderStrong);
  doc
    .moveTo(left + halfWidth, gridTop)
    .lineTo(left + halfWidth, gridTop + gridHeight)
    .lineWidth(0.6)
    .strokeColor(PDF_BRAND.border)
    .stroke();
  doc.restore();

  const padX = 12;
  const colW = halfWidth - padX * 2;

  // Left: Tenant (Lessee)
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(PDF_BRAND.muted)
    .text('TENANT (LESSEE)', left + padX, gridTop + 10, { width: colW });
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(PDF_BRAND.ink)
    .text(
      `${t.tenant.firstName} ${t.tenant.lastName} (${t.tenant.code})`,
      left + padX,
      gridTop + 22,
      {
        width: colW,
      },
    );
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(
      `Tel: ${t.tenant.phone}${t.tenant.email ? `  |  ${t.tenant.email}` : ''}`,
      left + padX,
      doc.y + 2,
      { width: colW },
    );
  const idParts = [
    t.tenant.idNumberHint ? `ID: ${t.tenant.idNumberHint}` : null,
    t.tenant.kraPin ? `KRA PIN: ${t.tenant.kraPin}` : null,
  ].filter(Boolean);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(
      idParts.length ? idParts.join('  |  ') : `Payment Account Ref: ${t.tenant.code}`,
      left + padX,
      doc.y + 2,
      { width: colW },
    );

  // Right: Premises & Landlord
  const rightBoxX = left + halfWidth + padX;
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(PDF_BRAND.muted)
    .text('PREMISES & LANDLORD / AGENT', rightBoxX, gridTop + 10, { width: colW });
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(PDF_BRAND.ink)
    .text(`Unit ${t.unit.number}, ${t.unit.property.name}`, rightBoxX, gridTop + 22, {
      width: colW,
    });
  const locParts = [
    t.unit.unitType,
    `Floor ${t.unit.floor}`,
    t.unit.property.area,
    t.unit.property.county,
  ].filter(Boolean);
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(locParts.join(' · '), rightBoxX, doc.y + 2, { width: colW });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(PDF_BRAND.inkSecondary)
    .text(
      t.unit.property.landlordName
        ? `Landlord: ${t.unit.property.landlordName} (Managed by ${org.name})`
        : `Landlord / Managing Office: ${org.name}`,
      rightBoxX,
      doc.y + 2,
      { width: colW },
    );

  // 2. Financial & Tenancy Terms Table
  let y = gridTop + gridHeight + 14;
  const headerBarH = 20;
  doc.save();
  doc.rect(left, y, width, headerBarH).fill(PDF_BRAND.tableHeaderBg);
  doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(PDF_BRAND.ruleHeavy).stroke();
  doc
    .moveTo(left, y + headerBarH)
    .lineTo(right, y + headerBarH)
    .lineWidth(0.75)
    .strokeColor(PDF_BRAND.ruleHeavy)
    .stroke();
  doc.restore();

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(PDF_BRAND.ink)
    .text('SCHEDULE OF FINANCIAL & TENANCY TERMS', left + 8, y + 6, { width: 300 });
  doc.text('VALUE / SPECIFICATION', left + 300, y + 6, {
    width: width - 308,
    align: 'right',
  });
  y += headerBarH;

  const termRows: [string, string][] = [
    ['Monthly Rent (Payable in Advance)', `KES ${money(t.rentAmount)}`],
    ['Monthly Rent Billing Day', `Day ${t.billingDay} of each calendar month`],
    ['Security Deposit Held', `KES ${money(t.depositHeld)}`],
    ['Tenancy Commencement Date', t.startDate],
    [
      'Tenancy Duration / End Date',
      t.endDate ? `Fixed / Ending ${t.endDate}` : 'Periodic Month-to-Month Tenancy',
    ],
  ];

  for (let idx = 0; idx < termRows.length; idx++) {
    const [label, value] = termRows[idx]!;
    const rowH = 21;
    if (idx % 2 === 1) {
      doc.save();
      doc.rect(left, y, width, rowH).fill(PDF_BRAND.tableZebraBg);
      doc.restore();
    }
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(PDF_BRAND.inkSecondary)
      .text(label, left + 8, y + 6, { width: 280, lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(PDF_BRAND.ink)
      .text(value, left + 290, y + 6, { width: width - 298, align: 'right', lineBreak: false });
    y += rowH;
    doc.save();
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(PDF_BRAND.border).stroke();
    doc.restore();
  }

  // 3. Standard Covenants & Clauses
  y += 14;
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(PDF_BRAND.ink)
    .text('TERMS AND COVENANTS OF TENANCY', left, y);
  y = doc.y + 5;

  const clauses = [
    `1. RENT & UTILITIES: The Tenant shall pay the monthly rent of KES ${money(t.rentAmount)} together with any applicable metered or fixed utility charges on or before the due date specified on each monthly invoice, quoting account reference ${t.tenant.code}.`,
    `2. DEPOSIT: The security deposit of KES ${money(t.depositHeld)} is held as security for the performance of the Tenant's obligations and shall not be applied by the Tenant towards rent without written consent. It is refundable upon vacant possession less any lawful deductions for damages or unpaid balances.`,
    `3. USE & MAINTENANCE: The Premises shall be used strictly for residential purposes. The Tenant shall keep the interior of the unit in clean and tenantable repair (fair wear and tear excepted) and promptly report any structural, plumbing, or electrical faults through the Tenant Portal or to Management.`,
    `4. SUBLETTING & ALTERATIONS: The Tenant shall not assign, sublet, or part with possession of the Premises, nor make structural alterations or fixtures without the prior written consent of the Landlord or Managing Agent.`,
    `5. NOTICE & TERMINATION: Either party may terminate a periodic tenancy by giving at least one (1) calendar month's written notice, or by surrendering vacant possession on the agreed end date with all keys and utility clearances settled.`,
  ];
  if (orgInstructions?.trim()) {
    clauses.push(`6. SPECIAL CONDITIONS: ${orgInstructions.trim()}`);
  }

  for (const clause of clauses) {
    doc
      .font('Helvetica')
      .fontSize(7.8)
      .fillColor(PDF_BRAND.inkSecondary)
      .text(clause, left, y, { width, lineGap: 1.2 });
    y = doc.y + 4.5;
  }

  // 4. Designated Payment Channels
  y += 4;
  const payLines: string[] = [];
  for (const c of channels) {
    if (c.kind === 'MPESA_PAYBILL' && c.shortcode) {
      payLines.push(`M-Pesa Paybill: ${c.shortcode}  |  Account: ${t.tenant.code}`);
    } else if (c.kind === 'MPESA_TILL' && c.shortcode) {
      payLines.push(`M-Pesa Buy Goods Till: ${c.shortcode}  |  Ref: ${t.tenant.code}`);
    } else if (c.kind === 'BANK_ACCOUNT' && c.accountNumber) {
      payLines.push(
        `${c.bankName || c.name}: Acc ${c.accountNumber}${c.accountName ? ` (${c.accountName})` : ''}  |  Ref: ${t.tenant.code}`,
      );
    }
  }
  if (!payLines.length) {
    payLines.push(`Quote tenant reference ${t.tenant.code} on all rent and deposit payments.`);
  }

  const payBoxH = 16 + payLines.length * 11;
  doc.save();
  doc
    .rect(left, y, width, payBoxH)
    .lineWidth(0.6)
    .fillAndStroke(PDF_BRAND.surface, PDF_BRAND.border);
  doc.restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(PDF_BRAND.muted)
    .text('DESIGNATED RENT PAYMENT CHANNELS', left + 10, y + 5);
  let py = y + 14;
  for (const line of payLines) {
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(PDF_BRAND.ink)
      .text(line, left + 10, py, { width: width - 20, lineBreak: false });
    py += 11;
  }

  // 5. Execution & Signatures
  const sigTop = Math.max(y + payBoxH + 14, 665);
  const sigBoxH = 68;
  doc.save();
  doc
    .rect(left, sigTop, width, sigBoxH)
    .lineWidth(0.75)
    .fillAndStroke('#FFFFFF', PDF_BRAND.borderStrong);
  doc
    .moveTo(left + halfWidth, sigTop)
    .lineTo(left + halfWidth, sigTop + sigBoxH)
    .lineWidth(0.6)
    .strokeColor(PDF_BRAND.border)
    .stroke();
  doc.restore();

  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(PDF_BRAND.muted)
    .text('SIGNED FOR LANDLORD / MANAGING AGENT', left + padX, sigTop + 8, { width: colW });
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.ink)
    .text(org.name, left + padX, sigTop + 20, { width: colW, lineBreak: false });
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text('Signature: ___________________________   Date: ____________', left + padX, sigTop + 44, {
      width: colW,
      lineBreak: false,
    });

  doc
    .font('Helvetica-Bold')
    .fontSize(7)
    .fillColor(PDF_BRAND.muted)
    .text('SIGNED BY TENANT (LESSEE)', rightBoxX, sigTop + 8, { width: colW });
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(PDF_BRAND.ink)
    .text(`${t.tenant.firstName} ${t.tenant.lastName}`, rightBoxX, sigTop + 20, {
      width: colW,
      lineBreak: false,
    });
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(PDF_BRAND.inkSecondary)
    .text('Signature: ___________________________   Date: ____________', rightBoxX, sigTop + 44, {
      width: colW,
      lineBreak: false,
    });

  footer(doc, `Residential Lease Agreement · Ref ${leaseRef}`, leaseRef);
  doc.end();
  return bytes;
}
