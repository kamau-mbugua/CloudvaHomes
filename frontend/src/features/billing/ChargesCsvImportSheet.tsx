import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { getCell, splitListCell } from '../../lib/csv';
import type { ParsedCsvRow } from '../../lib/csv';
import { formatKES, parseAmount } from '../../lib/money';
import { CsvImportSheet } from '../../components/CsvImportSheet';
import type {
  CsvColumnSpec,
  CsvImportResult,
  CsvPreviewColumn,
  CsvRowOutcome,
} from '../../components/CsvImportSheet';
import {
  OPTIONS_PAGE_SIZE,
  keys as portfolioKeys,
  usePropertyOptions,
} from '../portfolio/api';
import type { Property, Unit } from '../portfolio/types';
import { billingErrorMessage, keys } from './api';
import type { ChargeKind, ChargeType, MoveInCharge, MoveInKind } from './types';

/**
 * Charges CSV Import:
 * Supports importing both Recurring charges (`FIXED`, `VARIABLE`, `METERED`) and
 * Move-in charges (`DEPOSIT`, `FEE`) across one or multiple properties in a single CSV.
 */

export type ChargeCsvRowData =
  | {
      category: 'RECURRING';
      property: Property;
      name: string;
      kind: ChargeKind;
      amountMinor: number | null;
      unitRateMinor: number | null;
      unitLabel: string;
      unitIds: string[];
    }
  | {
      category: 'MOVE_IN';
      property: Property;
      name: string;
      kind: MoveInKind;
      amountMinor: number | null;
      rentMonths: number | null;
      refundable: boolean;
    };

const SAMPLE_HEADERS = [
  'property',
  'name',
  'kind',
  'amount',
  'unit_rate',
  'unit_label',
  'units',
  'rent_months',
  'refundable',
];

const SAMPLE_ROWS = [
  ['IVB', 'Garbage', 'FIXED', '500', '', '', 'ALL', '', ''],
  ['IVB', 'Service Charge', 'FIXED', '2500', '', '', 'ALL', '', ''],
  ['IVB', 'Water', 'METERED', '', '150', 'm³', 'ALL', '', ''],
  ['IVB', 'Security Contribution', 'VARIABLE', '', '', '', 'ALL', '', ''],
  ['IVB', 'Rent Deposit', 'DEPOSIT', '', '', '', '', '1', 'yes'],
  ['IVB', 'Water Deposit', 'DEPOSIT', '2500', '', '', '', '', 'yes'],
  ['IVB', 'Lease Agreement Fee', 'FEE', '3000', '', '', '', '', 'no'],
];

const COLUMNS: CsvColumnSpec[] = [
  {
    name: 'property',
    description: 'Property code (e.g. IVB) or name. Optional if a property is already selected on the page.',
    example: 'IVB',
  },
  {
    name: 'name',
    required: true,
    description: 'Name of the charge (unique within the property).',
    example: 'Water',
  },
  {
    name: 'kind',
    required: true,
    description: 'FIXED, VARIABLE, or METERED (for recurring charges); DEPOSIT or FEE (for move-in charges).',
    example: 'METERED',
  },
  {
    name: 'amount',
    description: 'KES amount for FIXED recurring charges or fixed-amount DEPOSIT/FEE move-in charges.',
    example: '500',
  },
  {
    name: 'unit_rate',
    description: 'KES rate per unit consumed for METERED charges (e.g. 150 per m³).',
    example: '150',
  },
  {
    name: 'unit_label',
    description: 'Unit of measure for METERED charges (e.g. m³, kWh).',
    example: 'm³',
  },
  {
    name: 'units',
    description: 'ALL (or blank) for all units in the property, or semicolon-separated unit numbers (e.g. A1;A2).',
    example: 'ALL',
  },
  {
    name: 'rent_months',
    description: 'For DEPOSIT or FEE move-in charges based on months of rent (1–12).',
    example: '1',
  },
  {
    name: 'refundable',
    description: 'For move-in charges: yes or no (defaults to yes for DEPOSIT, no for FEE).',
    example: 'yes',
  },
];

const PREVIEW_COLUMNS: CsvPreviewColumn[] = [
  { key: 'property', label: 'Property' },
  { key: 'name', label: 'Charge' },
  { key: 'kind', label: 'Kind' },
  { key: 'rule', label: 'Rate / Amount', numeric: true },
  { key: 'scope', label: 'Applies to' },
];

