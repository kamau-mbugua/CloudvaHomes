import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError, NETWORK_ERROR, api, buildUrl, configureAuth, currentStepUpToken, errorMessage, setAccessToken,
  setStepUpGrant, toApiError,
} from './client';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
  setStepUpGrant(null);
  configureAuth({ refresh: undefined, onAuthLost: undefined, stepUp: undefined });
});

describe('toApiError', () => {
  it('reads the error envelope, including field details and requestId', () => {
    const error = toApiError(422, {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Check the highlighted fields.',
        details: [
          { field: 'email', message: 'Must be an email address' },
          { field: 'email', message: 'second message is ignored by fieldErrors' },
          { field: 'password', message: 'Required' },
        ],
      },
      requestId: 'req-123',
    }, 'header-id');

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Check the highlighted fields.');
    expect(error.details).toHaveLength(3);
    expect(error.requestId).toBe('req-123');
    expect(error.fieldErrors).toEqual({ email: 'Must be an email address', password: 'Required' });
  });

  it('falls back to the X-Request-Id header when the body has none', () => {
    const error = toApiError(404, { error: { code: 'NOT_FOUND', message: 'Not found' } }, 'hdr-9');
    expect(error.requestId).toBe('hdr-9');
    expect(error.details).toEqual([]);
  });

  it('drops malformed detail entries rather than trusting them', () => {
    const error = toApiError(422, {
      error: { code: 'VALIDATION_FAILED', message: 'Bad', details: [{ field: 'a' }, 'x', null, { field: 'b', message: 'ok' }] },
    }, null);
    expect(error.details).toEqual([{ field: 'b', message: 'ok' }]);
  });

  it('turns a non-envelope or non-JSON body into HTTP_<status>', () => {
    expect(toApiError(502, undefined, null).code).toBe('HTTP_502');
    expect(toApiError(400, { message: 'legacy shape' }, null).code).toBe('HTTP_400');
    expect(toApiError(500, { error: 'just a string' }, 'r1')).toMatchObject({ code: 'HTTP_500', requestId: 'r1' });
  });
});

describe('request', () => {
  it('returns the parsed envelope on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { data: { ok: true } })));
    await expect(api.get<{ data: { ok: boolean } }>('/health')).resolves.toEqual({ data: { ok: true } });
  });

  it('returns paginated envelopes untouched', async () => {
    const body = { data: [{ id: 1 }], meta: { page: 1, pageSize: 20, total: 1, pages: 1 } };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, body)));
    await expect(api.get('/units', { page: 1 })).resolves.toEqual(body);
  });

  it('throws ApiError with the envelope fields on a JSON error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, {
      error: { code: 'INVALID_CREDENTIALS', message: 'Wrong email or password.' },
      requestId: 'abc',
    })));

    const caught = await api.post('/auth/login', { identifier: 'x', password: 'y' }).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS', requestId: 'abc' });
  });

  it('throws HTTP_<status> for an HTML error page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html', 'X-Request-Id': 'gw-1' },
    })));

    const caught = await api.get('/anything').catch((e: unknown) => e);
    expect(caught).toMatchObject({ status: 502, code: 'HTTP_502', requestId: 'gw-1' });
  });

  it('throws HTTP_<status> for a 2xx that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 200 })));
    const caught = await api.get('/anything').catch((e: unknown) => e);
    expect(caught).toMatchObject({ code: 'HTTP_200' });
  });

  it('throws NETWORK_ERROR when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const caught = await api.get('/anything').catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ status: 0, code: NETWORK_ERROR, isNetworkError: true });
  });

  it('resolves undefined for 204', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(api.delete('/things/1')).resolves.toBeUndefined();
  });

  it('sends the bearer token only when one is set, and JSON-encodes bodies', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse(200, { data: null }));
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/me');
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBeUndefined();

    setAccessToken('tok-1');
    await api.post('/things', { a: 1 });
    const [url, init] = fetchMock.mock.calls[1];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('/api/v1/things');
    expect(headers.Authorization).toBe('Bearer tok-1');
    expect(headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });
});

