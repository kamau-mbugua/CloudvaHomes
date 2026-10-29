import type { ApiFieldError, ErrorEnvelope } from './types';

import { singleFlight } from '../singleFlight';

/**
 * Thin fetch wrapper for /api/v1 — shaped after pos-react's src/lib/api/client.ts.
 *
 * Deliberately small: no interceptor stack and no general retry policy. Retries belong to
 * TanStack Query at the call site (and are switched off for mutations — see
 * queryClient.ts), because a generic retry here would re-post a payment.
 *
 * The two exceptions are both answers the server gives BEFORE doing anything, so
 * repeating the request cannot do the work twice:
 *
 * - `401 TOKEN_EXPIRED` → one shared refresh, then the request again, once.
 * - `403 STEP_UP_REQUIRED` on a write → the step-up prompt, then the request again, once,
 *   with `X-Step-Up`.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');

// ---------------------------------------------------------------- token

/**
 * In memory only — never localStorage. The refresh token lives in an httpOnly cookie the
 * server sets (scoped to /api/v1/auth), so a script on the page can read neither.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ---------------------------------------------------------------- step-up token

export interface StepUpGrant {
  stepUpToken: string;
  /** ISO timestamp. */
  expiresAt: string;
}

/** Reused for every write until it expires, so one code covers a burst of changes. */
let stepUpGrant: StepUpGrant | null = null;

/** Treat a grant as spent this long before its real expiry, to cover clock skew and latency. */
const STEP_UP_MARGIN_MS = 10_000;

export function setStepUpGrant(grant: StepUpGrant | null): void {
  stepUpGrant = grant;
}

/** The step-up token if one is still good at `now`, else null (and the stale one is dropped). */
export function currentStepUpToken(now = Date.now()): string | null {
  if (!stepUpGrant) return null;
  const expires = Date.parse(stepUpGrant.expiresAt);
  if (!Number.isFinite(expires) || expires - STEP_UP_MARGIN_MS <= now) {
    stepUpGrant = null;
    return null;
  }
  return stepUpGrant.stepUpToken;
}

// ---------------------------------------------------------------- auth hooks

export const TOKEN_EXPIRED = 'TOKEN_EXPIRED';
export const STEP_UP_REQUIRED = 'STEP_UP_REQUIRED';

export interface AuthHooks {
  /**
   * Get a new access token (and call `setAccessToken`). Resolves true on success; false or
   * a rejection means the session is gone.
   */
  refresh?: () => Promise<boolean>;
  /** The session could not be refreshed: clear it and send the person to sign in. */
  onAuthLost?: () => void;
  /**
   * Ask the person to re-verify. Resolves with a grant; rejects when they cancel, in which
   * case the original `STEP_UP_REQUIRED` error is what the caller sees.
   */
  stepUp?: (cause: ApiError) => Promise<StepUpGrant>;
}

const hooks: AuthHooks = {};

/** Installs (or, with `undefined`, removes) the handlers the retry logic calls. */
export function configureAuth(next: AuthHooks): void {
  Object.assign(hooks, next);
}

// Shared, so concurrent expired requests cause one refresh and concurrent writes needing
// step-up open one prompt.
const sharedRefresh = singleFlight(async () => (hooks.refresh ? hooks.refresh() : false));
const sharedStepUp = singleFlight(async (cause: ApiError) => {
  if (!hooks.stepUp) throw cause;
  return hooks.stepUp(cause);
});

// ---------------------------------------------------------------- errors

export const NETWORK_ERROR = 'NETWORK_ERROR';

/** `403 ORG_SUSPENDED` (phase 8): staff changes are refused until the Hodi bill is paid. */
export const ORG_SUSPENDED = 'ORG_SUSPENDED';

/**
 * What every screen says for `ORG_SUSPENDED`, whatever the server worded it as. Set on the
 * error itself (in `toApiError`), so each screen's own error helper — which falls back to
 * the error's message — shows it without knowing the code.
 */
export const ORG_SUSPENDED_MESSAGE =
  'Your organisation is read-only until its KodiHub bill is paid, so this change wasn’t saved. '
  + 'Tenants can still pay rent, and rent payments can still be recorded. '
  + 'Pay the bill under Settings → Plan & billing.';

export class ApiError extends Error {
  // Fields rather than constructor parameter properties: `erasableSyntaxOnly` rejects
  // the shorthand.
  readonly status: number;
  readonly code: string;
  readonly details: ApiFieldError[];
  readonly requestId: string | null;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    details?: ApiFieldError[];
    requestId?: string | null;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? [];
    this.requestId = init.requestId ?? null;
  }

  /** True when the request never reached the server (offline, DNS, proxy target down). */
  get isNetworkError(): boolean {
    return this.code === NETWORK_ERROR;
  }

  /** Per-field messages from a 422, keyed by field name (first message wins). */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const { field, message } of this.details) {
      if (!(field in out)) out[field] = message;
    }
    return out;
  }
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== 'object' || body === null) return false;
  const error = (body as { error?: unknown }).error;
  return (
    typeof error === 'object' && error !== null
    && typeof (error as { code?: unknown }).code === 'string'
    && typeof (error as { message?: unknown }).message === 'string'
  );
}

