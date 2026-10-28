import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import type { DarajaCredentials } from './daraja.js';

export type DarajaEnvironment = 'SANDBOX' | 'PRODUCTION';

export interface DarajaTarget {
  /** Cache key for the OAuth token (the channel id). */
  key: string;
  environment: DarajaEnvironment;
  credentials: DarajaCredentials;
}

export interface StkPushRequest {
  businessShortCode: string;
  partyB: string;
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  amountKes: number; // whole shillings
  phone: string; // 2547…
  callbackUrl: string;
  accountReference: string; // ≤ 12 chars
  description: string; // ≤ 13 chars
  password: string;
  timestamp: string;
}

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
}

export interface StkQueryResult {
  /** null = Daraja is still processing it. */
  resultCode: string | null;
  resultDesc: string;
}

/** What Hodi needs from Daraja. Real and simulated implementations; tests supply their own. */
export abstract class DarajaClient {
  abstract stkPush(t: DarajaTarget, r: StkPushRequest): Promise<StkPushResult>;
  abstract stkQuery(
    t: DarajaTarget,
    q: {
      businessShortCode: string;
      password: string;
      timestamp: string;
      checkoutRequestId: string;
    },
  ): Promise<StkQueryResult>;
  abstract registerC2b(
    t: DarajaTarget,
    r: { shortCode: string; confirmationUrl: string; validationUrl: string },
  ): Promise<void>;
}

const BASE: Record<DarajaEnvironment, string> = {
  SANDBOX: 'https://sandbox.safaricom.co.ke',
  PRODUCTION: 'https://api.safaricom.co.ke',
};

const darajaError = (message: string) =>
  new AppError(502, 'DARAJA_ERROR', `M-Pesa said: ${message}`);

/** Calls Safaricom. OAuth tokens are cached per channel until shortly before they expire. */
@Injectable()
export class HttpDarajaClient extends DarajaClient {
  private readonly log = new Logger(HttpDarajaClient.name);
  private readonly tokens = new Map<string, { token: string; expires: number }>();

  private async token(t: DarajaTarget): Promise<string> {
    const cached = this.tokens.get(t.key);
    if (cached && cached.expires > Date.now()) return cached.token;
    const basic = Buffer.from(
      `${t.credentials.consumerKey}:${t.credentials.consumerSecret}`,
    ).toString('base64');
    const res = await fetch(
      `${BASE[t.environment]}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${basic}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) throw darajaError('the consumer key or secret was rejected');
    const body = (await res.json()) as { access_token: string; expires_in: string | number };
    this.tokens.set(t.key, {
      token: body.access_token,
      expires: Date.now() + (Number(body.expires_in) - 60) * 1000,
    });
    return body.access_token;
  }

  private async post<T>(t: DarajaTarget, path: string, payload: object): Promise<T> {
    const res = await fetch(`${BASE[t.environment]}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.token(t)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      // Never log the payload: it holds the STK password.
      this.log.warn({ path, status: res.status, errorCode: body.errorCode }, 'Daraja call failed');
      const said = [body.errorMessage, body.ResponseDescription].find((x) => typeof x === 'string');
      throw darajaError(typeof said === 'string' ? said : `HTTP ${res.status}`);
    }
    return body as T;
  }

