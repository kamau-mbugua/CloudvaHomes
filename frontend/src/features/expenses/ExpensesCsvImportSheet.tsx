import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { getCell, normalizeDateCell } from '../../lib/csv';
import type { ParsedCsvRow } from '../../lib/csv';
import { todayInNairobi } from '../../lib/dates';
import { formatKES, parseAmount } from '../../lib/money';
import { CsvImportSheet } from '../../components/CsvImportSheet';
import type {
  CsvColumnSpec,
  CsvImportResult,
  CsvPreviewColumn,
  CsvRowOutcome,
} from '../../components/CsvImportSheet';
import { usePropertyOptions } from '../portfolio/api';
import type { Property } from '../portfolio/types';
import { expensesErrorMessage, keys, reportKeys } from './api';
import { CATEGORY_KEYS, EXPENSE_CATEGORY } from './labels';
import type { ExpenseCategory } from './types';

/**
 * Expenses CSV Import:
 * Imports historical or monthly property expenses in bulk (`POST /expenses`).
 */

export interface ExpenseCsvRowData {
  property: Property;
  incurredOn: string;
  category: ExpenseCategory;
  name: string;
  amountMinor: number;
  payee: string;
  reference: string;
}

const SAMPLE_HEADERS = [
  'property',
  'date',
  'category',
  'name',
  'amount',
  'payee',
  'reference',
];

const buildSampleRows = (today: string) => [
  ['IVB', today, 'REPAIRS', 'Gate motor repair & servicing', '8500', 'QuickFix Technicians', 'QFT-1042'],
  ['IVB', today, 'SECURITY', 'Monthly night guard service', '24000', 'Shield Security Ltd', 'INV-8821'],
  ['IVB', today, 'CLEANING', 'Common area & staircase cleaning', '6000', 'Sparkle Cleaners', 'MPESA-SJ82KL9'],
  ['IVB', today, 'UTILITIES', 'Common area lighting token', '3500', 'KPLC', 'TOKEN-99102'],
];

const COLUMNS: CsvColumnSpec[] = [
  {
    name: 'property',
    description: 'Property code (e.g. IVB) or name. Optional if a property is already selected on the page.',
    example: 'IVB',
  },
  {
    name: 'date',
    required: true,
    description: 'Date paid or incurred (YYYY-MM-DD or DD/MM/YYYY). Cannot be in the future.',
    example: '2026-10-15',
  },
  {
    name: 'category',
    required: true,
    description: 'One of: REPAIRS, UTILITIES, SECURITY, CLEANING, SALARIES, TAXES, INSURANCE, MANAGEMENT, OTHER.',
    example: 'REPAIRS',
  },
  {
    name: 'name',
    required: true,
    description: 'What the expense was for (up to 200 characters).',
    example: 'Gate motor repair',
  },
  {
    name: 'amount',
    required: true,
    description: 'Amount in KES (greater than zero).',
    example: '8500',
  },
  {
    name: 'payee',
    description: 'Who was paid (vendor, contractor, or utility).',
    example: 'QuickFix Technicians',
  },
  {
    name: 'reference',
    description: 'M-Pesa code, receipt number, or invoice reference.',
    example: 'QFT-1042',
  },
];

const PREVIEW_COLUMNS: CsvPreviewColumn[] = [
  { key: 'date', label: 'Date' },
  { key: 'property', label: 'Property' },
  { key: 'category', label: 'Category' },
  { key: 'name', label: 'What for' },
  { key: 'amount', label: 'Amount', numeric: true },
];

function resolveCategory(raw: string): ExpenseCategory | null {
  const cleaned = raw.trim().toUpperCase();
  if (!cleaned) return null;
  if ((CATEGORY_KEYS as string[]).includes(cleaned)) {
    return cleaned as ExpenseCategory;
  }
  if (cleaned.includes('REPAIR') || cleaned.includes('MAINT')) return 'REPAIRS';
  if (cleaned.includes('UTIL')) return 'UTILITIES';
  if (cleaned.includes('SECUR') || cleaned.includes('GUARD')) return 'SECURITY';
  if (cleaned.includes('CLEAN') || cleaned.includes('GARBAGE')) return 'CLEANING';
  if (cleaned.includes('SALAR') || cleaned.includes('WAGE') || cleaned.includes('STAFF')) return 'SALARIES';
  if (cleaned.includes('TAX') || cleaned.includes('LEVY') || cleaned.includes('LEVIES') || cleaned.includes('RATES')) return 'TAXES';
  if (cleaned.includes('INSUR')) return 'INSURANCE';
  if (cleaned.includes('MANAGE') || cleaned.includes('AGENCY')) return 'MANAGEMENT';
  if (cleaned.includes('OTHER') || cleaned.includes('MISC')) return 'OTHER';
  return null;
}

