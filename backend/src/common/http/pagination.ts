import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/** `?page=&pageSize=` — 1-based. Extend it for list endpoints that add filters. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

/** Prisma `skip`/`take` for a validated pagination query. */
export function toSkipTake(q: Pick<PaginationQueryDto, 'page' | 'pageSize'>): {
  skip: number;
  take: number;
} {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function pageMeta(
  total: number,
  q: Pick<PaginationQueryDto, 'page' | 'pageSize'>,
): PageMeta {
  return {
    page: q.page,
    pageSize: q.pageSize,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / q.pageSize),
  };
}