function cleanDetails(details: unknown): ApiFieldError[] {
  if (!Array.isArray(details)) return [];
  return details.filter(
    (d): d is ApiFieldError =>
      typeof d === 'object' && d !== null
      && typeof (d as ApiFieldError).field === 'string'
      && typeof (d as ApiFieldError).message === 'string',
  );
}

/**
 * Turn a failed response into an ApiError. Pure, so it is tested without a server.
 *
 * `body` is the parsed JSON, or `undefined` when the body was empty or not JSON (an HTML
 * error page from a proxy or load balancer). Those become `HTTP_<status>` — the caller
 * still gets a code it can branch on and a message it can show.
 */
export function toApiError(status: number, body: unknown, headerRequestId: string | null): ApiError {
  if (isErrorEnvelope(body)) {
    return new ApiError({
      status,
      code: body.error.code,
      message: body.error.code === ORG_SUSPENDED ? ORG_SUSPENDED_MESSAGE : body.error.message,
      details: cleanDetails(body.error.details),
      requestId: typeof body.requestId === 'string' ? body.requestId : headerRequestId,
    });
  }

  // An upload refused by a proxy or load balancer before it reached the API arrives
  // without our envelope. Give it the API's own codes so screens word it the same way.
  if (status === 413) {
    return new ApiError({
      status,
      code: 'FILE_TOO_LARGE',
      message: 'The file is too large to upload.',
      requestId: headerRequestId,
    });
  }
  if (status === 415) {
    return new ApiError({
      status,
      code: 'UNSUPPORTED_FILE',
      message: 'That kind of file cannot be uploaded.',
      requestId: headerRequestId,
    });
  }

  return new ApiError({
    status,
    code: `HTTP_${status}`,
    // 502–504 without our envelope means a proxy answered because the API did not.
    message: status >= 502 && status <= 504
      ? `The server is unavailable right now (HTTP ${status}). Try again shortly.`
      : status >= 500
        ? `The server could not complete the request (HTTP ${status}).`
        : `The request failed (HTTP ${status}).`,
    requestId: headerRequestId,
  });
}

// ---------------------------------------------------------------- request

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Extra headers, e.g. Idempotency-Key on a payment. */
  headers?: Record<string, string>;
  /**
   * Skip the refresh and step-up retries. For the auth endpoints themselves: a refresh
   * that answered 401 must not trigger another refresh.
   */
  skipAuthRetry?: boolean;
  /**
   * Treat a read like a write for step-up: send a still-valid step-up token, and on
   * `STEP_UP_REQUIRED` prompt and ask again once. For the few reads that decrypt
   * something (a bulk-payment file with bank details). Reads never prompt otherwise.
   */
  stepUp?: boolean;
  /**
   * `blob` resolves with the raw body (a PDF) instead of parsed JSON; `file` resolves with
   * the body and the file name the server gave (`Content-Disposition`). Errors are still
   * read as the usual JSON envelope.
   */
  responseType?: 'json' | 'blob' | 'file';
}

/** A downloaded file: the body and the name the server suggested, if any. */
export interface DownloadedFile {
  blob: Blob;
  filename: string | null;
}

/**
 * The file name in a `Content-Disposition` header: the RFC 5987 `filename*=UTF-8''…` form
 * first, then plain `filename="…"`. Any path is stripped. Null when there is none.
 */
export function filenameFromDisposition(header: string | null | undefined): string | null {
  if (!header) return null;
  let name: string | null = null;
  const extended = /filename\*\s*=\s*(?:[\w-]+)?'[^']*'([^;]+)/i.exec(header);
  if (extended) {
    try {
      name = decodeURIComponent(extended[1].trim().replace(/^"|"$/g, ''));
    } catch {
      name = null;
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
    if (plain) name = (plain[2] ?? plain[1]).trim();
  }
  if (!name) return null;
  const base = name.split(/[\\/]/).pop()?.trim() ?? '';
  return base || null;
}