  async stkPush(t: DarajaTarget, r: StkPushRequest): Promise<StkPushResult> {
    const body = await this.post<Record<string, string>>(t, '/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: r.businessShortCode,
      Password: r.password,
      Timestamp: r.timestamp,
      TransactionType: r.transactionType,
      Amount: r.amountKes,
      PartyA: r.phone,
      PartyB: r.partyB,
      PhoneNumber: r.phone,
      CallBackURL: r.callbackUrl,
      AccountReference: r.accountReference,
      TransactionDesc: r.description,
    });
    if (body.ResponseCode !== '0') throw darajaError(body.ResponseDescription ?? 'request refused');
    return {
      merchantRequestId: body.MerchantRequestID!,
      checkoutRequestId: body.CheckoutRequestID!,
    };
  }

  async stkQuery(
    t: DarajaTarget,
    q: {
      businessShortCode: string;
      password: string;
      timestamp: string;
      checkoutRequestId: string;
    },
  ): Promise<StkQueryResult> {
    try {
      const body = await this.post<Record<string, string>>(t, '/mpesa/stkpushquery/v1/query', {
        BusinessShortCode: q.businessShortCode,
        Password: q.password,
        Timestamp: q.timestamp,
        CheckoutRequestID: q.checkoutRequestId,
      });
      return {
        resultCode: body.ResultCode !== undefined ? String(body.ResultCode) : null,
        resultDesc: body.ResultDesc ?? '',
      };
    } catch (e) {
      // Daraja answers "still processing" with an error status.
      if (e instanceof AppError && /processed|processing/i.test(e.message)) {
        return { resultCode: null, resultDesc: 'Still processing' };
      }
      throw e;
    }
  }

  async registerC2b(
    t: DarajaTarget,
    r: { shortCode: string; confirmationUrl: string; validationUrl: string },
  ): Promise<void> {
    await this.post(t, '/mpesa/c2b/v1/registerurl', {
      ShortCode: r.shortCode,
      ResponseType: 'Completed',
      ConfirmationURL: r.confirmationUrl,
      ValidationURL: r.validationUrl,
    });
  }
}

/**
 * Behaves like Daraja without network calls (DARAJA_MODE=simulated, local dev). An STK push
 * "succeeds" after a few seconds: the simulator calls `onComplete`, which the STK service wires
 * to its own callback handler. Amounts ending in 1 shilling are "cancelled" (to try failures).
 */
@Injectable()
export class SimulatedDarajaClient extends DarajaClient {
  private readonly log = new Logger(SimulatedDarajaClient.name);
  private readonly results = new Map<string, StkQueryResult>();
  onComplete?: (checkoutRequestId: string, payload: unknown) => Promise<void>;
  delayMs = 4000;

  stkPush(_t: DarajaTarget, r: StkPushRequest): Promise<StkPushResult> {
    const checkoutRequestId = `ws_CO_SIM_${randomBytes(6).toString('hex')}`;
    const cancelled = r.amountKes % 10 === 1;
    const result = cancelled
      ? { resultCode: '1032', resultDesc: 'Request cancelled by user' }
      : { resultCode: '0', resultDesc: 'The service request is processed successfully.' };
    setTimeout(() => {
      this.results.set(checkoutRequestId, result);
      const payload = {
        Body: {
          stkCallback: {
            MerchantRequestID: 'SIM',
            CheckoutRequestID: checkoutRequestId,
            ResultCode: Number(result.resultCode),
            ResultDesc: result.resultDesc,
            ...(cancelled
              ? {}
              : {
                  CallbackMetadata: {
                    Item: [
                      { Name: 'Amount', Value: r.amountKes },
                      {
                        Name: 'MpesaReceiptNumber',
                        Value: `SIM${randomBytes(4).toString('hex').toUpperCase()}`,
                      },
                      { Name: 'TransactionDate', Value: Number(r.timestamp) },
                      { Name: 'PhoneNumber', Value: Number(r.phone) },
                    ],
                  },
                }),
          },
        },
      };
      this.onComplete?.(checkoutRequestId, payload).catch((e: unknown) =>
        this.log.error({ err: e }, 'Simulated STK callback failed'),
      );
    }, this.delayMs).unref();
    return Promise.resolve({ merchantRequestId: 'SIM', checkoutRequestId });
  }

  stkQuery(_t: DarajaTarget, q: { checkoutRequestId: string }): Promise<StkQueryResult> {
    return Promise.resolve(
      this.results.get(q.checkoutRequestId) ?? { resultCode: null, resultDesc: 'Still processing' },
    );
  }

  registerC2b(): Promise<void> {
    return Promise.resolve();
  }
}
