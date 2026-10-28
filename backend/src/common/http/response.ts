import { type PageMeta, type PaginationQueryDto, pageMeta } from './pagination.js';

export interface DataResponse<T> {
  data: T;
}

export interface PageResponse<T> {
  data: T[];
  meta: PageMeta;
}

/** Single resource: `{ data }`. Controllers return this rather than bare objects. */
export function ok<T>(data: T): DataResponse<T> {
  return { data };
}

/** List: `{ data, meta: { page, pageSize, total, pages } }`. */
export function paginated<T>(
  items: T[],
  total: number,
  q: Pick<PaginationQueryDto, 'page' | 'pageSize'>,
): PageResponse<T> {
  return { data: items, meta: pageMeta(total, q) };
}