describe('api.blob', () => {
  it('returns the raw body with the bearer token sent', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response('%PDF-1.7', {
      status: 200, headers: { 'Content-Type': 'application/pdf' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('tok-pdf');

    const blob = await api.blob('/invoices/i1/pdf');
    expect(await blob.text()).toBe('%PDF-1.7');
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe('Bearer tok-pdf');
  });

  it('still reads a JSON error envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'No such invoice.' } })));
    const caught = await api.blob('/invoices/x/pdf').catch((e: unknown) => e);
    expect(caught).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('api.upload', () => {
  it('posts multipart form data with the bearer token and no JSON content type', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse(201, {
      data: { id: 'up-1', purpose: 'EXPENSE_RECEIPT', contentType: 'image/png', size: 4, createdAt: '2026-10-27T08:00:00Z' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('tok-up');

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'receipt.png', { type: 'image/png' });
    const body = await api.upload<{ data: { id: string } }>('/uploads', { purpose: 'EXPENSE_RECEIPT', file });
    expect(body.data.id).toBe('up-1');

    const [url, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('/api/v1/uploads');
    expect(init.method).toBe('POST');
    expect(headers.Authorization).toBe('Bearer tok-up');
    // The browser must set multipart/form-data with its boundary itself.
    expect(headers['Content-Type']).toBeUndefined();
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('purpose')).toBe('EXPENSE_RECEIPT');
    const sent = form.get('file') as File;
    expect(sent.name).toBe('receipt.png');
    expect(sent.size).toBe(4);
  });

  it('rejects with the API code on a 415 envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(415, { error: { code: 'UNSUPPORTED_FILE', message: 'Only JPEG, PNG, WebP or PDF.' } })));
    const caught = await api.upload('/uploads', { purpose: 'METER_PHOTO', file: new Blob(['x']) }).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ status: 415, code: 'UNSUPPORTED_FILE' });
  });

  it('gives a bare 413 from a proxy the FILE_TOO_LARGE code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Request Entity Too Large</html>', {
      status: 413, headers: { 'Content-Type': 'text/html' },
    })));
    const caught = await api.upload('/uploads', { purpose: 'METER_PHOTO', file: new Blob(['x']) }).catch((e: unknown) => e);
    expect(caught).toMatchObject({ status: 413, code: 'FILE_TOO_LARGE' });
  });

  it('gives a bare 415 the UNSUPPORTED_FILE code', () => {
    expect(toApiError(415, undefined, null).code).toBe('UNSUPPORTED_FILE');
  });

  it('resends the same parts after a token refresh', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: 'Expired' } }))
      .mockResolvedValueOnce(jsonResponse(201, { data: { id: 'up-2' } }));
    vi.stubGlobal('fetch', fetchMock);
    configureAuth({ refresh: async () => { setAccessToken('tok-new'); return true; } });

    await api.upload('/uploads', { purpose: 'EXPENSE_RECEIPT', file: new File(['abc'], 'r.pdf', { type: 'application/pdf' }) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retried = fetchMock.mock.calls[1][1] as RequestInit;
    expect((retried.headers as Record<string, string>).Authorization).toBe('Bearer tok-new');
    expect(((retried.body as FormData).get('file') as File).name).toBe('r.pdf');
  });
});

describe('buildUrl', () => {
  it('prefixes the base and drops empty query values', () => {
    expect(buildUrl('units', { page: 2, q: '', status: null, active: true })).toBe('/api/v1/units?page=2&active=true');
  });
});

describe('errorMessage', () => {
  it('appends the request id to server errors so support can find the log line', () => {
    expect(errorMessage(toApiError(500, { error: { code: 'INTERNAL', message: 'Oops.' }, requestId: 'r-7' }, null)))
      .toBe('Oops. (ref r-7)');
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Try again.');
  });
});

// ---------------------------------------------------------------- auth retries

const expired = () => jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: 'Expired' } });
const stepUpNeeded = () => jsonResponse(403, { error: { code: 'STEP_UP_REQUIRED', message: 'Verify it is you' } });
const ok = (data: unknown = 'ok') => jsonResponse(200, { data });

type FetchInit = RequestInit & { headers: Record<string, string> };

