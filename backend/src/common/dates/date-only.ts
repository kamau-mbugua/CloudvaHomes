import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ValidateBy } from 'class-validator';

/**
 * Calendar dates ("2026-10-01") travel as strings and live in `@db.Date` columns, which Prisma
 * maps to a Date at UTC midnight. Keep all date-only arithmetic in UTC so a server in any
 * timezone gets the same day.
 */
const DATE_ONLY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "2026-10-01" → Date (UTC midnight). Throws RangeError on impossible dates like 2026-02-30. */
export function parseDateOnly(text: string): Date {
  if (!DATE_ONLY.test(text)) throw new RangeError(`Not a date: "${text}"`);
  const d = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || formatDateOnly(d) !== text) {
    throw new RangeError(`Not a date: "${text}"`);
  }
  return d;
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatDateOnlyOrNull(d: Date | null): string | null {
  return d ? formatDateOnly(d) : null;
}

export function isDateOnly(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  try {
    parseDateOnly(text);
    return true;
  } catch {
    return false;
  }
}

/** DTO decorator: a real calendar date as YYYY-MM-DD. */
export function IsDateOnly(opts: { optional?: boolean; description?: string } = {}) {
  const doc = { example: '2026-11-01', format: 'date', description: opts.description };
  return applyDecorators(
    opts.optional ? ApiPropertyOptional(doc) : ApiProperty(doc),
    ValidateBy({
      name: 'isDateOnly',
      validator: {
        validate: isDateOnly,
        defaultMessage: () => '$property must be a real date like 2026-11-01',
      },
    }),
  );
}
