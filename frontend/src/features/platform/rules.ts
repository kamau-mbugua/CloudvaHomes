import { formatDay, isDay, todayInNairobi } from '../../lib/dates';
import { formatKES, minorToInput, parseAmount } from '../../lib/money';
import { shiftPeriod } from '../../lib/periods';
import type {
  BillingSummary, EffectivePrice, OrgStatus, Plan, PlatformOrganization, PlatformOwner, PlatformPaymentMethod,
  PlatformSettings, PlatformStk,
} from './types';

/**
 * Pure platform-billing rules the screens share: the banner, prices and overrides, and the
 * admin forms (plans, an organisation's terms, manual payments, settings). No React, money
 * only as integer cents, so each is tested on its own.
 */

type Errors<K extends string> = Partial<Record<K, string>>;
export type Checked<B, K extends string> = { ok: true; body: B } | { ok: false; errors: Errors<K> };

// ---------------------------------------------------------------- days

/**
 * A day from the API as `YYYY-MM-DD`, whether it came as a day or as an ISO instant (read
 * in Nairobi). Null for nothing or nonsense.
 */
export function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isDay(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : todayInNairobi(date);
}

/** "27 Oct 2026" for a day or an instant, or an em dash. */
export function formatDayish(value: string | null | undefined): string {
  return formatDay(dayOf(value));
}

// ---------------------------------------------------------------- banner

export interface Banner {
  tone: 'warn' | 'alert' | 'off';
  /** The sentence that says what is wrong. */
  message: string;
  /** Whether "Pay now" makes sense (it does not for a closed account). */
  payable: boolean;
}

/**
 * The staff app's billing banner for an organisation's status, or null when there is
 * nothing to say. `summary` (from `GET /billing`) adds the amount and due date when the
 * person may see them.
 */
