import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { outbox } from '../senders.js';
import {
  createProviderSender,
  HostPinnacleSmsSender,
  ProviderError,
  TextSmsSender,
} from './sms-providers.js';
import type { Env } from '../../../config/env.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('TextSMS Kenya', () => {
  it('sends through TextSMS and returns its message id', async () => {
    fetchMock.mockResolvedValue(
      json({
        responses: [
          {
            'respose-code': 200,
            'response-description': 'Success',
            mobile: 254712345678,
            messageid: 8290842,
          },
        ],
      }),
    );
    await expect(
      new TextSmsSender('1234', 'key', 'MAKINI').send('+254712345678', 'Hi'),
    ).resolves.toEqual({
      messageId: '8290842',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://sms.textsms.co.ke/api/services/sendsms/');
    expect(JSON.parse(init.body as string)).toEqual({
      apikey: 'key',
      partnerID: '1234',
      message: 'Hi',
      shortcode: 'MAKINI',
      mobile: '254712345678',
    });
  });

  it('turns a TextSMS refusal into a plain reason', async () => {
    fetchMock.mockResolvedValue(
      json({
        responses: [{ 'respose-code': 1006, 'response-description': 'Invalid credentials' }],
      }),
    );
    await expect(new TextSmsSender('1', 'bad', null).send('+254712345678', 'Hi')).rejects.toThrow(
      new ProviderError('Invalid credentials'),
    );
  });
});

describe('HostPinnacle', () => {
  it('sends through HostPinnacle as a form with the key in a header', async () => {
    fetchMock.mockResolvedValue(json({ status: 'success', transactionId: 'abc123' }));
    await expect(
      new HostPinnacleSmsSender('user1', 'pw', 'key', 'MAKINI').send('+254712345678', 'Hi'),
    ).resolves.toEqual({
      messageId: 'abc123',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://smsportal.hostpinnacle.co.ke/SMSApi/send');
    expect((init.headers as Record<string, string>).apiKey).toBe('key');
    expect(Object.fromEntries((init.body as FormData).entries())).toEqual({
      userid: 'user1',
      password: 'pw',
      senderid: 'MAKINI',
      msg: 'Hi',
      mobile: '254712345678',
      sendMethod: 'quick',
      msgType: 'text',
      duplicatecheck: 'true',
      output: 'json',
    });
  });

  it('marks messages with emoji as unicode for HostPinnacle', async () => {
    fetchMock.mockResolvedValue(json({ status: 'success' }));
    await new HostPinnacleSmsSender('u', 'p', 'k', 'X').send('+254712345678', 'Karibu 🏠');
    expect((fetchMock.mock.calls[0]![1].body as FormData).get('msgType')).toBe('unicode');
  });

  it('turns a HostPinnacle refusal into a plain reason', async () => {
    // Real reply shape (HTTP 200 even for errors), observed 2026-11-08.
    fetchMock.mockResolvedValue(
      json({ status: 'error', statusCode: '216', reason: 'Invalid credentials' }),
    );
    await expect(
      new HostPinnacleSmsSender('u', 'p', 'k', 'X').send('+254712345678', 'Hi'),
    ).rejects.toThrow(new ProviderError('HostPinnacle rejected the user ID, password or API key.'));
    fetchMock.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    await expect(
      new HostPinnacleSmsSender('u', 'p', 'k', 'X').send('+254712345678', 'Hi'),
    ).rejects.toThrow('HostPinnacle refused the message (HTTP 401)');
  });
});

describe('HostPinnacle error codes (their api_error_codes list)', () => {
  const send = () => new HostPinnacleSmsSender('u', 'p', 'k', 'X').send('+254712345678', 'Hi');

  it('reads the reason even when the reply is not HTTP 200', async () => {
    fetchMock.mockResolvedValue(
      json(
        { status: 'error', statusCode: '159', reason: 'Insufficient Balance to send message.' },
        402,
      ),
    );
    await expect(send()).rejects.toThrow(
      new ProviderError('Your HostPinnacle account is out of SMS credit.'),
    );
  });

  it('puts the codes an owner can act on in plain words', async () => {
    const cases: [string, string][] = [
      ['216', 'HostPinnacle rejected the user ID, password or API key.'],
      ['217', 'The HostPinnacle account is not active.'],
      ['218', 'The HostPinnacle account has expired.'],
      ['190', 'Your HostPinnacle account is out of SMS credit.'],
      ['267', 'Your HostPinnacle account is out of SMS credit.'],
      ['162', 'The sender ID is missing.'],
      ['183', 'This HostPinnacle demo account can only send to approved numbers.'],
    ];
    for (const [code, reason] of cases) {
      fetchMock.mockResolvedValue(json({ status: 'error', statusCode: code, reason: 'raw' }));
      await expect(send()).rejects.toThrow(new ProviderError(reason));
    }
  });

  it('keeps HostPinnacle’s own words for other codes', async () => {
    fetchMock.mockResolvedValue(
      json({ status: 'error', statusCode: '177', reason: 'duplicate message' }),
    );
    await expect(send()).rejects.toThrow(new ProviderError('duplicate message'));
  });
});

describe('any provider', () => {
  it('reports an unreachable provider', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    await expect(new TextSmsSender('1', 'k', null).send('+254712345678', 'Hi')).rejects.toThrow(
      new ProviderError('Could not reach the SMS provider'),
    );
  });

  it('records sends in tests and can be told to reject', async () => {
    const env = { NODE_ENV: 'test' } as Env;
    const ok = createProviderSender(
      { provider: 'TEXTSMS', partnerId: '1', apiKey: 'ok', senderId: 'X' },
      env,
      'org:abc',
    );
    await ok.send('+254700000001', 'hello');
    expect(outbox.at(-1)).toMatchObject({
      channel: 'sms',
      to: '+254700000001',
      text: 'hello',
      via: 'org:abc',
    });
    const bad = createProviderSender(
      {
        provider: 'HOSTPINNACLE',
        userId: 'u',
        password: 'p',
        apiKey: 'test-reject',
        senderId: 'X',
      },
      env,
      'org:abc',
    );
    await expect(bad.send('+254700000001', 'hello')).rejects.toThrow(
      new ProviderError('The SMS provider rejected the API key'),
    );
  });
});