export function ChargesCsvImportSheet({
  defaultPropertyId,
  onClose,
}: {
  defaultPropertyId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const propertiesQuery = usePropertyOptions(true);
  const unitsQuery = useQuery({
    queryKey: [...portfolioKeys.units, 'all-for-charges-csv'],
    queryFn: () => api.get<PageEnvelope<Unit>>('/units', { pageSize: OPTIONS_PAGE_SIZE }),
    staleTime: 30_000,
  });

  const loadingContext = propertiesQuery.isPending || unitsQuery.isPending;
  const allProperties = propertiesQuery.data?.data ?? [];
  const allUnits = unitsQuery.data?.data ?? [];
  const defaultProperty = allProperties.find((p) => p.id === defaultPropertyId);

  const validateRow = (row: ParsedCsvRow) => {
    const propRef = getCell(row, 'property', 'property_code', 'property_name');
    const name = getCell(row, 'name', 'charge_name', 'charge');
    const rawKind = getCell(row, 'kind', 'type', 'charge_kind').toUpperCase().replace(/[\s-]+/g, '_');
    const amountRaw = getCell(row, 'amount', 'monthly_amount', 'fixed_amount');
    const rateRaw = getCell(row, 'unit_rate', 'rate');
    const unitLabel = getCell(row, 'unit_label', 'measure', 'uom');
    const unitsRaw = getCell(row, 'units', 'applies_to');
    const rentMonthsRaw = getCell(row, 'rent_months', 'months');
    const refundableRaw = getCell(row, 'refundable').toLowerCase();

    const matchedProp = propRef
      ? allProperties.find(
          (p) =>
            p.code.toLowerCase() === propRef.toLowerCase() ||
            p.name.toLowerCase() === propRef.toLowerCase(),
        )
      : defaultProperty ?? (allProperties.length === 1 ? allProperties[0] : undefined);

    const cells = {
      property: matchedProp ? `${matchedProp.name} (${matchedProp.code})` : propRef || '—',
      name: name || '—',
      kind: rawKind || '—',
      rule: amountRaw || rateRaw || (rentMonthsRaw ? `${rentMonthsRaw} mo rent` : '—'),
      scope: 'All units',
    };

    if (!matchedProp) {
      return {
        ok: false as const,
        error: propRef
          ? `Property "${propRef}" not found.`
          : 'Choose a property or provide the "property" column.',
        cells,
      };
    }

    if (!name) {
      return { ok: false as const, error: 'Missing charge name.', cells };
    }

    const normalizedKind =
      rawKind === 'MOVE_IN_DEPOSIT'
        ? 'DEPOSIT'
        : rawKind === 'MOVE_IN_FEE'
          ? 'FEE'
          : rawKind;

    if (
      normalizedKind === 'FIXED' ||
      normalizedKind === 'VARIABLE' ||
      normalizedKind === 'METERED'
    ) {
      let amountMinor: number | null = null;
      let unitRateMinor: number | null = null;

      if (normalizedKind === 'FIXED') {
        if (!amountRaw) {
          return { ok: false as const, error: 'amount is required for FIXED charges.', cells };
        }
        const parsed = parseAmount(amountRaw);
        if (!parsed.ok) return { ok: false as const, error: `amount: ${parsed.error}`, cells };
        amountMinor = parsed.minor;
        cells.rule = `${formatKES(amountMinor)} / mo`;
      } else if (normalizedKind === 'METERED') {
        const rateInput = rateRaw || amountRaw;
        if (!rateInput) {
          return { ok: false as const, error: 'unit_rate is required for METERED charges.', cells };
        }
        const parsed = parseAmount(rateInput);
        if (!parsed.ok) return { ok: false as const, error: `unit_rate: ${parsed.error}`, cells };
        unitRateMinor = parsed.minor;
        cells.rule = `${formatKES(unitRateMinor)} / ${unitLabel || 'unit'}`;
      } else {
        cells.rule = 'Entered monthly';
      }

      const unitIds: string[] = [];
      if (unitsRaw && unitsRaw.toUpperCase() !== 'ALL') {
        const unitNumbers = splitListCell(unitsRaw);
        const propUnits = allUnits.filter((u) => u.property.id === matchedProp.id);
        for (const num of unitNumbers) {
          const foundUnit = propUnits.find((u) => u.number.toLowerCase() === num.toLowerCase());
          if (!foundUnit) {
            return {
              ok: false as const,
              error: `Unit "${num}" not found in ${matchedProp.code}.`,
              cells,
            };
          }
          unitIds.push(foundUnit.id);
        }
        cells.scope = `${unitIds.length} ${unitIds.length === 1 ? 'unit' : 'units'}`;
      }

      return {
        ok: true as const,
        data: {
          category: 'RECURRING' as const,
          property: matchedProp,
          name,
          kind: normalizedKind as ChargeKind,
          amountMinor,
          unitRateMinor,
          unitLabel,
          unitIds,
        },
        cells,
      };
    }

    if (normalizedKind === 'DEPOSIT' || normalizedKind === 'FEE') {
      let amountMinor: number | null = null;
      let rentMonths: number | null = null;

      if (rentMonthsRaw) {
        const m = Number(rentMonthsRaw);
        if (!/^\d+$/.test(rentMonthsRaw) || m < 1 || m > 12) {
          return { ok: false as const, error: 'rent_months must be 1 to 12.', cells };
        }
        rentMonths = m;
        cells.rule = `${m} ${m === 1 ? 'month' : 'months'}’ rent`;
      } else if (amountRaw) {
        const parsed = parseAmount(amountRaw);
        if (!parsed.ok) return { ok: false as const, error: `amount: ${parsed.error}`, cells };
        amountMinor = parsed.minor;
        cells.rule = formatKES(amountMinor);
      } else {
        return {
          ok: false as const,
          error: 'Provide either amount or rent_months for a move-in charge.',
          cells,
        };
      }

      const refundable = refundableRaw
        ? ['yes', 'true', '1', 'y'].includes(refundableRaw)
        : normalizedKind === 'DEPOSIT';

      cells.scope = `Move-in (${refundable ? 'refundable' : 'non-refundable'})`;

      return {
        ok: true as const,
        data: {
          category: 'MOVE_IN' as const,
          property: matchedProp,
          name,
          kind: normalizedKind as MoveInKind,
          amountMinor,
          rentMonths,
          refundable,
        },
        cells,
      };
    }

    return {
      ok: false as const,
      error: 'kind must be FIXED, VARIABLE, METERED, DEPOSIT, or FEE.',
      cells,
    };
  };

  const executeImport = async (
    items: { rowNumber: number; data: ChargeCsvRowData }[],
    onProgress: (done: number, total: number) => void,
  ): Promise<CsvImportResult> => {
    const rowResults: Record<number, CsvRowOutcome> = {};
    let createdRecurring = 0;
    let createdMoveIn = 0;
    let done = 0;

    for (const item of items) {
      const { rowNumber, data } = item;
      try {
        if (data.category === 'RECURRING') {
          const body: Record<string, unknown> = {
            propertyId: data.property.id,
            name: data.name,
            kind: data.kind,
            unitIds: data.unitIds,
          };
          if (data.kind === 'FIXED' && data.amountMinor !== null) {
            body.amount = data.amountMinor;
          }
          if (data.kind === 'METERED' && data.unitRateMinor !== null) {
            body.unitRate = data.unitRateMinor;
            if (data.unitLabel) body.unitLabel = data.unitLabel;
          }
          await api.post<DataEnvelope<ChargeType>>('/charge-types', body);
          createdRecurring += 1;
          rowResults[rowNumber] = { status: 'imported', message: 'Recurring charge added' };
        } else {
          const body: Record<string, unknown> = {
            propertyId: data.property.id,
            name: data.name,
            kind: data.kind,
            refundable: data.refundable,
            amount: data.amountMinor ?? undefined,
            rentMonths: data.rentMonths ?? undefined,
          };
          await api.post<DataEnvelope<MoveInCharge>>('/move-in-charges', body);
          createdMoveIn += 1;
          rowResults[rowNumber] = { status: 'imported', message: 'Move-in charge added' };
        }
      } catch (err) {
        rowResults[rowNumber] = {
          status: 'error',
          message: billingErrorMessage(err),
        };
      }
      done += 1;
      onProgress(done, items.length);
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.chargeTypes }),
      queryClient.invalidateQueries({ queryKey: keys.moveInCharges }),
      queryClient.invalidateQueries({ queryKey: keys.runPreview }),
    ]);

    const parts: string[] = [];
    if (createdRecurring > 0) {
      parts.push(`${createdRecurring} recurring ${createdRecurring === 1 ? 'charge' : 'charges'}`);
    }
    if (createdMoveIn > 0) {
      parts.push(`${createdMoveIn} move-in ${createdMoveIn === 1 ? 'charge' : 'charges'}`);
    }
    const importedCount = createdRecurring + createdMoveIn;
    const summaryMessage =
      parts.length > 0 ? `Imported ${parts.join(' and ')}.` : 'No charges were imported.';

    return { importedCount, summaryMessage, rowResults };
  };

  return (
    <CsvImportSheet
      title="Import charges CSV"
      subtitle="Import recurring charges (Fixed, Variable, Metered) and move-in charges (Deposits, Fees) across one or more properties."
      sampleFilename="kodihub-charges-template.csv"
      sampleHeaders={SAMPLE_HEADERS}
      sampleRows={SAMPLE_ROWS}
      columns={COLUMNS}
      previewColumns={PREVIEW_COLUMNS}
      validateRow={validateRow}
      executeImport={executeImport}
      loadingContext={loadingContext}
      onClose={onClose}
    />
  );
}
