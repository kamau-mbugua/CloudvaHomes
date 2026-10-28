import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Matches, ValidateBy } from 'class-validator';
import { isQuantity, PERIOD } from './billing-math.js';

/** DTO decorator: a billing month, "2026-10". */
export function IsPeriod(opts: { optional?: boolean } = {}) {
  const doc = { example: '2026-10', description: 'Billing month YYYY-MM' };
  return applyDecorators(
    opts.optional ? ApiPropertyOptional(doc) : ApiProperty(doc),
    Matches(PERIOD, { message: '$property must be a month like 2026-10' }),
  );
}

/** DTO decorator: a non-negative decimal string with up to 3 places ("120.5"). */
export function IsQuantity(opts: { optional?: boolean; description?: string } = {}) {
  const doc = { type: 'string' as const, example: '120.500', description: opts.description };
  return applyDecorators(
    opts.optional ? ApiPropertyOptional(doc) : ApiProperty(doc),
    ValidateBy({
      name: 'isQuantity',
      validator: {
        validate: isQuantity,
        defaultMessage: () => '$property must be a number with up to 3 decimals, as text',
      },
    }),
  );
}
