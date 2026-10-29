import { useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { useSession } from '../../lib/auth/useAuth';
import {
  derivePropertyCode,
  getCell,
  splitListCell,
} from '../../lib/csv';
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
  keys,
  portfolioErrorMessage,
  useCatalogue,
  useLandlordOptions,
  usePropertyOptions,
} from './api';
import { wholeNumber } from './forms';
import type { CatalogueItem, CodedRef, Property, Unit } from './types';

/**
 * Unified Portfolio CSV Import covering all 3 Portfolio areas in one flat sheet:
 *   1. Properties (`property_name`, `property_code`, `location`, `county`, `floors`, `landlord`)
 *   2. Unit setup (`unit_category`, `unit_type`, `unit_features`)
 *   3. Units (`unit_number`, `rent_amount`, `floor`, `size_sqft`, `description`)
 *
 * Rows sharing the same `property_code` or `property_name` reuse the same property (creating
 * it once if it does not exist yet). New categories, unit types, and features are created
 * automatically before the units are added.
 */

export interface PortfolioCsvRowData {
  propertyName: string;
  propertyCode: string;
  location: string;
  county: string;
  floors: number | null;
  landlordRef: string;
  unitNumber: string;
  rentMinor: number | null;
  unitFloor: number | null;
  sizeSqft: number | null;
  unitCategory: string;
  unitType: string;
  unitFeatures: string[];
  description: string;
}

const SAMPLE_HEADERS = [
  'property_name',
  'property_code',
  'location',
  'county',
  'floors',
  'unit_number',
  'rent_amount',
  'floor',
  'size_sqft',
  'unit_type',
  'unit_category',
  'unit_features',
  'description',
];

const SAMPLE_ROWS = [
  [
    'Ivory Breeze Apartments',
    'IVB',
    'Kilimani, Kindaruma Rd',
    'Nairobi',
    '5',
    'A1',
    '35000',
    '1',
    '950',
    '2 Bedroom',
    'Standard',
    'Balcony;Parking',
    'Front wing 2BR',
  ],
  [
    'Ivory Breeze Apartments',
    'IVB',
    'Kilimani, Kindaruma Rd',
    'Nairobi',
    '5',
    'A2',
    '35000',
    '1',
    '950',
    '2 Bedroom',
    'Standard',
    'Balcony;Parking',
    'Rear wing 2BR',
  ],
  [
    'Ivory Breeze Apartments',
    'IVB',
    'Kilimani, Kindaruma Rd',
    'Nairobi',
    '5',
    'B1',
    '55000',
    '2',
    '1400',
    '3 Bedroom',
    'Executive',
    'Balcony;Parking;En-suite;DSQ',
    'Corner executive unit',
  ],
  [
    'palm Gardens Court',
    'PGC',
    'Westlands, Rhapta Rd',
    'Nairobi',
    '4',
    'G1',
    '22000',
    '0',
    '520',
    '1 Bedroom',
    'Standard',
    'Parking',
    'Ground floor 1BR',
  ],
];

const COLUMNS: CsvColumnSpec[] = [
  {
    name: 'property_name',
    required: true,
    description: 'Name of the property (reused across all its units; created automatically if new).',
    example: 'Ivory Breeze Apartments',
  },
  {
    name: 'property_code',
    description: 'Short 2–10 char code (e.g. IVB). Auto-generated from property_name if left blank.',
    example: 'IVB',
  },
  {
    name: 'location',
    description: 'Street or neighbourhood for the property.',
    example: 'Kilimani, Kindaruma Rd',
  },
  {
    name: 'county',
    description: 'County where the property is located.',
    example: 'Nairobi',
  },
  {
    name: 'floors',
    description: 'Total number of floors in the property.',
    example: '5',
  },
  {
    name: 'landlord',
    description: 'For agencies only: landlord code (e.g. L00001) or exact name.',
    example: 'L00001',
  },
  {
    name: 'unit_number',
    description: 'Unit / house number (e.g. A1). Leave blank if importing a property without units yet.',
    example: 'A1',
  },
  {
    name: 'rent_amount',
    description: 'Monthly rent in KES (required when unit_number is given).',
    example: '35000',
  },
  {
    name: 'floor',
    description: 'Floor number of the unit (0 for ground floor).',
    example: '1',
  },
  {
    name: 'size_sqft',
    description: 'Size of the unit in square feet.',
    example: '950',
  },
  {
    name: 'unit_type',
    description: 'Unit type name (e.g. 1 Bedroom, 2 Bedroom, Studio). Auto-created if new.',
    example: '2 Bedroom',
  },
  {
    name: 'unit_category',
    description: 'Unit category name (e.g. Standard, Executive). Auto-created if new.',
    example: 'Executive',
  },
  {
    name: 'unit_features',
    description: 'Semicolon-separated unit features. Any new features are auto-created.',
    example: 'Balcony;Parking;En-suite',
  },
  {
    name: 'description',
    description: 'Optional notes or description for the unit.',
    example: 'Front wing 2BR',
  },
];

