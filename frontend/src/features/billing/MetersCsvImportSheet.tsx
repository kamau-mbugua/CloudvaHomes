import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { getCell, normalizePeriodCell } from '../../lib/csv';
import type { ParsedCsvRow } from '../../lib/csv';
import { parseAmount } from '../../lib/money';
import { currentPeriod } from '../../lib/periods';
import { formatQuantity, parseQuantity, trimQuantity } from '../../lib/quantity';
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
import type { ChargeType, Meter } from './types';

/**
 * Meters & Readings CSV Import:
 * Supports importing:
 *  - Meters only (`property`, `unit_number`, `charge_name`, `serial_no`, `initial_reading`)
 *  - Monthly meter readings for existing meters (`unit_number` or `serial_no`, `period`, `previous_reading`, `current_reading`, `note`)
 *  - Or BOTH in one onboarding CSV (creates the meter if missing, then records its reading for `period`).
 */

export interface MeterCsvRowData {
  property: Property;
  unit: Unit;
  chargeName: string;
  unitRateMinor: number | null;
  unitLabel: string;
  serialNo: string;
  initialMilli: bigint | null;
  period: string;
  previousMilli: bigint | null;
  currentMilli: bigint | null;
  note: string;
}

const SAMPLE_HEADERS = [
  'property',
  'unit_number',
  'charge_name',
  'serial_no',
  'initial_reading',
  'period',
  'previous_reading',
  'current_reading',
  'note',
];

const buildSampleRows = (period: string) => [
  ['IVB', 'A1', 'Water', 'WTR-A1-001', '120', period, '120', '134.5', 'October reading'],
  ['IVB', 'A2', 'Water', 'WTR-A2-002', '85', period, '85', '94', 'October reading'],
  ['IVB', 'B1', 'Water', 'WTR-B1-003', '210.5', period, '210.5', '228.75', ''],
  ['IVB', 'G1', 'Water', 'WTR-G1-004', '50', '', '', '', 'Meter setup only (no reading yet)'],
];

const COLUMNS: CsvColumnSpec[] = [
  {
    name: 'property',
    description: 'Property code (e.g. IVB) or name. Optional if a property is already selected on the page.',
    example: 'IVB',
  },
  {
    name: 'unit_number',
    required: true,
    description: 'Unit / house number where the meter is installed (e.g. A1).',
    example: 'A1',
  },
  {
    name: 'charge_name',
    description: 'Metered charge name (e.g. Water, Power). Optional if a charge is already selected.',
    example: 'Water',
  },
  {
    name: 'serial_no',
    description: 'Meter serial number (required when adding a new meter; optional when updating readings for an existing meter).',
    example: 'WTR-A1-001',
  },
  {
    name: 'initial_reading',
    description: 'Opening meter reading when registering a new meter (defaults to previous_reading or 0).',
    example: '120',
  },
  {
    name: 'period',
    description: 'Billing month in YYYY-MM (or MM/YYYY) format for readings. Defaults to the selected month.',
    example: '2026-10',
  },
  {
    name: 'previous_reading',
    description: 'Previous meter reading. Defaults to the meter’s last reading or initial_reading.',
    example: '120',
  },
  {
    name: 'current_reading',
    description: 'Current meter reading for the month. Leave blank if only importing meters without readings.',
    example: '134.5',
  },
  {
    name: 'note',
    description: 'Optional note for the reading.',
    example: 'Read by caretaker',
  },
];

const PREVIEW_COLUMNS: CsvPreviewColumn[] = [
  { key: 'unit', label: 'Unit & Charge' },
  { key: 'serial', label: 'Serial no.' },
  { key: 'initial', label: 'Initial', numeric: true },
  { key: 'reading', label: 'Reading (Prev → Curr)', numeric: true },
  { key: 'period', label: 'Period' },
];

