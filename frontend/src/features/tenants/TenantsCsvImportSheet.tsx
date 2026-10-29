import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
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
import { AFTER_INVOICE_KEYS } from '../billing/api';
import {
  OCCUPANCY_KEYS,
  OPTIONS_PAGE_SIZE,
  keys,
  portfolioErrorMessage,
  usePropertyOptions,
} from '../portfolio/api';
import { defaultBillingDay } from '../portfolio/labels';
import type { Tenancy, Tenant, Unit } from '../portfolio/types';

/**
 * Tenants & Houses CSV Import:
 * - Registers tenants (`first_name`, `last_name`, `phone`, `email`, `id_number`, `kra_pin`,
 *   `emergency_contact_name`, `emergency_contact_phone`, `notes`).
 * - Optionally moves each tenant into their house/unit in the same step when `unit_number`
 *   (and `property`) is filled in on the row (`move_in_date`, `rent_amount`, `billing_day`,
 *   `deposit_held`).
 */

export interface TenantCsvRowData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  idNumber: string;
  kraPin: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  notes: string;
  unit: Unit | null;
  startDate: string;
  rentMinor: number | null;
  billingDay: number;
  depositMinor: number | null;
}

const SAMPLE_HEADERS = [
  'first_name',
  'last_name',
  'phone',
  'email',
  'id_number',
  'kra_pin',
  'property',
  'unit_number',
  'move_in_date',
  'rent_amount',
  'billing_day',
  'deposit_held',
  'emergency_contact_name',
  'emergency_contact_phone',
  'notes',
];

const SAMPLE_ROWS = [
  [
    'Grace',
    'Wanjiku',
    '0712345678',
    'grace.wanjiku@example.com',
    '29481023',
    'A001234567B',
    'IVB',
    'A1',
    '2026-10-01',
    '35000',
    '5',
    '35000',
    'Peter Kamau',
    '0722111222',
    'Existing tenant onboarded with 1 month deposit held',
  ],
  [
    'David',
    'Omondi',
    '0723987654',
    'david.omondi@example.com',
    '31049281',
    '',
    'IVB',
    'A2',
    '2026-10-01',
    '',
    '1',
    '35000',
    '',
    '',
    'Uses unit default rent',
  ],
  [
    'Amina',
    'Hassan',
    '0733456789',
    'amina.hassan@example.com',
    '28391044',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'Prospect tenant (no house assigned yet)',
  ],
];

const COLUMNS: CsvColumnSpec[] = [
  {
    name: 'first_name',
    required: true,
    description: 'Tenant first name (or provide full_name and it will be split).',
    example: 'Grace',
  },
  {
    name: 'last_name',
    required: true,
    description: 'Tenant surname / last name.',
    example: 'Wanjiku',
  },
  {
    name: 'phone',
    required: true,
    description: 'Mobile phone number (unique per tenant; used for Paybill and sign-in).',
    example: '0712345678',
  },
  {
    name: 'email',
    description: 'Email address for invoices and portal invites.',
    example: 'grace@example.com',
  },
  {
    name: 'id_number',
    description: 'National ID or passport number (stored encrypted).',
    example: '29481023',
  },
  {
    name: 'kra_pin',
    description: 'KRA PIN number.',
    example: 'A001234567B',
  },
  {
    name: 'property',
    description: 'Optional property code (e.g. IVB) or property name where the house is located.',
    example: 'IVB',
  },
  {
    name: 'unit_number',
    description: 'Optional unit / house number (e.g. A1). When filled, moves the tenant into that vacant unit.',
    example: 'A1',
  },
  {
    name: 'move_in_date',
    description: 'Move-in date (YYYY-MM-DD or DD/MM/YYYY). Defaults to today when unit_number is given.',
    example: '2026-10-01',
  },
  {
    name: 'rent_amount',
    description: 'Monthly rent in KES. Defaults to the unit’s standard rent if left blank.',
    example: '35000',
  },
  {
    name: 'billing_day',
    description: 'Day of the month rent falls due (1–28). Defaults to the move-in day (or 1).',
    example: '5',
  },
  {
    name: 'deposit_held',
    description: 'Opening deposit already held in KES (for tenants who paid before onboarding).',
    example: '35000',
  },
  {
    name: 'emergency_contact_name',
    description: 'Emergency contact person’s name.',
    example: 'Peter Kamau',
  },
  {
    name: 'emergency_contact_phone',
    description: 'Emergency contact phone number.',
    example: '0722111222',
  },
  {
    name: 'notes',
    description: 'Optional notes on the tenant.',
    example: 'Transferred from previous spreadsheet',
  },
];

