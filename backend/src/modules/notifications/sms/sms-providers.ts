import type { Env } from '../../../config/env.js';
import { isGsm7 } from '../../tenant-portal/broadcast-rules.js';
import { AfricasTalkingSmsSender, LogSmsSender } from '../senders.js';
import type { SmsProviderConfig } from './sms-types.js';

/** A provider refused or could not take the message. `message` is a plain reason people can read. */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface ProviderSender {
  send(to: string, text: string): Promise<{ messageId: string | null }>;
}

const TIMEOUT_MS = 15_000;

/** Provider numbers are 2547XXXXXXXX: no plus sign. */
const msisdn = (to: string) => to.replace(/^\+/, '');

async function post(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ProviderError('Could not reach the SMS provider');
  }
}

/** A JSON scalar as text; anything else (objects, null) is treated as missing. */
function scalar(v: unknown): string | null {
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** TextSMS Kenya. https://textsms.co.ke/bulk-sms-api/ (note: their field is spelled `respose-code`). */
export class TextSmsSender implements ProviderSender {
  constructor(
    private readonly partnerId: string,
    private readonly apiKey: string,
    private readonly senderId: string | null,
  ) {}

  async send(to: string, text: string): Promise<{ messageId: string | null }> {
    const res = await post('https://sms.textsms.co.ke/api/services/sendsms/', {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        apikey: this.apiKey,
        partnerID: this.partnerId,
        message: text,
        shortcode: this.senderId ?? '',
        mobile: msisdn(to),
      }),
    });
    const body = await readJson(res);
    const first = (body?.responses as Record<string, unknown>[] | undefined)?.[0];
    if (!res.ok || !first)
      throw new ProviderError(`TextSMS refused the message (HTTP ${res.status})`);
    if (Number(first['respose-code']) !== 200) {
      throw new ProviderError(
        scalar(first['response-description']) ?? 'TextSMS refused the message',
      );
    }
    return { messageId: scalar(first.messageid) };
  }
}

/**
 * HostPinnacle error codes (their api_error_codes list) an owner can act on, in plain words.
 * Other codes keep HostPinnacle's own reason.
 */
const HOSTPINNACLE_REASONS: Record<string, string> = {
  '216': 'HostPinnacle rejected the user ID, password or API key.',
  '217': 'The HostPinnacle account is not active.',
  '218': 'The HostPinnacle account has expired.',
  '159': 'Your HostPinnacle account is out of SMS credit.',
  '190': 'Your HostPinnacle account is out of SMS credit.',
  '267': 'Your HostPinnacle account is out of SMS credit.',
  '162': 'The sender ID is missing.',
  '183': 'This HostPinnacle demo account can only send to approved numbers.',
};

/**
 * HostPinnacle, from their Postman collection. Errors come back as HTTP 200 with
 * {"status":"error","statusCode":"216","reason":"…"}, so only `status: success` counts as sent.
 * The request carries the account password: never log it.
 */
export class HostPinnacleSmsSender implements ProviderSender {
  constructor(
    private readonly userId: string,
    private readonly password: string,
    private readonly apiKey: string,
    private readonly senderId: string,
  ) {}

  async send(to: string, text: string): Promise<{ messageId: string | null }> {
    const form = new FormData();
    form.set('userid', this.userId);
    form.set('password', this.password);
    form.set('senderid', this.senderId);
    form.set('msg', text);
    form.set('mobile', msisdn(to));
    form.set('sendMethod', 'quick');
    form.set('msgType', isGsm7(text) ? 'text' : 'unicode');
    form.set('duplicatecheck', 'true');
    form.set('output', 'json');
    const res = await post('https://smsportal.hostpinnacle.co.ke/SMSApi/send', {
      headers: { apiKey: this.apiKey, Accept: 'application/json' },
      body: form,
    });
    // Errors may come back as HTTP 200 or as 4xx, always with {status, statusCode, reason}.
    const body = await readJson(res);
    if (!body) throw new ProviderError(`HostPinnacle refused the message (HTTP ${res.status})`);
    if (!res.ok || scalar(body.status)?.toLowerCase() !== 'success') {
      throw new ProviderError(
        HOSTPINNACLE_REASONS[scalar(body.statusCode) ?? ''] ??
          scalar(body.reason) ??
          scalar(body.message) ??
          `HostPinnacle refused the message (HTTP ${res.status})`,
      );
    }
    return {
      messageId: scalar(body.transactionId) ?? scalar(body.transactionid) ?? scalar(body.msgId),
    };
  }
}

/** Africa's Talking, wrapped so its errors read like every other provider's. */
class AfricasTalkingProvider implements ProviderSender {
  private readonly inner: AfricasTalkingSmsSender;
  constructor(c: Extract<SmsProviderConfig, { provider: 'AFRICASTALKING' }>) {
    this.inner = new AfricasTalkingSmsSender(
      c.username,
      c.apiKey,
      c.senderId ?? undefined,
      c.sandbox,
    );
  }

  async send(to: string, text: string): Promise<{ messageId: string | null }> {
    try {
      await this.inner.send(to, text);
      return { messageId: null };
    } catch (e) {
      throw new ProviderError(
        e instanceof Error ? e.message : 'Africa’s Talking refused the message',
      );
    }
  }
}

/** Tests: records the message under `via` (e.g. "platform", "org:<id>"); API key "test-reject" fails. */
class TestProvider implements ProviderSender {
  constructor(
    private readonly apiKey: string,
    private readonly via: string,
  ) {}

  async send(to: string, text: string): Promise<{ messageId: string | null }> {
    if (this.apiKey === 'test-reject')
      throw new ProviderError('The SMS provider rejected the API key');
    await new LogSmsSender(false, this.via).send(to, text);
    return { messageId: null };
  }
}

export function createProviderSender(
  config: SmsProviderConfig,
  env: Env,
  via: string,
): ProviderSender {
  if (env.NODE_ENV === 'test') return new TestProvider(config.apiKey, via);
  switch (config.provider) {
    case 'TEXTSMS':
      return new TextSmsSender(config.partnerId, config.apiKey, config.senderId);
    case 'HOSTPINNACLE':
      return new HostPinnacleSmsSender(
        config.userId,
        config.password,
        config.apiKey,
        config.senderId,
      );
    case 'AFRICASTALKING':
      return new AfricasTalkingProvider(config);
  }
}