export function buildUrl(path: string, query?: Query): string {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== '') params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * One request. Resolves with the parsed JSON body (`{ data }` or `{ data, meta }`), or
 * `undefined` for 204. Rejects ONLY with ApiError (or an AbortError the caller caused).
 *
 * Retries at most once per reason — see the file comment. A request that is refused again
 * after its retry fails with that second answer.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  // A GET marked `stepUp` gets the write treatment for step-up (and only for step-up).
  const isWrite = method !== 'GET' || options.stepUp === true;

  let refreshed = false;
  let steppedUp = false;
  let stepUpToken: string | null = null;

  for (;;) {
    // A write carries a still-valid step-up token unprompted, so a second sensitive
    // change inside the 5-minute window does not ask for another code.
    const sentStepUp = isWrite && !options.skipAuthRetry ? (stepUpToken ?? currentStepUpToken()) : null;

    try {
      return await send<T>(path, options, sentStepUp);
    } catch (caught) {
      if (!(caught instanceof ApiError) || options.skipAuthRetry) throw caught;

      if (caught.status === 401 && caught.code === TOKEN_EXPIRED && !refreshed) {
        refreshed = true;
        const ok = await sharedRefresh().catch(() => false);
        if (!ok) {
          hooks.onAuthLost?.();
          throw caught;
        }
        continue;
      }

      if (caught.status === 403 && caught.code === STEP_UP_REQUIRED && isWrite && !steppedUp) {
        steppedUp = true;
        // The token we sent was not accepted (expired early, or another session's).
        if (sentStepUp) setStepUpGrant(null);

        let grant: StepUpGrant;
        try {
          grant = await sharedStepUp(caught);
        } catch {
          // Cancelled or failed: the caller sees what the server originally said.
          throw caught;
        }
        setStepUpGrant(grant);
        stepUpToken = grant.stepUpToken;
        continue;
      }

      throw caught;
    }
  }
}

async function send<T>(path: string, options: RequestOptions, stepUpToken: string | null): Promise<T> {
  const { method = 'GET', body, query, signal, headers: extra, responseType = 'json' } = options;

  const headers: Record<string, string> = {
    Accept: responseType === 'json' ? 'application/json' : '*/*',
    ...extra,
  };
  // FormData sets its own Content-Type with the multipart boundary; setting it here
  // would drop the boundary and the server would parse nothing.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (stepUpToken) headers['X-Step-Up'] = stepUpToken;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
      signal,
      // The refresh cookie is httpOnly and path-scoped to /api/v1/auth; the browser only
      // attaches it when credentials are included.
      credentials: 'include',
    });
  } catch (cause) {
    // An abort is the caller's own decision, not a failure to report.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError({
      status: 0,
      code: NETWORK_ERROR,
      message: 'Cannot reach the server. Check your connection and try again.',
    });
  }

  if (response.status === 204) return undefined as T;

  if (responseType === 'blob' && response.ok) return (await response.blob()) as T;
  if (responseType === 'file' && response.ok) {
    const file: DownloadedFile = {
      blob: await response.blob(),
      filename: filenameFromDisposition(response.headers.get('content-disposition')),
    };
    return file as T;
  }

  const payload = await readJson(response);
  const requestId = response.headers.get('x-request-id');

  if (!response.ok) throw toApiError(response.status, payload, requestId);

  // A 2xx that is not JSON is not an answer from this API — most often the SPA's
  // index.html served because /api was not routed to the backend.
  if (payload === undefined) {
    throw new ApiError({
      status: response.status,
      code: `HTTP_${response.status}`,
      message: 'The server sent an unexpected response.',
      requestId,
    });
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
  /** A file (an invoice PDF) fetched with the same auth header, refresh and error handling. */
  blob: (path: string, query?: Query, signal?: AbortSignal) =>
    request<Blob>(path, { method: 'GET', query, signal, responseType: 'blob' }),
  /**
   * A file with the name the server gave it. `stepUp` for a download that needs a
   * verification code (it decrypts something); see `RequestOptions.stepUp`.
   */
  download: (path: string, query?: Query, opts: { stepUp?: boolean; signal?: AbortSignal } = {}) =>
    request<DownloadedFile>(path, { method: 'GET', query, signal: opts.signal, stepUp: opts.stepUp, responseType: 'file' }),
  /**
   * A multipart POST (a receipt or meter photo). Each field becomes a form part; a Blob or
   * File is sent as a file part with its name. Same auth header, refresh, step-up and
   * error handling as any write — a 413 or 415 rejects with an ApiError like the rest.
   */
  upload: <T>(path: string, fields: Record<string, string | Blob>, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body: toFormData(fields) }),
};

/** The parts of a multipart body, in the order given. Files keep their own name. */
export function toFormData(fields: Record<string, string | Blob>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === 'string') form.append(name, value);
    else form.append(name, value, value instanceof File ? value.name : 'upload');
  }
  return form;
}

/** Something safe to put in front of a person, whatever was thrown. */
export function errorMessage(caught: unknown): string {
  if (caught instanceof ApiError) {
    return caught.requestId && caught.status >= 500
      ? `${caught.message} (ref ${caught.requestId})`
      : caught.message;
  }
  return 'Something went wrong. Try again.';
}