export function ExpensesCsvImportSheet({
  defaultPropertyId,
  onClose,
}: {
  defaultPropertyId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const today = todayInNairobi();
  const propertiesQuery = usePropertyOptions(true);
  const allProperties = propertiesQuery.data?.data ?? [];
  const defaultProperty = allProperties.find((p) => p.id === defaultPropertyId);

  const validateRow = (row: ParsedCsvRow) => {
    const propRef = getCell(row, 'property', 'property_code', 'property_name');
    const dateRaw = getCell(row, 'date', 'incurred_on', 'incurred_date') || today;
    const categoryRaw = getCell(row, 'category', 'expense_category', 'type');
    const name = getCell(row, 'name', 'description', 'what_was_it_for', 'what_for');
    const amountRaw = getCell(row, 'amount', 'amount_kes', 'cost');
    const payee = getCell(row, 'payee', 'paid_to', 'vendor');
    const reference = getCell(row, 'reference', 'ref', 'receipt_no');

    const matchedProp = propRef
      ? allProperties.find(
          (p) =>
            p.code.toLowerCase() === propRef.toLowerCase() ||
            p.name.toLowerCase() === propRef.toLowerCase(),
        )
      : defaultProperty ?? (allProperties.length === 1 ? allProperties[0] : undefined);

    const category = resolveCategory(categoryRaw);
    const incurredOn = normalizeDateCell(dateRaw);

    const cells = {
      date: incurredOn || dateRaw || '—',
      property: matchedProp ? `${matchedProp.name} (${matchedProp.code})` : propRef || '—',
      category: category ? EXPENSE_CATEGORY[category].label : categoryRaw || '—',
      name: name || '—',
      amount: amountRaw || '—',
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

    if (!incurredOn) {
      return {
        ok: false as const,
        error: 'date must be YYYY-MM-DD or DD/MM/YYYY.',
        cells,
      };
    }

    if (incurredOn > today) {
      return {
        ok: false as const,
        error: 'date cannot be in the future.',
        cells,
      };
    }

    if (!category) {
      return {
        ok: false as const,
        error: `Unknown category "${categoryRaw}". Use REPAIRS, UTILITIES, SECURITY, CLEANING, SALARIES, TAXES, INSURANCE, MANAGEMENT, or OTHER.`,
        cells,
      };
    }

    if (!name) {
      return { ok: false as const, error: 'Missing expense name / description.', cells };
    }
    if (name.length > 200) {
      return { ok: false as const, error: 'name must be 200 characters or fewer.', cells };
    }

    if (!amountRaw) {
      return { ok: false as const, error: 'Missing amount.', cells };
    }
    const parsedAmount = parseAmount(amountRaw);
    if (!parsedAmount.ok) {
      return { ok: false as const, error: `amount: ${parsedAmount.error}`, cells };
    }
    if (parsedAmount.minor <= 0) {
      return { ok: false as const, error: 'amount must be greater than zero.', cells };
    }
    cells.amount = formatKES(parsedAmount.minor);

    return {
      ok: true as const,
      data: {
        property: matchedProp,
        incurredOn,
        category,
        name,
        amountMinor: parsedAmount.minor,
        payee,
        reference,
      },
      cells,
    };
  };

  const executeImport = async (
    items: { rowNumber: number; data: ExpenseCsvRowData }[],
    onProgress: (done: number, total: number) => void,
  ): Promise<CsvImportResult> => {
    const rowResults: Record<number, CsvRowOutcome> = {};
    let createdCount = 0;
    let done = 0;

    for (const item of items) {
      const { rowNumber, data } = item;
      try {
        await api.post('/expenses', {
          propertyId: data.property.id,
          category: data.category,
          name: data.name,
          amount: data.amountMinor,
          incurredOn: data.incurredOn,
          payee: data.payee || null,
          reference: data.reference || null,
        });
        createdCount += 1;
        rowResults[rowNumber] = { status: 'imported', message: 'Recorded' };
      } catch (err) {
        rowResults[rowNumber] = {
          status: 'error',
          message: expensesErrorMessage(err),
        };
      }
      done += 1;
      onProgress(done, items.length);
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.expenses }),
      queryClient.invalidateQueries({ queryKey: reportKeys }),
    ]);

    const summaryMessage =
      createdCount > 0
        ? `Recorded ${createdCount} ${createdCount === 1 ? 'expense' : 'expenses'}.`
        : 'No expenses were imported.';

    return {
      importedCount: createdCount,
      summaryMessage,
      rowResults,
    };
  };

  return (
    <CsvImportSheet
      title="Import expenses CSV"
      subtitle="Bulk-record property expenses from a CSV file."
      sampleFilename="kodihub-expenses-template.csv"
      sampleHeaders={SAMPLE_HEADERS}
      sampleRows={buildSampleRows(today)}
      columns={COLUMNS}
      previewColumns={PREVIEW_COLUMNS}
      validateRow={validateRow}
      executeImport={executeImport}
      loadingContext={propertiesQuery.isPending}
      onClose={onClose}
    />
  );
}