const PREVIEW_COLUMNS: CsvPreviewColumn[] = [
  { key: 'tenant', label: 'Tenant' },
  { key: 'phone', label: 'Phone' },
  { key: 'house', label: 'House / Unit' },
  { key: 'terms', label: 'Rent & Move-in', numeric: true },
];

export function TenantsCsvImportSheet({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const today = todayInNairobi();
  const [issueMoveInInvoice, setIssueMoveInInvoice] = useState(false);

  const propertiesQuery = usePropertyOptions(true);
  const unitsQuery = useQuery({
    queryKey: [...keys.units, 'all-for-csv-import'],
    queryFn: () => api.get<PageEnvelope<Unit>>('/units', { pageSize: OPTIONS_PAGE_SIZE }),
    staleTime: 30_000,
  });

  const loadingContext = propertiesQuery.isPending || unitsQuery.isPending;
  const allUnits = unitsQuery.data?.data ?? [];

  const validateRow = (row: ParsedCsvRow, _index: number, allRows: ParsedCsvRow[]) => {
    let firstName = getCell(row, 'first_name', 'firstname', 'given_name');
    let lastName = getCell(row, 'last_name', 'lastname', 'surname', 'family_name');
    const fullName = getCell(row, 'full_name', 'name', 'tenant_name');
    if ((!firstName || !lastName) && fullName) {
      const parts = fullName.split(/\s+/);
      if (!firstName) firstName = parts[0] ?? '';
      if (!lastName) lastName = parts.slice(1).join(' ') || parts[0] || '';
    }

    const phone = getCell(row, 'phone', 'phone_number', 'mobile', 'tel');
    const email = getCell(row, 'email', 'email_address');
    const idNumber = getCell(row, 'id_number', 'id', 'national_id', 'passport');
    const kraPin = getCell(row, 'kra_pin', 'pin');
    const emergencyContactName = getCell(row, 'emergency_contact_name', 'emergency_contact');
    const emergencyContactPhone = getCell(row, 'emergency_contact_phone', 'emergency_phone');
    const notes = getCell(row, 'notes', 'note');

    const propertyRef = getCell(row, 'property', 'property_code', 'property_name', 'building');
    const unitNumber = getCell(row, 'unit_number', 'unit', 'house', 'house_number');
    const moveInRaw = getCell(row, 'move_in_date', 'start_date', 'move_in');
    const rentRaw = getCell(row, 'rent_amount', 'rent', 'monthly_rent');
    const billingDayRaw = getCell(row, 'billing_day', 'due_day');
    const depositRaw = getCell(row, 'deposit_held', 'deposit', 'deposit_amount');

    const cells = {
      tenant: [firstName, lastName].filter(Boolean).join(' ') || '—',
      phone: phone || '—',
      house: unitNumber
        ? `${propertyRef ? `${propertyRef} · ` : ''}${unitNumber}`
        : 'Prospect (no house)',
      terms: '—',
    };

    if (!firstName) return { ok: false as const, error: 'Missing first_name.', cells };
    if (!lastName) return { ok: false as const, error: 'Missing last_name.', cells };
    if (!phone) return { ok: false as const, error: 'Missing phone number.', cells };

    // A tenant can occupy multiple units (in the same property or across different properties).
    // Only reject a duplicate phone in the same CSV when the row does not assign an additional unit.
    const normalizedPhone = phone.replace(/\s+/g, '');
    const dupPhone = allRows.some((other) => {
      if (other.rowNumber >= row.rowNumber) return false;
      const otherPhone = getCell(other, 'phone', 'phone_number', 'mobile', 'tel').replace(/\s+/g, '');
      return otherPhone !== '' && otherPhone === normalizedPhone;
    });
    if (dupPhone && !unitNumber) {
      return {
        ok: false as const,
        error: `Duplicate phone "${phone}" in this CSV without an additional unit_number to assign.`,
        cells,
      };
    }
    if (dupPhone && unitNumber) {
      cells.tenant = `${cells.tenant} (additional unit)`;
    }

    let matchedUnit: Unit | null = null;
    let startDate = today;
    let rentMinor: number | null = null;
    let billingDay = defaultBillingDay(today) ?? 1;
    let depositMinor: number | null = null;

    if (unitNumber) {
      // Find matching unit
      const candidates = allUnits.filter((u) => {
        if (u.number.toLowerCase() !== unitNumber.toLowerCase()) return false;
        if (!propertyRef) return true;
        return (
          u.property.code.toLowerCase() === propertyRef.toLowerCase() ||
          u.property.name.toLowerCase() === propertyRef.toLowerCase()
        );
      });

      if (candidates.length === 0) {
        return {
          ok: false as const,
          error: propertyRef
            ? `Unit "${unitNumber}" not found in "${propertyRef}".`
            : `Unit "${unitNumber}" not found. Import units first or check the number.`,
          cells,
        };
      }
      if (candidates.length > 1) {
        return {
          ok: false as const,
          error: `Unit "${unitNumber}" exists in multiple properties; fill the "property" column.`,
          cells,
        };
      }

      matchedUnit = candidates[0];
      cells.house = `${matchedUnit.property.code}-${matchedUnit.number}`;

      if (matchedUnit.status !== 'ACTIVE') {
        return {
          ok: false as const,
          error: `Unit ${matchedUnit.property.code}-${matchedUnit.number} is inactive.`,
          cells,
        };
      }
      if (matchedUnit.occupancy !== 'VACANT') {
        return {
          ok: false as const,
          error: `Unit ${matchedUnit.property.code}-${matchedUnit.number} is already occupied.`,
          cells,
        };
      }

      // Check duplicate unit assignment in the same CSV
      const dupUnit = allRows.some((other) => {
        if (other.rowNumber >= row.rowNumber) return false;
        const otherUnit = getCell(other, 'unit_number', 'unit', 'house', 'house_number');
        const otherProp = getCell(other, 'property', 'property_code', 'property_name', 'building');
        if (otherUnit.toLowerCase() !== unitNumber.toLowerCase()) return false;
        if (!otherProp || !propertyRef) return true;
        return otherProp.toLowerCase() === propertyRef.toLowerCase();
      });
      if (dupUnit) {
        return {
          ok: false as const,
          error: `Unit ${matchedUnit.property.code}-${matchedUnit.number} is assigned more than once in this CSV.`,
          cells,
        };
      }

      if (moveInRaw) {
        const normalized = normalizeDateCell(moveInRaw);
        if (!normalized) {
          return {
            ok: false as const,
            error: 'move_in_date must be YYYY-MM-DD or DD/MM/YYYY.',
            cells,
          };
        }
        startDate = normalized;
      }

      if (rentRaw) {
        const parsedRent = parseAmount(rentRaw);
        if (!parsedRent.ok) {
          return { ok: false as const, error: `rent_amount: ${parsedRent.error}`, cells };
        }
        rentMinor = parsedRent.minor;
      } else {
        rentMinor = matchedUnit.rentAmount;
      }

      if (billingDayRaw) {
        const bDay = Number(billingDayRaw);
        if (!/^\d+$/.test(billingDayRaw) || bDay < 1 || bDay > 28) {
          return { ok: false as const, error: 'billing_day must be between 1 and 28.', cells };
        }
        billingDay = bDay;
      } else {
        billingDay = defaultBillingDay(startDate) ?? 1;
      }

      if (depositRaw) {
        const parsedDep = parseAmount(depositRaw);
        if (!parsedDep.ok) {
          return { ok: false as const, error: `deposit_held: ${parsedDep.error}`, cells };
        }
        depositMinor = parsedDep.minor;
      }

      cells.terms = `${formatKES(rentMinor)} · ${startDate}`;
    }

    return {
      ok: true as const,
      data: {
        firstName,
        lastName,
        phone,
        email,
        idNumber,
        kraPin,
        emergencyContactName,
        emergencyContactPhone,
        notes,
        unit: matchedUnit,
        startDate,
        rentMinor,
        billingDay,
        depositMinor,
      },
      cells,
    };
  };

  const executeImport = async (
    items: { rowNumber: number; data: TenantCsvRowData }[],
    onProgress: (done: number, total: number) => void,
  ): Promise<CsvImportResult> => {
    const rowResults: Record<number, CsvRowOutcome> = {};
    const seenPhones = new Set<string>();
    let createdTenants = 0;
    let movedInCount = 0;

    let done = 0;
    for (const item of items) {
      const { rowNumber, data } = item;
      const normPhone = data.phone.replace(/\s+/g, '');
      try {
        if (!data.unit) {
          // Prospect tenant only (no unit move-in)
          await api.post<DataEnvelope<Tenant>>('/tenants', {
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            email: data.email || undefined,
            idNumber: data.idNumber || undefined,
            kraPin: data.kraPin || undefined,
            emergencyContactName: data.emergencyContactName || undefined,
            emergencyContactPhone: data.emergencyContactPhone || undefined,
            notes: data.notes || undefined,
          });
          seenPhones.add(normPhone);
          createdTenants += 1;
          rowResults[rowNumber] = { status: 'imported', message: 'Tenant registered' };
        } else {
          // Single-step move-in with inline tenant details.
          // Backend reuses the tenant if they already exist in this org (e.g. occupying
          // multiple units in the same property or across different properties), sending
          // Welcome only when brand-new to KodiHub and Unit Assigned for every house.
          await api.post<DataEnvelope<Tenancy>>('/tenancies', {
            unitId: data.unit.id,
            rentAmount: data.rentMinor ?? data.unit.rentAmount,
            billingDay: data.billingDay,
            startDate: data.startDate,
            depositHeld: data.depositMinor ?? undefined,
            issueMoveInInvoice,
            tenant: {
              firstName: data.firstName,
              lastName: data.lastName,
              phone: data.phone,
              email: data.email || undefined,
              idNumber: data.idNumber || undefined,
              kraPin: data.kraPin || undefined,
              emergencyContactName: data.emergencyContactName || undefined,
              emergencyContactPhone: data.emergencyContactPhone || undefined,
              notes: data.notes || undefined,
            },
          });
          if (!seenPhones.has(normPhone)) {
            seenPhones.add(normPhone);
            createdTenants += 1;
          }
          movedInCount += 1;
          rowResults[rowNumber] = {
            status: 'imported',
            message: `Moved into ${data.unit.property.code}-${data.unit.number}`,
          };
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

    await Promise.all(
      [...OCCUPANCY_KEYS, ...AFTER_INVOICE_KEYS].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

    const parts: string[] = [];
    if (createdTenants > 0) {
      parts.push(`${createdTenants} ${createdTenants === 1 ? 'tenant' : 'tenants'} registered`);
    }
    if (movedInCount > 0) {
      parts.push(`${movedInCount} moved into their units`);
    }
    const importedCount = Object.values(rowResults).filter((r) => r.status === 'imported').length;
    const summaryMessage =
      parts.length > 0 ? `${parts.join(', ')}.` : 'No tenants were imported.';

    return { importedCount, summaryMessage, rowResults };
  };

  return (
    <CsvImportSheet
      title="Import tenants & houses CSV"
      subtitle="Register tenants in bulk and optionally move them straight into their units when property and unit_number are included."
      sampleFilename="kodihub-tenants-template.csv"
      sampleHeaders={SAMPLE_HEADERS}
      sampleRows={SAMPLE_ROWS}
      columns={COLUMNS}
      previewColumns={PREVIEW_COLUMNS}
      validateRow={validateRow}
      executeImport={executeImport}
      loadingContext={loadingContext}
      extraControls={
        <label className="fld__check">
          <input
            type="checkbox"
            checked={issueMoveInInvoice}
            onChange={(e) => setIssueMoveInInvoice(e.target.checked)}
          />
          Issue move-in invoices for tenants assigned to a unit (leave unchecked when onboarding existing tenants who already paid their move-in charges)
        </label>
      }
      onClose={onClose}
    />
  );
}
