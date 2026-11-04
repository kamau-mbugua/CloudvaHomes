/**
 * Move-in / move-out inspections (phase 13), web side. DEFAULT_AREAS must match
 * backend/src/modules/portfolio/inspections/inspection-rules.ts and the mobile app.
 */

export const DEFAULT_AREAS = [
  'Living room',
  'Kitchen',
  'Bedrooms',
  'Bathroom & toilet',
  'Doors & locks',
  'Windows & grilles',
  'Walls & paint',
  'Floors',
  'Electrical fittings',
  'Plumbing & taps',
] as const;

export type ItemCondition = 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';
export type InspectionKind = 'MOVE_IN' | 'MOVE_OUT';

export const CONDITION_LABEL: Record<ItemCondition, string> = { GOOD: 'Good', FAIR: 'Fair', POOR: 'Poor', DAMAGED: 'Damaged' };
const RANK: Record<ItemCondition, number> = { GOOD: 0, FAIR: 1, POOR: 2, DAMAGED: 3 };

export interface InspectionItem {
  area: string;
  condition: ItemCondition;
  note?: string;
  photoUploadIds: string[];
}

export interface Inspection {
  id: string;
  kind: InspectionKind;
  inspectedOn: string;
  items: InspectionItem[];
  notes: string | null;
  inspectorName: string | null;
  tenantAcknowledgedAt: string | null;
}

export interface CompareRow {
  area: string;
  before?: ItemCondition;
  after?: ItemCondition;
  worse: boolean;
}

/** Move-in against move-out, area by area (matched case-insensitively), in move-in order. */
export function compareItems(moveIn: readonly InspectionItem[], moveOut: readonly InspectionItem[]): CompareRow[] {
  const key = (a: string) => a.trim().toLowerCase();
  const out = new Map(moveOut.map((i) => [key(i.area), i]));
  const rows: CompareRow[] = moveIn.map((i) => {
    const after = out.get(key(i.area));
    out.delete(key(i.area));
    return { area: i.area, before: i.condition, after: after?.condition, worse: !!after && RANK[after.condition] > RANK[i.condition] };
  });
  for (const i of out.values()) rows.push({ area: i.area, before: undefined, after: i.condition, worse: false });
  return rows;
}

export interface InspectionDraft {
  inspectedOn: string;
  inspectorName: string;
  notes: string;
  items: { area: string; condition: ItemCondition; note: string; photoUploadIds: string[] }[];
}

/**
 * The form's starting point: the saved inspection, else the move-in areas (for a move-out),
 * else the default checklist — every area "Good" until someone says otherwise.
 */
export function draftFromInspection(saved: Inspection | undefined, today: string, moveInItems?: readonly InspectionItem[]): InspectionDraft {
  if (saved) {
    return {
      inspectedOn: saved.inspectedOn,
      inspectorName: saved.inspectorName ?? '',
      notes: saved.notes ?? '',
      items: saved.items.map((i) => ({ area: i.area, condition: i.condition, note: i.note ?? '', photoUploadIds: [...i.photoUploadIds] })),
    };
  }
  const areas = moveInItems?.length ? moveInItems.map((i) => i.area) : [...DEFAULT_AREAS];
  return {
    inspectedOn: today,
    inspectorName: '',
    notes: '',
    items: areas.map((area) => ({ area, condition: 'GOOD', note: '', photoUploadIds: [] })),
  };
}

export const inspectionKeys = (tenancyId: string) => ['tenancies', tenancyId, 'inspections'] as const;