const PREVIEW_COLUMNS: CsvPreviewColumn[] = [
  { key: 'property', label: 'Property' },
  { key: 'unit', label: 'Unit' },
  { key: 'rent', label: 'Rent', numeric: true },
  { key: 'setup', label: 'Type / Category / Features' },
];

export function PortfolioCsvImportSheet({
  defaultProperty,
  onClose,
}: {
  defaultProperty?: CodedRef;
  onClose: () => void;
}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const isAgency = session.activeOrganization?.kind === 'AGENCY';

  const propertiesQuery = usePropertyOptions(true);
  const landlordsQuery = useLandlordOptions(isAgency);
  const categoriesQuery = useCatalogue('unit-categories');
  const typesQuery = useCatalogue('unit-types');
  const featuresQuery = useCatalogue('unit-features');

  const loadingContext =
    propertiesQuery.isPending ||
    (isAgency && landlordsQuery.isPending) ||
    categoriesQuery.isPending ||
    typesQuery.isPending ||
    featuresQuery.isPending;

  const existingProperties = propertiesQuery.data?.data ?? [];
  const existingLandlords = landlordsQuery.data?.data ?? [];

  const validateRow = (row: ParsedCsvRow, _index: number, allRows: ParsedCsvRow[]) => {
    const propertyName =
      getCell(row, 'property_name', 'property', 'building', 'name') ||
      defaultProperty?.name ||
      '';
    const rawCode =
      getCell(row, 'property_code', 'code') ||
      (defaultProperty && propertyName.toLowerCase() === defaultProperty.name.toLowerCase()
        ? defaultProperty.code
        : '');
    const propertyCode = rawCode.toUpperCase();
    const location = getCell(row, 'location', 'street', 'area');
    const county = getCell(row, 'county');
    const floorsRaw = getCell(row, 'floors', 'property_floors');
    const landlordRef = getCell(row, 'landlord', 'landlord_code', 'landlord_name');

    const unitNumber = getCell(row, 'unit_number', 'unit', 'number', 'house_number', 'house');
    const rentRaw = getCell(row, 'rent_amount', 'rent', 'monthly_rent', 'rent_kes');
    const unitFloorRaw = getCell(row, 'floor', 'unit_floor');
    const sizeRaw = getCell(row, 'size_sqft', 'size', 'sqft', 'size_sq_ft');
    const unitCategory = getCell(row, 'unit_category', 'category');
    const unitType = getCell(row, 'unit_type', 'type');
    const featuresRaw = getCell(row, 'unit_features', 'features');
    const unitFeatures = splitListCell(featuresRaw);
    const description = getCell(row, 'description', 'notes');

    const setupSummary = [
      unitType,
      unitCategory,
      unitFeatures.length > 0 ? unitFeatures.join(', ') : '',
    ]
      .filter(Boolean)
      .join(' · ');

    const cells = {
      property: propertyName
        ? `${propertyName}${propertyCode ? ` (${propertyCode})` : ''}`
        : '—',
      unit: unitNumber || 'Property only',
      rent: rentRaw || '—',
      setup: setupSummary || '—',
    };

    const hasCatalogueOnly = !propertyName && !unitNumber && Boolean(unitCategory || unitType || unitFeatures.length > 0);
    if (!propertyName && !hasCatalogueOnly) {
      return { ok: false as const, error: 'Missing property_name.', cells };
    }

    if (propertyCode && !/^[A-Z0-9]{2,10}$/.test(propertyCode)) {
      return {
        ok: false as const,
        error: 'property_code must be 2–10 letters or digits (e.g. IVB).',
        cells,
      };
    }

    const floors = wholeNumber(floorsRaw);
    if (Number.isNaN(floors)) {
      return { ok: false as const, error: 'floors must be a whole number.', cells };
    }

    const unitFloor = wholeNumber(unitFloorRaw);
    if (Number.isNaN(unitFloor)) {
      return { ok: false as const, error: 'floor must be a whole number.', cells };
    }

    const sizeSqft = wholeNumber(sizeRaw);
    if (Number.isNaN(sizeSqft)) {
      return { ok: false as const, error: 'size_sqft must be a whole number.', cells };
    }

    let rentMinor: number | null = null;
    if (unitNumber) {
      if (!rentRaw) {
        return { ok: false as const, error: 'rent_amount is required when unit_number is given.', cells };
      }
      const parsedRent = parseAmount(rentRaw);
      if (!parsedRent.ok) {
        return { ok: false as const, error: `rent_amount: ${parsedRent.error}`, cells };
      }
      rentMinor = parsedRent.minor;
      cells.rent = formatKES(rentMinor);

      // Check for duplicate unit_number within the same property inside the CSV itself
      const propKey = (propertyCode || propertyName).toLowerCase();
      const duplicateInFile = allRows.some((other) => {
        if (other.rowNumber >= row.rowNumber) return false;
        const otherProp = (
          getCell(other, 'property_code', 'code') ||
          getCell(other, 'property_name', 'property', 'building', 'name') ||
          defaultProperty?.name ||
          ''
        ).toLowerCase();
        const otherUnit = getCell(other, 'unit_number', 'unit', 'number', 'house_number', 'house').toLowerCase();
        return otherProp === propKey && otherUnit === unitNumber.toLowerCase();
      });
      if (duplicateInFile) {
        return {
          ok: false as const,
          error: `Duplicate unit "${unitNumber}" for this property in CSV.`,
          cells,
        };
      }
    }

    // If agency & creating a brand-new property, verify landlord can be resolved
    if (isAgency && propertyName) {
      const matchesExistingProp = existingProperties.some(
        (p) =>
          (propertyCode && p.code.toUpperCase() === propertyCode) ||
          p.name.toLowerCase() === propertyName.toLowerCase(),
      );
      if (!matchesExistingProp) {
        if (existingLandlords.length === 0) {
          return {
            ok: false as const,
            error: 'Add a landlord under Landlords first (agencies require a landlord per property).',
            cells,
          };
        }
        if (landlordRef) {
          const foundLandlord = existingLandlords.find(
            (l) =>
              l.code.toLowerCase() === landlordRef.toLowerCase() ||
              l.name.toLowerCase() === landlordRef.toLowerCase(),
          );
          if (!foundLandlord) {
            return {
              ok: false as const,
              error: `Landlord "${landlordRef}" not found. Use an existing landlord name or code.`,
              cells,
            };
          }
        }
      }
    }

    return {
      ok: true as const,
      data: {
        propertyName,
        propertyCode,
        location,
        county,
        floors,
        landlordRef,
        unitNumber,
        rentMinor,
        unitFloor,
        sizeSqft,
        unitCategory,
        unitType,
        unitFeatures,
        description,
      },
      cells,
    };
  };

  const executeImport = async (
    items: { rowNumber: number; data: PortfolioCsvRowData }[],
    onProgress: (done: number, total: number) => void,
  ): Promise<CsvImportResult> => {
    const rowResults: Record<number, CsvRowOutcome> = {};

    // Maps of lowercase name -> id for unit catalogue items
    const categoryMap = new Map<string, string>(
      (categoriesQuery.data ?? []).map((c) => [c.name.toLowerCase(), c.id]),
    );
    const typeMap = new Map<string, string>(
      (typesQuery.data ?? []).map((t) => [t.name.toLowerCase(), t.id]),
    );
    const featureMap = new Map<string, string>(
      (featuresQuery.data ?? []).map((f) => [f.name.toLowerCase(), f.id]),
    );

    // Maps of property code / lowercase name -> Property id
    const propByCode = new Map<string, Property>(
      existingProperties.map((p) => [p.code.toUpperCase(), p]),
    );
    const propByName = new Map<string, Property>(
      existingProperties.map((p) => [p.name.toLowerCase(), p]),
    );
    const takenCodes = new Set<string>(existingProperties.map((p) => p.code.toUpperCase()));

    let createdProperties = 0;
    let createdUnits = 0;
    let createdCatalogue = 0;

    // Helper to ensure a catalogue item exists
    const ensureCatalogueItem = async (
      kind: 'unit-categories' | 'unit-types' | 'unit-features',
      map: Map<string, string>,
      name: string,
    ): Promise<string | undefined> => {
      const trimmed = name.trim();
      if (!trimmed) return undefined;
      const key = trimmed.toLowerCase();
      const existing = map.get(key);
      if (existing) return existing;

      try {
        const res = await api.post<DataEnvelope<CatalogueItem>>(`/${kind}`, { name: trimmed });
        map.set(key, res.data.id);
        createdCatalogue += 1;
        return res.data.id;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NAME_TAKEN') {
          const refreshed = await api.get<DataEnvelope<CatalogueItem[]>>(`/${kind}`);
          for (const item of refreshed.data) {
            map.set(item.name.toLowerCase(), item.id);
          }
          return map.get(key);
        }
        throw err;
      }
    };

    // Helper to ensure a property exists
    const ensureProperty = async (d: PortfolioCsvRowData): Promise<Property> => {
      if (d.propertyCode) {
        const byCode = propByCode.get(d.propertyCode.toUpperCase());
        if (byCode) return byCode;
      }
      const byName = propByName.get(d.propertyName.toLowerCase());
      if (byName) return byName;

      const code = d.propertyCode
        ? d.propertyCode.toUpperCase()
        : derivePropertyCode(d.propertyName, takenCodes);
      takenCodes.add(code);

      const body: Record<string, unknown> = {
        name: d.propertyName,
        code,
        location: d.location || undefined,
        county: d.county || undefined,
        floors: d.floors ?? undefined,
      };

      if (isAgency) {
        const matchedLandlord = d.landlordRef
          ? existingLandlords.find(
              (l) =>
                l.code.toLowerCase() === d.landlordRef.toLowerCase() ||
                l.name.toLowerCase() === d.landlordRef.toLowerCase(),
            )
          : existingLandlords[0];
        if (matchedLandlord) {
          body.landlordId = matchedLandlord.id;
        }
      }

      const created = await api.post<DataEnvelope<Property>>('/properties', body);
      const prop = created.data;
      propByCode.set(prop.code.toUpperCase(), prop);
      propByName.set(prop.name.toLowerCase(), prop);
      createdProperties += 1;
      return prop;
    };

    let done = 0;
    for (const item of items) {
      const { rowNumber, data } = item;
      try {
        // 1. Ensure any referenced unit category, unit type, and features exist
        const categoryId = await ensureCatalogueItem('unit-categories', categoryMap, data.unitCategory);
        const unitTypeId = await ensureCatalogueItem('unit-types', typeMap, data.unitType);
        const featureIds: string[] = [];
        for (const feat of data.unitFeatures) {
          const fid = await ensureCatalogueItem('unit-features', featureMap, feat);
          if (fid) featureIds.push(fid);
        }

        // 2. Ensure property exists (if row has a property)
        let prop: Property | null = null;
        if (data.propertyName) {
          prop = await ensureProperty(data);
        }

        // 3. Create unit if unit_number is present
        if (data.unitNumber && prop && data.rentMinor !== null) {
          await api.post<DataEnvelope<Unit>>('/units', {
            propertyId: prop.id,
            number: data.unitNumber,
            rentAmount: data.rentMinor,
            floor: data.unitFloor ?? undefined,
            sizeSqft: data.sizeSqft ?? undefined,
            categoryId: categoryId || undefined,
            unitTypeId: unitTypeId || undefined,
            featureIds: featureIds.length > 0 ? featureIds : undefined,
            description: data.description || undefined,
          });
          createdUnits += 1;
          rowResults[rowNumber] = { status: 'imported', message: `Unit ${data.unitNumber} added` };
        } else if (prop) {
          rowResults[rowNumber] = { status: 'imported', message: `Property ${prop.code} ready` };
        } else {
          rowResults[rowNumber] = { status: 'imported', message: 'Setup saved' };
        }
      } catch (err) {
        rowResults[rowNumber] = {
          status: 'error',
          message: portfolioErrorMessage(err),
        };
      }
      done += 1;
      onProgress(done, items.length);
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.properties }),
      queryClient.invalidateQueries({ queryKey: keys.units }),
      queryClient.invalidateQueries({ queryKey: keys.landlords }),
      queryClient.invalidateQueries({ queryKey: keys.catalogue('unit-categories') }),
      queryClient.invalidateQueries({ queryKey: keys.catalogue('unit-types') }),
      queryClient.invalidateQueries({ queryKey: keys.catalogue('unit-features') }),
    ]);

    const parts: string[] = [];
    if (createdProperties > 0) {
      parts.push(`${createdProperties} ${createdProperties === 1 ? 'property' : 'properties'}`);
    }
    if (createdUnits > 0) {
      parts.push(`${createdUnits} ${createdUnits === 1 ? 'unit' : 'units'}`);
    }
    if (createdCatalogue > 0) {
      parts.push(`${createdCatalogue} unit setup ${createdCatalogue === 1 ? 'item' : 'items'}`);
    }
    const importedCount = Object.values(rowResults).filter((r) => r.status === 'imported').length;
    const summaryMessage =
      parts.length > 0
        ? `Imported ${parts.join(', ')}.`
        : importedCount > 0
          ? `Processed ${importedCount} portfolio ${importedCount === 1 ? 'row' : 'rows'}.`
          : 'No rows were imported.';

    return { importedCount, summaryMessage, rowResults };
  };

  return (
    <CsvImportSheet
      title="Import portfolio CSV (Properties, Units & Setup)"
      subtitle="Onboard properties, unit types, categories, features, and units in one flat CSV file. Missing properties, categories, types, and features are created automatically."
      sampleFilename="kodihub-portfolio-template.csv"
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
