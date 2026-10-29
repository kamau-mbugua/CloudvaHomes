/**
 * Bank and payout shapes from the phase 10 API contract
 * (docs/plans/2026-10-28-phase-10-banks-payouts.md). Money is integer minor units (KES
 * cents); timestamps are ISO instants. Secrets are never returned, except the bank
 * notification secret, once, when it is made.
 */

import type { DarajaEnvironment } from '../payments/types';

export type DateFormat = 'YMD' | 'DMY';

/**
 * Which CSV column holds what, by header name. Either one signed `amount` column, or a
 * `credit` column (and optionally a `debit` one). Only credits are imported.
 */
export interface StatementMapping {
  date: string;
  dateFormat: DateFormat;
  amount?: string;
  credit?: string;
  debit?: string;
  reference: string;
  transactionId?: string;
  payer?: string;
}

export interface StatementRowError {
  /** The row's number in the file, as the server counts it. */
  row: number;
  message: string;
}

/** `POST /payment-channels/:id/statement-imports/preview`. */
export interface StatementPreview {
  headers: string[];
  /**
   * The first rows. The contract doesn't say whether a row is an array of cells or an
   * object keyed by header, so both are read (`sampleRows`).
   */
  sample: unknown[];
  /** The mapping sent, else the one saved on the channel, else the server's guess. May be partial. */
  mapping: Partial<StatementMapping> | null;
  /**
   * What the mapping reads. `null` when the server only guessed (nothing sent or saved):
   * the screen then sends the guess to see the counts. `total` is the credits' sum in
   * cents; row 0 in `errors` is about the mapping itself, not a row.
   */
  parsed: { credits: number; skipped: number; total?: number | string; errors: StatementRowError[] } | null;
}

/** `POST /payment-channels/:id/statement-imports`. */
export interface StatementImportResult {
  id: string;
  rows: number;
  credits: number;
  created: number;
  duplicates: number;
  matched: number;
  /** Rows that couldn't be read (left out). Sent with the import's answer, not in the history. */
  errors?: StatementRowError[];
}

/** One row of `GET /payment-channels/:id/statement-imports`. */
export interface StatementImport extends StatementImportResult {
  filename: string | null;
  createdAt: string;
  /** Who ran it. The contract stores `createdById`; a name is shown when the server adds one. */
  createdBy?: { id: string; name?: string | null; firstName?: string | null; lastName?: string | null } | null;
}

export type BankAdapter = 'HODI_JSON';

/** On the channel: whether bank notifications are on, and where they go. Never the secret. */
export interface BankWebhookInfo {
  adapter: BankAdapter;
  url: string;
}

/** `PUT /payment-channels/:id/bank-webhook`: the secret, shown once. */
export interface BankWebhookSecret {
  url: string;
  secret: string;
}

export type PayoutAccountKind = 'MPESA_B2C';

/** One row of `GET /payout-accounts`. Keys and the security credential are never returned. */
export interface PayoutAccount {
  id: string;
  kind: PayoutAccountKind;
  name: string;
  shortcode: string;
  environment: DarajaEnvironment;
  configured: boolean;
  initiatorName: string | null;
  callbackUrls: { result: string; timeout: string } | null;
  updatedAt: string;
}
