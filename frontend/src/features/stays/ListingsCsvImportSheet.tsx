import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { derivePropertyCode } from '../../lib/csv';
import { formatKES } from '../../lib/money';
import { CsvImportSheet } from '../../components/CsvImportSheet';
import type { CsvImportResult, CsvPreviewColumn, CsvRowOutcome } from '../../components/CsvImportSheet';
import { keys, portfolioErrorMessage, usePropertyOptions } from '../portfolio/api';
import type { Property } from '../portfolio/types';
import { staysErrorMessage, staysKeys } from './api';
import {
  LISTING_CSV_COLUMNS,
  LISTING_CSV_HEADERS,
  LISTING_CSV_SAMPLE_ROWS,
  type ListingCsvData,
  listingPayload,
  validateListingCsvRow,
} from './listingsCsv';
import type { Listing } from './types';

const PREVIEW_COLUMNS: CsvPreviewColumn[] = [
  { key: 'property', label: 'Property' },
  { key: 'unit', label: 'Unit' },
  { key: 'title', label: 'Listing' },
  { key: 'nightly', label: 'Per night', numeric: true },
];

/**
 * Host import: one CSV row = one listing (unit + nightly price) in a property. Missing
 * properties are created; a unit that already exists (e.g. from the landlord portfolio
 * import) becomes the listing. Photos are added per listing afterwards.
 */
export function ListingsCsvImportSheet({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const properties = usePropertyOptions();

  const validateRow = (row: Parameters<typeof validateListingCsvRow>[0], _i: number, all: Parameters<typeof validateListingCsvRow>[1]) => {
    const res = validateListingCsvRow(row, all);
    if (!res.ok) return res;
    return { ...res, cells: { ...res.cells, nightly: formatKES(Number(res.data.nightlyMinor)) } };
  };

  const executeImport = async (
    items: { rowNumber: number; data: ListingCsvData }[],
    onProgress: (done: number, total: number) => void,
  ): Promise<CsvImportResult> => {
    const existing = properties.data?.data ?? [];
    const byCode = new Map(existing.map((p) => [p.code.toUpperCase(), p]));
    const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]));
    const takenCodes = new Set(existing.map((p) => p.code.toUpperCase()));
    const rowResults: Record<number, CsvRowOutcome> = {};
    let createdProperties = 0;
    let createdListings = 0;
    let done = 0;

    const ensureProperty = async (d: ListingCsvData): Promise<Property> => {
      const known = (d.propertyCode && byCode.get(d.propertyCode)) || byName.get(d.propertyName.toLowerCase());
      if (known) return known;
      const code = d.propertyCode || derivePropertyCode(d.propertyName, takenCodes);
      takenCodes.add(code);
      const created = (
        await api.post<DataEnvelope<Property>>('/properties', {
          name: d.propertyName,
          code,
          location: d.location || undefined,
          county: d.county || undefined,
        })
      ).data;
      byCode.set(created.code.toUpperCase(), created);
      byName.set(created.name.toLowerCase(), created);
      createdProperties += 1;
      return created;
    };

    for (const { rowNumber, data } of items) {
      let prop: Property | null = null;
      try {
        prop = await ensureProperty(data);
      } catch (err) {
        rowResults[rowNumber] = { status: 'error', message: portfolioErrorMessage(err) };
      }
      if (prop) {
        try {
          await api.post<DataEnvelope<Listing>>('/host/listings', listingPayload(data, prop.id));
          createdListings += 1;
          rowResults[rowNumber] = {
            status: 'imported',
            message: data.published ? 'Listing created and published' : 'Listing created (unpublished)',
          };
        } catch (err) {
          rowResults[rowNumber] = { status: 'error', message: staysErrorMessage(err) };
        }
      }
      done += 1;
      onProgress(done, items.length);
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: staysKeys.listings }),
      queryClient.invalidateQueries({ queryKey: staysKeys.calendar }),
      queryClient.invalidateQueries({ queryKey: keys.properties }),
      queryClient.invalidateQueries({ queryKey: keys.units }),
    ]);

    const parts: string[] = [];
    if (createdListings > 0) parts.push(`${createdListings} ${createdListings === 1 ? 'listing' : 'listings'}`);
    if (createdProperties > 0) {
      parts.push(`${createdProperties} new ${createdProperties === 1 ? 'property' : 'properties'}`);
    }
    const summaryMessage =
      parts.length > 0
        ? `Imported ${parts.join(' and ')}. Add photos to each listing before publishing.`
        : 'No rows were imported.';
    return { importedCount: createdListings, summaryMessage, rowResults };
  };

  return (
    <CsvImportSheet
      title="Import listings CSV"
      subtitle="Add your stays in one go: one row per listing, with its property and nightly price. Missing properties are created; a unit that already exists becomes the listing. Add photos to each listing afterwards."
      sampleFilename="kodihub-listings-template.csv"
      sampleHeaders={LISTING_CSV_HEADERS}
      sampleRows={LISTING_CSV_SAMPLE_ROWS}
      columns={LISTING_CSV_COLUMNS}
      previewColumns={PREVIEW_COLUMNS}
      validateRow={validateRow}
      executeImport={executeImport}
      loadingContext={properties.isPending}
      onClose={onClose}
    />
  );
}
