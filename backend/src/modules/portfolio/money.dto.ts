import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

/** Largest amount accepted from clients: KES 10 billion, well inside JSON's exact integers. */
export const MAX_MINOR = 1_000_000_000_000;

/** DTO decorator for an amount in integer minor units (KES cents). */
export function IsMinorAmount(opts: { optional?: boolean; description?: string } = {}) {
  const doc = {
    type: 'integer' as const,
    example: 2500000,
    description: opts.description ?? 'Integer minor units (KES cents): 2500000 = KES 25,000.00',
  };
  return applyDecorators(
    opts.optional ? ApiPropertyOptional(doc) : ApiProperty(doc),
    IsInt({ message: '$property must be a whole number of cents' }),
    Min(0),
    Max(MAX_MINOR),
  );
}