export function MetersCsvImportSheet({
  defaultPropertyId,
  defaultChargeName,
  defaultPeriod,
  onClose,
}: {
  defaultPropertyId?: string;
  defaultChargeName?: string;
  defaultPeriod?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const activePeriod = defaultPeriod || currentPeriod();

  const propertiesQuery = usePropertyOptions(true);
  const unitsQuery = useQuery({
    queryKey: [...portfolioKeys.units, 'all-for-meters-csv'],
    queryFn: () => api.get<PageEnvelope<Unit>>('/units', { pageSize: OPTIONS_PAGE_SIZE }),
    staleTime: 30_000,
  });

  const allProperties = propertiesQuery.data?.data ?? [];
  const allUnits = unitsQuery.data?.data ?? [];
  const defaultProperty = allProperties.find((p) => p.id === defaultPropertyId);

  const loadingContext = propertiesQuery.isPending || unitsQuery.isPending;

  const validateRow = (row: ParsedCsvRow) => {
    const propRef = getCell(row, 'property', 'property_code', 'property_name');
    const unitNumber = getCell(row, 'unit_number', 'unit', 'house');
    const chargeName = getCell(row, 'charge_name', 'charge', 'metered_charge') || defaultChargeName || 'Water';
    const rateRaw = getCell(row, 'unit_rate', 'rate');
    const unitLabel = getCell(row, 'unit_label', 'uom');
    const serialNo = getCell(row, 'serial_no', 'serial', 'serial_number', 'meter_serial');
    const initialRaw = getCell(row, 'initial_reading', 'initial');
    const periodRaw = getCell(row, 'period', 'month');
    const previousRaw = getCell(row, 'previous_reading', 'previous', 'prev');
    const currentRaw = getCell(row, 'current_reading', 'current', 'reading');
    const note = getCell(row, 'note', 'notes');

    const matchedProp = propRef
      ? allProperties.find(
          (p) =>
            p.code.toLowerCase() === propRef.toLowerCase() ||
            p.name.toLowerCase() === propRef.toLowerCase(),
        )
      : defaultProperty ?? (allProperties.length === 1 ? allProperties[0] : undefined);

    const period = periodRaw ? normalizePeriodCell(periodRaw) : activePeriod;

    const cells = {
      unit: `${matchedProp ? matchedProp.code : propRef || '?'} · ${unitNumber || '?'} (${chargeName})`,
      serial: serialNo || 'Existing meter',
      initial: initialRaw || '—',
      reading: currentRaw ? `${previousRaw || 'auto'} → ${currentRaw}` : 'Meter only',
      period: currentRaw ? period || periodRaw || '—' : '—',
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

    if (!unitNumber) {
      return { ok: false as const, error: 'Missing unit_number.', cells };
    }

    const matchedUnit = allUnits.find(
      (u) =>
        u.property.id === matchedProp.id &&
        u.number.toLowerCase() === unitNumber.toLowerCase(),
    );
    if (!matchedUnit) {
      return {
        ok: false as const,
        error: `Unit "${unitNumber}" not found in ${matchedProp.code}.`,
        cells,
      };
    }

    if (!serialNo && !currentRaw) {
      return {
        ok: false as const,
        error: 'Provide serial_no (to add a meter) and/or current_reading (to record a reading).',
        cells,
      };
    }

    let initialMilli: bigint | null = null;
    if (initialRaw) {
      const parsed = parseQuantity(initialRaw);
      if (!parsed.ok) return { ok: false as const, error: `initial_reading: ${parsed.error}`, cells };
      initialMilli = parsed.milli;
    }

    let previousMilli: bigint | null = null;
    if (previousRaw) {
      const parsed = parseQuantity(previousRaw);
      if (!parsed.ok) return { ok: false as const, error: `previous_reading: ${parsed.error}`, cells };
      previousMilli = parsed.milli;
    }

    let currentMilli: bigint | null = null;
    if (currentRaw) {
      if (!period) {
        return { ok: false as const, error: 'period must be YYYY-MM (e.g. 2026-10).', cells };
      }
      const parsed = parseQuantity(currentRaw);
      if (!parsed.ok) return { ok: false as const, error: `current_reading: ${parsed.error}`, cells };
      currentMilli = parsed.milli;

      const effectivePrev = previousMilli ?? initialMilli;
      if (effectivePrev !== null && currentMilli < effectivePrev) {
        return {
          ok: false as const,
          error: 'current_reading cannot be lower than previous_reading.',
          cells,
        };
      }
    }

    let unitRateMinor: number | null = null;
    if (rateRaw) {
      const parsedRate = parseAmount(rateRaw);
      if (!parsedRate.ok) return { ok: false as const, error: `unit_rate: ${parsedRate.error}`, cells };
      unitRateMinor = parsedRate.minor;
    }

    return {
      ok: true as const,
      data: {
        property: matchedProp,
        unit: matchedUnit,
        chargeName,
        unitRateMinor,
        unitLabel,
        serialNo,
        initialMilli,
        period: period || activePeriod,
        previousMilli,
        currentMilli,
        note,
      },
      cells,
    };
  };

  const executeImport = async (
    items: { rowNumber: number; data: MeterCsvRowData }[],
    onProgress: (done: number, total: number) => void,
  ): Promise<CsvImportResult> => {
    const rowResults: Record<number, CsvRowOutcome> = {};

    // Cache metered charges and meters per propertyId
    const chargesByProperty = new Map<string, ChargeType[]>();
    const metersByProperty = new Map<string, Meter[]>();

    const getPropertyCharges = async (propertyId: string): Promise<ChargeType[]> => {
      const cached = chargesByProperty.get(propertyId);
      if (cached) return cached;
      const res = await api.get<DataEnvelope<ChargeType[]>>('/charge-types', {
        propertyId,
        kind: 'METERED',
      });
      chargesByProperty.set(propertyId, res.data);
      return res.data;
    };

    const getPropertyMeters = async (propertyId: string): Promise<Meter[]> => {
      const cached = metersByProperty.get(propertyId);
      if (cached) return cached;
      const res = await api.get<DataEnvelope<Meter[]>>('/meters', { propertyId });
      metersByProperty.set(propertyId, res.data);
      return res.data;
    };

    let createdMeters = 0;
    let savedReadings = 0;

    // Group readings to submit by period, while keeping track of which rowNumber each reading belongs to
    const pendingReadingsByPeriod = new Map<
      string,
      {
        rowNumber: number;
        meterId: string;
        previous: string;
        current: string;
        note?: string;
      }[]
    >();

    let done = 0;
    for (const item of items) {
      const { rowNumber, data } = item;
      try {
        const charges = await getPropertyCharges(data.property.id);
        let charge = charges.find(
          (c) => c.name.toLowerCase() === data.chargeName.toLowerCase(),
        );

        // If the metered charge doesn't exist yet and a unit_rate was given, create it automatically
        if (!charge && data.unitRateMinor !== null) {
          const createdCharge = await api.post<DataEnvelope<ChargeType>>('/charge-types', {
            propertyId: data.property.id,
            name: data.chargeName,
            kind: 'METERED',
            unitRate: data.unitRateMinor,
            unitLabel: data.unitLabel || undefined,
            unitIds: [],
          });
          charge = createdCharge.data;
          charges.push(charge);
        }

        if (!charge) {
          rowResults[rowNumber] = {
            status: 'error',
            message: `No metered charge "${data.chargeName}" on ${data.property.code}. Add it under Charges first.`,
          };
          done += 1;
          onProgress(done, items.length);
          continue;
        }

        const meters = await getPropertyMeters(data.property.id);
        let meter = meters.find(
          (m) =>
            (m.unit.id === data.unit.id && m.chargeType.id === charge.id) ||
            (data.serialNo && m.serialNo.toLowerCase() === data.serialNo.toLowerCase()),
        );

        if (!meter) {
          if (!data.serialNo) {
            rowResults[rowNumber] = {
              status: 'error',
              message: `Unit ${data.unit.number} has no meter for ${charge.name} yet; provide serial_no to add it.`,
            };
            done += 1;
            onProgress(done, items.length);
            continue;
          }
          const initialMilli = data.initialMilli ?? data.previousMilli ?? 0n;
          const createdMeter = await api.post<DataEnvelope<Meter>>('/meters', {
            unitId: data.unit.id,
            chargeTypeId: charge.id,
            serialNo: data.serialNo,
            initialReading: formatQuantity(initialMilli),
          });
          meter = createdMeter.data;
          meters.push(meter);
          createdMeters += 1;
        }

        if (data.currentMilli !== null) {
          // Determine previous reading if not explicitly provided
          let prevMilli = data.previousMilli ?? data.initialMilli;
          if (prevMilli === null) {
            const fallbackStr = meter.lastReading?.current ?? meter.initialReading ?? '0';
            const parsedFallback = parseQuantity(trimQuantity(fallbackStr) || '0');
            prevMilli = parsedFallback.ok ? parsedFallback.milli : 0n;
          }

          if (data.currentMilli < prevMilli) {
            rowResults[rowNumber] = {
              status: 'error',
              message: `Current reading is lower than previous reading (${trimQuantity(formatQuantity(prevMilli))}).`,
            };
          } else {
            const bucket = pendingReadingsByPeriod.get(data.period) ?? [];
            bucket.push({
              rowNumber,
              meterId: meter.id,
              previous: formatQuantity(prevMilli),
              current: formatQuantity(data.currentMilli),
              note: data.note || undefined,
            });
            pendingReadingsByPeriod.set(data.period, bucket);
          }
        } else {
          rowResults[rowNumber] = {
            status: 'imported',
            message: `Meter ${meter.serialNo} ready`,
          };
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

    // Submit readings batch per period
    for (const [period, entries] of pendingReadingsByPeriod.entries()) {
      try {
        await api.put('/meter-readings', {
          period,
          readings: entries.map((e) => ({
            meterId: e.meterId,
            previous: e.previous,
            current: e.current,
            note: e.note,
          })),
        });
        savedReadings += entries.length;
        for (const e of entries) {
          rowResults[e.rowNumber] = {
            status: 'imported',
            message: `Reading saved (${period})`,
          };
        }
      } catch (err) {
        const msg = billingErrorMessage(err);
        for (const e of entries) {
          rowResults[e.rowNumber] = {
            status: 'error',
            message: msg,
          };
        }
      }
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.meters }),
      queryClient.invalidateQueries({ queryKey: keys.readings }),
      queryClient.invalidateQueries({ queryKey: keys.chargeTypes }),
      queryClient.invalidateQueries({ queryKey: keys.runPreview }),
    ]);

    const parts: string[] = [];
    if (createdMeters > 0) {
      parts.push(`${createdMeters} ${createdMeters === 1 ? 'meter' : 'meters'} added`);
    }
    if (savedReadings > 0) {
      parts.push(`${savedReadings} ${savedReadings === 1 ? 'reading' : 'readings'} saved`);
    }
    const importedCount = Object.values(rowResults).filter((r) => r.status === 'imported').length;
    const summaryMessage =
      parts.length > 0 ? `${parts.join(' and ')}.` : 'No meters or readings were imported.';

    return { importedCount, summaryMessage, rowResults };
  };

  return (
    <CsvImportSheet
      title="Import meters & readings CSV"
      subtitle="Onboard unit meters and/or monthly meter readings in one CSV. Any meter that does not exist yet on a unit is created automatically before saving its reading."
      sampleFilename="kodihub-meters-readings-template.csv"
      sampleHeaders={SAMPLE_HEADERS}
      sampleRows={buildSampleRows(activePeriod)}
      columns={COLUMNS}
      previewColumns={PREVIEW_COLUMNS}
      validateRow={validateRow}
      executeImport={executeImport}
      loadingContext={loadingContext}
      onClose={onClose}
    />
  );
}
