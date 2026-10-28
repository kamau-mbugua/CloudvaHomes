import { Inject, Injectable } from '@nestjs/common';
import type { LineKind } from '../../../generated/prisma/client.js';
import { DB, type Db, type Tx } from '../../../prisma/prisma.module.js';
import { fromMilli, meteredAmount, moveInAmount, toMilli } from '../billing-math.js';

export interface DraftLine {
  kind: LineKind;
  description: string;
  quantity: string; // exact 3-dp decimal
  unitAmount: bigint;
  amount: bigint;
  refundable?: boolean;
  chargeTypeId?: string;
  moveInChargeId?: string;
  meterReadingId?: string;
  chargeEntryId?: string;
}

export interface MonthlyDraft {
  lines: DraftLine[];
  missingReadings: { meterId: string; serialNo: string; chargeName: string }[];
}

export interface BillableTenancy {
  id: string;
  unitId: string;
  rentAmount: bigint;
  unit: { propertyId: string };
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-10" → "October 2026" */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

const one = (
  kind: LineKind,
  description: string,
  amount: bigint,
  extra: Partial<DraftLine> = {},
): DraftLine => ({
  kind,
  description,
  quantity: '1.000',
  unitAmount: amount,
  amount,
  ...extra,
});

/**
 * Works out what an invoice should contain. Reads only — the run, the preview and move-in
 * all use it, and only the issuer writes. Pass the transaction when the result will be
 * issued, so the inputs read are the ones locked.
 */
@Injectable()
export class InvoiceBuilder {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Rent plus every active charge of the property that applies to the unit: fixed amounts,
   * this month's variable entry, and this month's meter reading. Inputs already on an
   * invoice are skipped; meters without a reading are reported, not guessed.
   */
  async monthly(
    t: BillableTenancy,
    period: string,
    client: Db | Tx = this.db,
  ): Promise<MonthlyDraft> {
    const label = periodLabel(period);
    const lines: DraftLine[] = [one('RENT', `Rent — ${label}`, t.rentAmount)];
    const missingReadings: MonthlyDraft['missingReadings'] = [];

    const charges = await client.chargeType.findMany({
      where: { propertyId: t.unit.propertyId, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      include: {
        entries: { where: { unitId: t.unitId, period, invoiceId: null } },
        meters: {
          where: { unitId: t.unitId, status: 'ACTIVE' },
          include: { readings: { where: { period, invoiceId: null } } },
        },
      },
    });
    for (const c of charges) {
      if (c.unitIds.length && !c.unitIds.includes(t.unitId)) continue;
      if (c.kind === 'FIXED' && c.amount !== null) {
        lines.push(one('CHARGE', `${c.name} — ${label}`, c.amount, { chargeTypeId: c.id }));
      } else if (c.kind === 'VARIABLE') {
        const e = c.entries[0];
        if (e) {
          lines.push(
            one('CHARGE', `${c.name} — ${label}`, e.amount, {
              chargeTypeId: c.id,
              chargeEntryId: e.id,
            }),
          );
        }
      } else if (c.kind === 'METERED') {
        for (const m of c.meters) {
          const r = m.readings[0];
          if (!r) {
            // Already billed this month (locked) is not "missing"; only an absent reading is.
            const billed = await client.meterReading.count({ where: { meterId: m.id, period } });
            if (!billed)
              missingReadings.push({ meterId: m.id, serialNo: m.serialNo, chargeName: c.name });
            continue;
          }
          const used = toMilli(r.current.toFixed(3)) - toMilli(r.previous.toFixed(3));
          const rate = c.unitRate ?? 0n;
          const unit = c.unitLabel ? ` ${c.unitLabel}` : '';
          // Plain "to", not an arrow: the PDF's built-in font has no arrow glyph.
          lines.push({
            kind: 'CHARGE',
            description: `${c.name} — ${label} (${r.previous.toFixed(3)} to ${r.current.toFixed(3)}${unit})`,
            quantity: fromMilli(used),
            unitAmount: rate,
            amount: meteredAmount(used, rate),
            chargeTypeId: c.id,
            meterReadingId: r.id,
          });
        }
      }
    }
    return { lines, missingReadings };
  }

  /** The property's active move-in charges for a rent. Empty when it has none. */
  async moveIn(propertyId: string, rent: bigint, client: Db | Tx = this.db): Promise<DraftLine[]> {
    const charges = await client.moveInCharge.findMany({
      where: { propertyId, status: 'ACTIVE' },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return charges.map((c) =>
      c.rentMonths
        ? {
            kind: 'MOVE_IN' as const,
            description: `${c.name} (${c.rentMonths} × monthly rent)`,
            quantity: `${c.rentMonths}.000`,
            unitAmount: rent,
            amount: moveInAmount(c, rent),
            refundable: c.refundable,
            moveInChargeId: c.id,
          }
        : one('MOVE_IN', c.name, moveInAmount(c, rent), {
            refundable: c.refundable,
            moveInChargeId: c.id,
          }),
    );
  }
}