/** A fetch whose answers depend on the bearer token, the step-up header and the path. */
function serverWith(answer: (url: string, init: FetchInit) => Response) {
  const fetchMock = vi.fn(async (url: string, init: FetchInit) => answer(url, init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

describe('refresh on TOKEN_EXPIRED', () => {
  it('refreshes once and retries the request once with the new token', async () => {
    setAccessToken('old');
    const fetchMock = serverWith((_url, init) => (init.headers.Authorization === 'Bearer new' ? ok('fresh') : expired()));
    const refresh = vi.fn(async () => { setAccessToken('new'); return true; });
    configureAuth({ refresh });

    await expect(api.get('/me')).resolves.toEqual({ data: 'fresh' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares ONE refresh between concurrent expired requests', async () => {
    setAccessToken('old');
    serverWith((_url, init) => (init.headers.Authorization === 'Bearer new' ? ok() : expired()));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const refresh = vi.fn(async () => { await gate; setAccessToken('new'); return true; });
    configureAuth({ refresh });

    const all = Promise.all([api.get('/a'), api.get('/b'), api.post('/c', {})]);
    // Let all three reach the refresh before it completes.
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();

    await expect(all).resolves.toHaveLength(3);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not loop: a second TOKEN_EXPIRED after the retry is returned to the caller', async () => {
    setAccessToken('old');
    const fetchMock = serverWith(() => expired());
    const refresh = vi.fn(async () => true);
    const onAuthLost = vi.fn();
    configureAuth({ refresh, onAuthLost });

    const caught = await api.get('/me').catch((e: unknown) => e);
    expect(caught).toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it('reports the session lost when the refresh fails, and throws the original error', async () => {
    setAccessToken('old');
    const fetchMock = serverWith(() => expired());
    const onAuthLost = vi.fn();
    configureAuth({ refresh: async () => { throw new ApiError({ status: 401, code: 'SESSION_REVOKED', message: 'x' }); }, onAuthLost });

    const caught = await api.get('/me').catch((e: unknown) => e);
    expect(caught).toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never refreshes for other 401s or for skipAuthRetry requests', async () => {
    serverWith((url) => (url.endsWith('/auth/login')
      ? jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Wrong' } })
      : expired()));
    const refresh = vi.fn(async () => true);
    configureAuth({ refresh });

    await expect(api.post('/auth/login', {})).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(api.post('/auth/refresh', {}, { skipAuthRetry: true })).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('sends cookies with every request', async () => {
    const fetchMock = serverWith(() => ok());
    await api.post('/auth/refresh', {});
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });
});

describe('step-up on STEP_UP_REQUIRED', () => {
  it('prompts, then retries the write once with X-Step-Up', async () => {
    const fetchMock = serverWith((_url, init) => (init.headers['X-Step-Up'] === 'su-1' ? ok('done') : stepUpNeeded()));
    const stepUp = vi.fn(async () => ({ stepUpToken: 'su-1', expiresAt: inAnHour() }));
    configureAuth({ stepUp });

    await expect(api.patch('/users/7', { roleId: 'r' })).resolves.toEqual({ data: 'done' });
    expect(stepUp).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe('{"roleId":"r"}');
  });

  it('rejects with the original error when the person cancels', async () => {
    const fetchMock = serverWith(() => stepUpNeeded());
    configureAuth({ stepUp: async () => { throw new Error('cancelled'); } });

    const caught = await api.delete('/users/7').catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ status: 403, code: 'STEP_UP_REQUIRED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries only once: a second refusal is returned', async () => {
    const fetchMock = serverWith(() => stepUpNeeded());
    const stepUp = vi.fn(async () => ({ stepUpToken: 'su-1', expiresAt: inAnHour() }));
    configureAuth({ stepUp });

    await expect(api.delete('/users/7')).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });
    expect(stepUp).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reuses a still-valid grant on later writes without prompting', async () => {
    const fetchMock = serverWith((_url, init) => (init.headers['X-Step-Up'] === 'su-1' ? ok() : stepUpNeeded()));
    const stepUp = vi.fn(async () => ({ stepUpToken: 'su-1', expiresAt: inAnHour() }));
    configureAuth({ stepUp });

    await api.patch('/roles/1', { permissions: [] });
    await api.delete('/users/2');
    expect(stepUp).toHaveBeenCalledTimes(1);
    // 2 for the first write, 1 for the second (sent with the cached token straight away).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers['X-Step-Up']).toBe('su-1');
  });

  it('drops an expired grant and never sends it on reads', async () => {
    setStepUpGrant({ stepUpToken: 'stale', expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(currentStepUpToken()).toBeNull();

    setStepUpGrant({ stepUpToken: 'su-9', expiresAt: inAnHour() });
    const fetchMock = serverWith(() => ok());
    await api.get('/users');
    expect(fetchMock.mock.calls[0][1].headers['X-Step-Up']).toBeUndefined();
  });

  it('forgets a rejected cached grant and prompts for a new one', async () => {
    setStepUpGrant({ stepUpToken: 'revoked', expiresAt: inAnHour() });
    serverWith((_url, init) => (init.headers['X-Step-Up'] === 'su-2' ? ok() : stepUpNeeded()));
    const stepUp = vi.fn(async () => ({ stepUpToken: 'su-2', expiresAt: inAnHour() }));
    configureAuth({ stepUp });

    await expect(api.delete('/users/3')).resolves.toEqual({ data: 'ok' });
    expect(stepUp).toHaveBeenCalledTimes(1);
    expect(currentStepUpToken()).toBe('su-2');
  });

  it('opens one prompt for concurrent writes', async () => {
    serverWith((_url, init) => (init.headers['X-Step-Up'] === 'su-1' ? ok() : stepUpNeeded()));
    const stepUp = vi.fn(async () => ({ stepUpToken: 'su-1', expiresAt: inAnHour() }));
    configureAuth({ stepUp });

    await Promise.all([api.delete('/users/1'), api.delete('/users/2')]);
    expect(stepUp).toHaveBeenCalledTimes(1);
  });

  it('never prompts for a read', async () => {
    serverWith(() => stepUpNeeded());
    const stepUp = vi.fn(async () => ({ stepUpToken: 'su-1', expiresAt: inAnHour() }));
    configureAuth({ stepUp });

    await expect(api.get('/secret')).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });
    expect(stepUp).not.toHaveBeenCalled();
  });

  it('handles an expired token and then a step-up in the same request', async () => {
    setAccessToken('old');
    const fetchMock = serverWith((_url, init) => {
      if (init.headers.Authorization !== 'Bearer new') return expired();
      return init.headers['X-Step-Up'] === 'su-1' ? ok('both') : stepUpNeeded();
    });
    configureAuth({
      refresh: async () => { setAccessToken('new'); return true; },
      stepUp: async () => ({ stepUpToken: 'su-1', expiresAt: inAnHour() }),
    });

    await expect(api.delete('/users/4')).resolves.toEqual({ data: 'both' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
