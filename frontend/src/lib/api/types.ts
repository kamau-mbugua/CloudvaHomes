/**
 * Response envelopes from the Hodi API (docs/specs §4 — the backend's `ok()` and
 * `paginated()` helpers). Generated endpoint types (openapi-typescript) arrive with the
 * first real endpoints in phase 1; these are the shapes every endpoint shares.
 */

export interface DataEnvelope<T> {
  data: T;
}

export interface PageMeta {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface PageEnvelope<T> {
  data: T[];
  meta: PageMeta;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

/** `{ error: { code, message, details? }, requestId }` — every non-2xx JSON body. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: ApiFieldError[];
  };
  requestId?: string;
}
