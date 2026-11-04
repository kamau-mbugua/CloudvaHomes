import { a4, footer } from '../../../common/pdf/pdf.js';
import type { InspectionItem } from './inspection-rules.js';

const CONDITION_TEXT: Record<string, string> = {
  GOOD: 'Good',
  FAIR: 'Fair',
  POOR: 'Poor',
  DAMAGED: 'Damaged',
};

export interface InspectionPdfInput {
  organization: string;
  kind: 'MOVE_IN' | 'MOVE_OUT';
  inspectedOn: string;
  inspectorName: string | null;
  notes: string | null;
  tenantName: string;
  unit: string;
  property: string;
  acknowledgedAt: Date | null;
  items: InspectionItem[];
}

/** One-page-per-section inspection report. pdfkit Helvetica: WinAnsi text only. */
export async function renderInspectionPdf(i: InspectionPdfInput): Promise<Buffer> {
  const title = i.kind === 'MOVE_IN' ? 'Move-in inspection' : 'Move-out inspection';
  const { doc, bytes, left, right } = a4(title, i.organization);
  doc.moveDown(2);
  doc.font('Helvetica-Bold').fontSize(16).text(title, left);
  doc.font('Helvetica').fontSize(10).moveDown(0.4);
  doc.text(`${i.organization}`);
  doc.text(`${i.property}, unit ${i.unit} - tenant ${i.tenantName}`);
  doc.text(`Inspected on ${i.inspectedOn}${i.inspectorName ? ` by ${i.inspectorName}` : ''}`);
  doc.text(
    i.acknowledgedAt
      ? `Acknowledged by the tenant on ${i.acknowledgedAt.toISOString().slice(0, 10)}`
      : 'Not yet acknowledged by the tenant',
  );
  doc.moveDown();
  const colArea = left;
  const colCond = left + 200;
  const colNote = left + 290;
  doc.font('Helvetica-Bold').text('Area', colArea, doc.y, { continued: false });
  const headY = doc.y - doc.currentLineHeight();
  doc.text('Condition', colCond, headY);
  doc.text('Note', colNote, headY);
  doc
    .moveTo(left, doc.y + 2)
    .lineTo(right, doc.y + 2)
    .stroke();
  doc.font('Helvetica').moveDown(0.5);
  for (const item of i.items) {
    const y = doc.y;
    doc.text(item.area, colArea, y, { width: 190 });
    doc.text(CONDITION_TEXT[item.condition] ?? item.condition, colCond, y, { width: 85 });
    const note = [
      item.note?.trim(),
      item.photoUploadIds.length ? `${item.photoUploadIds.length} photo(s)` : '',
    ]
      .filter(Boolean)
      .join(' - ');
    doc.text(note || '-', colNote, y, { width: right - colNote });
    doc.moveDown(0.4);
  }
  if (i.notes?.trim()) {
    doc.moveDown().font('Helvetica-Bold').text('Notes', left);
    doc.font('Helvetica').text(i.notes.trim(), left, doc.y, { width: right - left });
  }
  footer(doc, title);
  doc.end();
  return bytes;
}