export function bannerFor(
  status: OrgStatus | null | undefined,
  summary?: Pick<BillingSummary, 'overdue' | 'balance'> | null,
): Banner | null {
  switch (status) {
    case 'GRACE': {
      const overdue = summary?.overdue;
      return {
        tone: 'warn',
        message: overdue
          ? `Your Hodi bill of ${formatKES(overdue.amount)} was due on ${formatDayish(overdue.since)}.`
          : 'Your Hodi bill is overdue.',
        payable: true,
      };
    }
    case 'SUSPENDED': {
      const owed = summary && summary.balance > 0 ? ` ${formatKES(summary.balance)} is owed.` : '';
      return {
        tone: 'alert',
        message: `Your account is read-only until the Hodi bill is paid. Tenants can still pay rent.${owed}`,
        payable: true,
      };
    }
    case 'CLOSED':
      return {
        tone: 'off',
        message: 'This organisation’s Hodi account is closed. Contact Hodi to reopen it.',
        payable: false,
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------- prices

/** "KES 150.00 per let unit a month, at least KES 2,000.00". */
export function priceText(price: Pick<EffectivePrice, 'pricePerUnit' | 'minimumMonthly'>): string {
  const per = `${formatKES(price.pricePerUnit)} per let unit a month`;
  return price.minimumMonthly > 0 ? `${per}, at least ${formatKES(price.minimumMonthly)}` : per;
}

/** What a month costs for `units` let units: units × price, never below the minimum. */
export function monthlyTotal(units: number, price: Pick<EffectivePrice, 'pricePerUnit' | 'minimumMonthly'>): number {
  return Math.max(Math.max(0, Math.trunc(units)) * price.pricePerUnit, price.minimumMonthly);
}

export interface Overrides {
  price: number | null;
  minimum: number | null;
}

/**
 * An organisation's own price and minimum (null = its plan's). Taken from
 * `priceOverride` / `minimumOverride` when the API sends them; otherwise worked out from
 * the effective price against the plan — `custom` with no plan means both are its own.
 */
export function overridesOf(
  org: Pick<PlatformOrganization, 'price' | 'plan' | 'priceOverride' | 'minimumOverride'>,
): Overrides {
  const sent = org.priceOverride !== undefined || org.minimumOverride !== undefined;
  if (sent) return { price: org.priceOverride ?? null, minimum: org.minimumOverride ?? null };
  if (!org.price?.custom) return { price: null, minimum: null };
  const plan = org.plan;
  if (!plan || typeof plan.pricePerUnit !== 'number' || typeof plan.minimumMonthly !== 'number') {
    return { price: org.price.pricePerUnit, minimum: org.price.minimumMonthly };
  }
  return {
    price: org.price.pricePerUnit !== plan.pricePerUnit ? org.price.pricePerUnit : null,
    minimum: org.price.minimumMonthly !== plan.minimumMonthly ? org.price.minimumMonthly : null,
  };
}

// ---------------------------------------------------------------- plans

export interface PlanDraft {
  name: string;
  description: string;
  pricePerUnit: string;
  minimumMonthly: string;
  trialDays: string;
  active: boolean;
  isDefault: boolean;
}

export interface PlanBody {
  name: string;
  description: string | null;
  pricePerUnit: number;
  minimumMonthly: number;
  trialDays: number;
  active: boolean;
  isDefault: boolean;
}

export function planDraft(plan?: Plan | null): PlanDraft {
  return {
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    pricePerUnit: plan ? minorToInput(plan.pricePerUnit) : '',
    minimumMonthly: plan ? minorToInput(plan.minimumMonthly) : '0',
    trialDays: plan ? String(plan.trialDays) : '30',
    active: plan?.active ?? true,
    isDefault: plan?.isDefault ?? false,
  };
}

/** A whole number of days in [min, max], from what was typed. */
export function checkDays(input: string, min: number, max: number): { ok: true; days: number } | { ok: false; error: string } {
  const text = input.trim();
  if (!/^\d+$/.test(text)) return { ok: false, error: `Enter a whole number of days, ${min} to ${max}.` };
  const days = Number(text);
  if (days < min || days > max) return { ok: false, error: `Enter ${min} to ${max} days.` };
  return { ok: true, days };
}

/** An amount that may be zero (a minimum of nothing), in cents. */
function checkMoney(input: string, allowZero: boolean): { ok: true; minor: number } | { ok: false; error: string } {
  const parsed = parseAmount(input);
  if (!parsed.ok) return parsed;
  if (!allowZero && parsed.minor <= 0) return { ok: false, error: 'Enter an amount above zero.' };
  return parsed;
}

export function checkPlan(draft: PlanDraft): Checked<PlanBody, keyof PlanDraft> {
  const errors: Errors<keyof PlanDraft> = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Give the plan a name, e.g. Standard.';
  else if (name.length > 80) errors.name = 'Keep the name to 80 characters.';
  const description = draft.description.trim();
  if (description.length > 500) errors.description = 'Keep the description to 500 characters.';
  const price = checkMoney(draft.pricePerUnit, true);
  if (!price.ok) errors.pricePerUnit = price.error;
  const minimum = checkMoney(draft.minimumMonthly.trim() || '0', true);
  if (!minimum.ok) errors.minimumMonthly = minimum.error;
  const trial = checkDays(draft.trialDays, 0, 365);
  if (!trial.ok) errors.trialDays = trial.error;
  if (draft.isDefault && !draft.active) errors.isDefault = 'The default plan must be active.';

  if (!price.ok || !minimum.ok || !trial.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      name,
      description: description || null,
      pricePerUnit: price.minor,
      minimumMonthly: minimum.minor,
      trialDays: trial.days,
      active: draft.active,
      isDefault: draft.isDefault,
    },
  };
}

// ---------------------------------------------------------------- an organisation's terms

export interface TermsDraft {
  planId: string;
  priceOverride: string;
  minimumOverride: string;
  trialEndsAt: string;
  noSuspendUntil: string;
}

export interface TermsBody {
  planId?: string;
  priceOverride?: number | null;
  minimumOverride?: number | null;
  trialEndsAt?: string | null;
  noSuspendUntil?: string | null;
}

export function termsDraft(org: PlatformOrganization): TermsDraft {
  const own = overridesOf(org);
  return {
    planId: org.plan?.id ?? '',
    priceOverride: own.price === null ? '' : minorToInput(own.price),
    minimumOverride: own.minimum === null ? '' : minorToInput(own.minimum),
    trialEndsAt: dayOf(org.trialEndsAt) ?? '',
    noSuspendUntil: dayOf(org.noSuspendUntil) ?? '',
  };
}

/**
 * The organisation's billing terms form → the `PATCH` body, holding only what changed.
 * An empty override means "use the plan" (sent as null); an empty date clears it. Nothing
 * changed → an empty body (the caller does not send it).
 */
export function checkTerms(org: PlatformOrganization, draft: TermsDraft): Checked<TermsBody, keyof TermsDraft> {
  const errors: Errors<keyof TermsDraft> = {};
  const before = termsDraft(org);
  const body: TermsBody = {};

  if (draft.planId !== before.planId) {
    if (!draft.planId) errors.planId = 'Choose a plan.';
    else body.planId = draft.planId;
  }

  for (const field of ['priceOverride', 'minimumOverride'] as const) {
    const text = draft[field].trim();
    if (text === before[field]) continue;
    if (!text) {
      body[field] = null;
      continue;
    }
    const money = checkMoney(text, true);
    if (!money.ok) {
      errors[field] = money.error;
      continue;
    }
    const was = before[field] ? parseAmount(before[field]) : null;
    // "150" and "150.00" are the same figure: not a change.
    if (!was?.ok || was.minor !== money.minor) body[field] = money.minor;
  }

  for (const field of ['trialEndsAt', 'noSuspendUntil'] as const) {
    const day = draft[field].trim();
    if (day === before[field]) continue;
    if (!day) body[field] = null;
    else if (!isDay(day)) errors[field] = 'Choose a date, or leave it empty.';
    else body[field] = day;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body };
}

// ---------------------------------------------------------------- manual payments

export interface PaymentDraft {
  amount: string;
  method: PlatformPaymentMethod | '';
  reference: string;
  receivedAt: string;
  note: string;
}

export interface PaymentBody {
  orgId: string;
  amount: number;
  method: PlatformPaymentMethod;
  reference: string;
  receivedAt: string;
  note?: string;
}

export function checkPlatformPayment(orgId: string, draft: PaymentDraft, today: string): Checked<PaymentBody, keyof PaymentDraft> {
  const errors: Errors<keyof PaymentDraft> = {};
  const amount = checkMoney(draft.amount, false);
  if (!amount.ok) errors.amount = amount.error;
  if (!draft.method) errors.method = 'Choose how it was paid.';
  const reference = draft.reference.trim().replace(/\s+/g, ' ');
  if (!reference) errors.reference = 'Enter the bank, cheque or M-Pesa reference.';
  else if (reference.length > 64) errors.reference = 'Keep the reference to 64 characters.';
  if (!isDay(draft.receivedAt)) errors.receivedAt = 'Choose the day the money was received.';
  else if (draft.receivedAt > today) errors.receivedAt = 'The money can’t have been received in the future.';
  const note = draft.note.trim();
  if (note.length > 500) errors.note = 'Keep the note to 500 characters.';

  if (!amount.ok || Object.keys(errors).length > 0 || !draft.method) return { ok: false, errors };
  return {
    ok: true,
    body: {
      orgId,
      amount: amount.minor,
      method: draft.method,
      reference: draft.method === 'MPESA' ? reference.toUpperCase().replace(/\s/g, '') : reference,
      receivedAt: draft.receivedAt,
      ...(note ? { note } : {}),
    },
  };
}

// ---------------------------------------------------------------- platform settings

export interface SettingsDraft {
  dueDays: string;
  suspendAfterDays: string;
  defaultPlanId: string;
  paybill: string;
}

export interface SettingsBody {
  dueDays: number;
  suspendAfterDays: number;
  defaultPlanId: string | null;
  paybill: string | null;
}

export function settingsDraft(settings: PlatformSettings): SettingsDraft {
  return {
    dueDays: String(settings.dueDays),
    suspendAfterDays: String(settings.suspendAfterDays),
    defaultPlanId: settings.defaultPlanId ?? '',
    paybill: settings.paybill ?? '',
  };
}

/** The settings form (not the keys) → the `PUT` body. Sending no key field means no step-up. */
export function checkSettings(draft: SettingsDraft): Checked<SettingsBody, keyof SettingsDraft> {
  const errors: Errors<keyof SettingsDraft> = {};
  const due = checkDays(draft.dueDays, 0, 60);
  if (!due.ok) errors.dueDays = due.error;
  const suspend = checkDays(draft.suspendAfterDays, 1, 180);
  if (!suspend.ok) errors.suspendAfterDays = suspend.error;
  const paybill = draft.paybill.trim();
  if (paybill && !/^\d{5,7}$/.test(paybill)) errors.paybill = 'Enter the paybill number: 5 to 7 digits.';

  if (!due.ok || !suspend.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      dueDays: due.days,
      suspendAfterDays: suspend.days,
      defaultPlanId: draft.defaultPlanId || null,
      paybill: paybill || null,
    },
  };
}

/**
 * Hodi's Daraja keys as `PUT /platform/settings` takes them (flat, write-only), from the
 * checked form (`checkDaraja`). Sending any of them asks for a verification code.
 */
export function darajaSettingsBody(body: { environment: 'SANDBOX' | 'PRODUCTION'; consumerKey: string; consumerSecret: string; passkey?: string }) {
  return {
    darajaEnvironment: body.environment,
    consumerKey: body.consumerKey,
    consumerSecret: body.consumerSecret,
    ...(body.passkey ? { passkey: body.passkey } : {}),
  };
}

// ---------------------------------------------------------------- odds and ends

/** The month an invoice run bills by default: the one before today's (Nairobi). */
export function lastMonth(today: string = todayInNairobi()): string {
  return shiftPeriod(today.slice(0, 7), -1);
}

/** "Jane Wanjiku", or the email or phone, or a dash. */
export function ownerText(owner: PlatformOwner | null | undefined): string {
  if (!owner) return '—';
  const name = owner.name?.trim() || [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
  return name || owner.email || owner.phone || '—';
}

/** A platform STK request in the shape `describeStk` reads (missing fields as null). */
export function stkView(stk: PlatformStk) {
  return {
    state: stk.state,
    phone: stk.phone ?? '',
    amount: stk.amount ?? 0,
    resultDesc: stk.resultDesc ?? null,
    mpesaReceipt: stk.mpesaReceipt ?? null,
  };
}

/** What to suggest paying: the whole balance (oldest invoice is paid first), else what is overdue. */
export function suggestedPayment(summary: Pick<BillingSummary, 'overdue' | 'balance'>): number {
  if (summary.balance > 0) return summary.balance;
  return Math.max(0, summary.overdue?.amount ?? 0);
}
