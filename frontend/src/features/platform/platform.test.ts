import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { ApiError, ORG_SUSPENDED_MESSAGE, toApiError } from '../../lib/api/client';
import { isPlatformOperator, isSuperAdmin, landingFor } from '../../lib/auth/portals';
import { ADMIN_NAV, bestEntry, destinations, filterAdminNav } from '../../app/navigation';
import { platformErrorMessage } from './api';
import {
  bannerFor, checkDays, checkPlan, checkPlatformPayment, checkSettings, checkTerms, darajaSettingsBody, dayOf, formatDayish,
  lastMonth, monthlyTotal, overridesOf, ownerText, planDraft, priceText, settingsDraft, stkView, suggestedPayment, termsDraft,
} from './rules';
import type { Plan, PlatformOrganization, PlatformSettings } from './types';

/** Synthetic data only: organisations "Sample Org", billing refs H0000x, phones +2547000000xx. */

const apiError = (code: string, status = 409) => new ApiError({ status, code, message: `server says ${code}` });

const org = (over: Partial<PlatformOrganization> = {}): PlatformOrganization => ({
  id: 'org-1', name: 'Sample Org', kind: 'LANDLORD', status: 'ACTIVE', billingRef: 'H00001',
  plan: { id: 'plan-1', name: 'Standard' },
  price: { pricePerUnit: 15_000, minimumMonthly: 200_000, custom: false },
  priceOverride: null, minimumOverride: null,
  trialEndsAt: null, noSuspendUntil: null, balance: 0, occupiedUnits: 10, owner: null,
  ...over,
});

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'plan-1', name: 'Standard', description: null, pricePerUnit: 15_000, minimumMonthly: 200_000,
  trialDays: 30, isDefault: true, active: true, organizationCount: 3, ...over,
});

describe('ORG_SUSPENDED', () => {
  it('replaces the server wording with the plain message, which mentions rent', () => {
    const error = toApiError(403, { error: { code: 'ORG_SUSPENDED', message: 'Organisation suspended' } }, null);
    expect(error.code).toBe('ORG_SUSPENDED');
    expect(error.message).toBe(ORG_SUSPENDED_MESSAGE);
    expect(error.message).toMatch(/Tenants can still pay rent/);
  });

  it('reaches every screen through the fallbacks', () => {
    const error = toApiError(403, { error: { code: 'ORG_SUSPENDED', message: 'x' } }, null);
    expect(platformErrorMessage(error)).toBe(ORG_SUSPENDED_MESSAGE);
  });

  it('leaves other codes alone', () => {
    expect(toApiError(409, { error: { code: 'OTHER', message: 'as said' } }, null).message).toBe('as said');
  });
});

describe('platformErrorMessage', () => {
  it('explains a plan in use, missing M-Pesa and a repeated reference', () => {
    expect(platformErrorMessage(apiError('PLAN_IN_USE'))).toMatch(/Organisations are on this plan/);
    expect(platformErrorMessage(apiError('NO_MPESA'))).toMatch(/paybill/);
    expect(platformErrorMessage(apiError('DUPLICATE_REFERENCE'))).toMatch(/already recorded/);
    expect(platformErrorMessage(apiError('INVOICE_SETTLED'))).toMatch(/can’t be voided/);
  });

  it('takes an override and falls back to the server message', () => {
    expect(platformErrorMessage(apiError('PLAN_IN_USE'), { PLAN_IN_USE: 'mine' })).toBe('mine');
    expect(platformErrorMessage(apiError('SOMETHING_NEW'))).toBe('server says SOMETHING_NEW');
  });
});

describe('bannerFor', () => {
  it('says nothing for trial, active or an unknown status', () => {
    expect(bannerFor('TRIAL')).toBeNull();
    expect(bannerFor('ACTIVE')).toBeNull();
    expect(bannerFor(undefined)).toBeNull();
  });

  it('gives the amount and due date in grace when known', () => {
    expect(bannerFor('GRACE', { balance: 300_000, overdue: { amount: 250_000, since: '2026-11-10' } })).toEqual({
      tone: 'warn', message: 'Your KodiHub bill of KES 2,500.00 was due on 10 Nov 2026.', payable: true,
    });
    expect(bannerFor('GRACE')?.message).toBe('Your KodiHub bill is overdue.');
  });

  it('says read-only and that tenants can still pay when suspended', () => {
    const banner = bannerFor('SUSPENDED', { balance: 250_000, overdue: null });
    expect(banner?.tone).toBe('alert');
    expect(banner?.message).toBe('Your account is read-only until the KodiHub bill is paid. Tenants can still pay rent. KES 2,500.00 is owed.');
    expect(bannerFor('SUSPENDED')?.message).toBe('Your account is read-only until the KodiHub bill is paid. Tenants can still pay rent.');
  });

  it('offers no payment for a closed account', () => {
    expect(bannerFor('CLOSED')?.payable).toBe(false);
  });
});

describe('days', () => {
  it('reads a day or an instant (in Nairobi)', () => {
    expect(dayOf('2026-11-10')).toBe('2026-11-10');
    expect(dayOf('2026-11-09T22:30:00Z')).toBe('2026-11-10');
    expect(dayOf('nonsense')).toBeNull();
    expect(dayOf(null)).toBeNull();
    expect(formatDayish('2026-11-10')).toBe('10 Nov 2026');
    expect(formatDayish(null)).toBe('—');
  });

  it('runs last month by default', () => {
    expect(lastMonth('2026-11-01')).toBe('2026-10');
    expect(lastMonth('2026-01-15')).toBe('2025-12');
  });

  it('checks whole days in a range', () => {
    expect(checkDays('10', 0, 60)).toEqual({ ok: true, days: 10 });
    expect(checkDays('61', 0, 60).ok).toBe(false);
    expect(checkDays('1.5', 0, 60).ok).toBe(false);
    expect(checkDays('', 0, 60).ok).toBe(false);
  });
});

describe('prices', () => {
  it('bills units × price, never below the minimum', () => {
    expect(monthlyTotal(10, { pricePerUnit: 15_000, minimumMonthly: 100_000 })).toBe(150_000);
    expect(monthlyTotal(3, { pricePerUnit: 15_000, minimumMonthly: 100_000 })).toBe(100_000);
    expect(monthlyTotal(0, { pricePerUnit: 15_050, minimumMonthly: 0 })).toBe(0);
    expect(monthlyTotal(3, { pricePerUnit: 15_050, minimumMonthly: 0 })).toBe(45_150);
  });

  it('describes a price', () => {
    expect(priceText({ pricePerUnit: 15_050, minimumMonthly: 200_000 })).toBe('KES 150.50 per let unit a month, at least KES 2,000.00');
    expect(priceText({ pricePerUnit: 15_000, minimumMonthly: 0 })).toBe('KES 150.00 per let unit a month');
  });

  it('takes overrides as sent, and works them out when not', () => {
    expect(overridesOf(org({ priceOverride: 12_000 }))).toEqual({ price: 12_000, minimum: null });
    expect(overridesOf(org({ priceOverride: undefined, minimumOverride: undefined }))).toEqual({ price: null, minimum: null });
    const derived = org({
      priceOverride: undefined, minimumOverride: undefined,
      plan: { id: 'plan-1', name: 'Standard', pricePerUnit: 15_000, minimumMonthly: 200_000 },
      price: { pricePerUnit: 12_000, minimumMonthly: 200_000, custom: true },
    });
    expect(overridesOf(derived)).toEqual({ price: 12_000, minimum: null });
  });

  it('suggests paying the whole balance', () => {
    expect(suggestedPayment({ balance: 300_000, overdue: { amount: 100_000, since: '2026-11-10' } })).toBe(300_000);
    expect(suggestedPayment({ balance: 0, overdue: null })).toBe(0);
  });
});

describe('checkPlan', () => {
  it('turns the form into cents and days', () => {
    const checked = checkPlan({ ...planDraft(), name: ' Standard ', pricePerUnit: '149.50', minimumMonthly: '2,000', trialDays: '30', isDefault: true });
    expect(checked).toEqual({
      ok: true,
      body: { name: 'Standard', description: null, pricePerUnit: 14_950, minimumMonthly: 200_000, trialDays: 30, active: true, isDefault: true },
    });
  });

  it('reads an empty minimum as none', () => {
    const checked = checkPlan({ ...planDraft(), name: 'Lite', pricePerUnit: '100', minimumMonthly: '' });
    expect(checked.ok && checked.body.minimumMonthly).toBe(0);
  });

  it('refuses a missing name, bad money, bad days and an inactive default', () => {
    const checked = checkPlan({ ...planDraft(), name: '', pricePerUnit: '1.234', trialDays: '400', active: false, isDefault: true });
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(Object.keys(checked.errors).sort()).toEqual(['isDefault', 'name', 'pricePerUnit', 'trialDays']);
  });

  it('fills the form from a plan', () => {
    expect(planDraft(plan({ pricePerUnit: 15_050 }))).toMatchObject({ name: 'Standard', pricePerUnit: '150.50', minimumMonthly: '2,000', trialDays: '30' });
  });
});

describe('checkTerms', () => {
  it('sends nothing when nothing changed', () => {
    const o = org({ priceOverride: 12_000, trialEndsAt: '2026-12-31' });
    expect(checkTerms(o, termsDraft(o))).toEqual({ ok: true, body: {} });
  });

  it('sends only what changed; "150" equals "150.00"', () => {
    const o = org({ priceOverride: 15_000 });
    expect(checkTerms(o, { ...termsDraft(o), priceOverride: '150.00' })).toEqual({ ok: true, body: {} });
    expect(checkTerms(o, { ...termsDraft(o), minimumOverride: '500', noSuspendUntil: '2026-12-15' })).toEqual({
      ok: true, body: { minimumOverride: 50_000, noSuspendUntil: '2026-12-15' },
    });
  });

  it('clears an override or a date with null when emptied', () => {
    const o = org({ priceOverride: 12_000, noSuspendUntil: '2026-12-15' });
    expect(checkTerms(o, { ...termsDraft(o), priceOverride: '', noSuspendUntil: '' })).toEqual({
      ok: true, body: { priceOverride: null, noSuspendUntil: null },
    });
  });

  it('changes the plan and refuses bad input', () => {
    const o = org();
    expect(checkTerms(o, { ...termsDraft(o), planId: 'plan-2' })).toEqual({ ok: true, body: { planId: 'plan-2' } });
    const bad = checkTerms(o, { ...termsDraft(o), planId: '', priceOverride: 'abc', trialEndsAt: '2026-02-30' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['planId', 'priceOverride', 'trialEndsAt']);
  });
});

describe('checkPlatformPayment', () => {
  const draft = { amount: '2,500.50', method: 'BANK' as const, reference: ' FT 123 ', receivedAt: '2026-11-05', note: '' };

  it('builds the body with cents and the received day', () => {
    expect(checkPlatformPayment('org-1', draft, '2026-11-06')).toEqual({
      ok: true, body: { orgId: 'org-1', amount: 250_050, method: 'BANK', reference: 'FT 123', receivedAt: '2026-11-05' },
    });
  });

  it('upper-cases an M-Pesa code and keeps a note', () => {
    const checked = checkPlatformPayment('org-1', { ...draft, method: 'MPESA', reference: 'test 000001', note: ' late ' }, '2026-11-06');
    expect(checked.ok && checked.body).toMatchObject({ reference: 'TEST000001', note: 'late' });
  });

  it('refuses nothing paid, no reference and a future day', () => {
    const checked = checkPlatformPayment('org-1', { ...draft, amount: '0', reference: ' ', receivedAt: '2026-11-07' }, '2026-11-06');
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(Object.keys(checked.errors).sort()).toEqual(['amount', 'receivedAt', 'reference']);
  });
});

describe('platform settings', () => {
  const settings: PlatformSettings = {
    dueDays: 10, suspendAfterDays: 21, defaultPlanId: 'plan-1', paybill: '600000',
    daraja: { configured: false, environment: null, passkey: false, callbackUrls: null },
  };

  it('round-trips the form without any key field (so no step-up)', () => {
    const checked = checkSettings(settingsDraft(settings));
    expect(checked).toEqual({ ok: true, body: { dueDays: 10, suspendAfterDays: 21, defaultPlanId: 'plan-1', paybill: '600000' } });
    expect(checked.ok && Object.keys(checked.body)).not.toContain('consumerKey');
  });

  it('clears the default plan and paybill, and refuses bad values', () => {
    expect(checkSettings({ ...settingsDraft(settings), defaultPlanId: '', paybill: '' })).toMatchObject({ ok: true, body: { defaultPlanId: null, paybill: null } });
    const bad = checkSettings({ dueDays: '99', suspendAfterDays: '0', defaultPlanId: '', paybill: '12' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['dueDays', 'paybill', 'suspendAfterDays']);
  });

  it('sends the keys flat, with the environment as darajaEnvironment', () => {
    expect(darajaSettingsBody({ environment: 'SANDBOX', consumerKey: 'k', consumerSecret: 's' })).toEqual({
      darajaEnvironment: 'SANDBOX', consumerKey: 'k', consumerSecret: 's',
    });
    expect(darajaSettingsBody({ environment: 'PRODUCTION', consumerKey: 'k', consumerSecret: 's', passkey: 'p' })).toHaveProperty('passkey', 'p');
  });
});

describe('small helpers', () => {
  it('names an owner', () => {
    expect(ownerText({ firstName: 'Test', lastName: 'Owner', phone: '+254700000001' })).toBe('Test Owner');
    expect(ownerText({ email: 'owner@example.invalid' })).toBe('owner@example.invalid');
    expect(ownerText(null)).toBe('—');
  });

  it('fills the missing STK fields for describing it', () => {
    expect(stkView({ id: 's1', state: 'PENDING', amount: 100_000, phone: '+254700000001' })).toEqual({
      state: 'PENDING', amount: 100_000, phone: '+254700000001', resultDesc: null, mpesaReceipt: null,
    });
  });
});

describe('admin area routing', () => {
  const session = (over: object = {}) => ({
    user: { isPlatformAdmin: true }, activeOrganization: null, organizations: [], ownerOf: [], tenantOf: [], ...over,
  });

  it('sends a platform admin or salesperson with no organisation to /admin', () => {
    expect(landingFor(session())).toBe('/admin');
    expect(landingFor(session({ user: { isPlatformAdmin: false, platformRole: 'SALESPERSON' } }))).toBe('/admin');
    expect(landingFor(session({ tenantOf: [{ tenantId: 't', name: 'T', organization: { id: 'o', name: 'O' } }] }))).toBe('/admin');
    expect(isPlatformOperator({ isPlatformAdmin: false, platformRole: 'SALESPERSON' })).toBe(true);
    expect(isSuperAdmin({ isPlatformAdmin: false, platformRole: 'SALESPERSON' })).toBe(false);
    expect(isSuperAdmin({ isPlatformAdmin: true, platformRole: 'SUPERADMIN' })).toBe(true);
  });

  it('leaves admins with an organisation in the staff app, and others as before', () => {
    expect(landingFor(session({ organizations: [{ id: 'o', name: 'O', kind: 'AGENCY', roleName: 'Owner', isOwner: true }] }))).toBeNull();
    expect(landingFor(session({ user: { isPlatformAdmin: false } }))).toBeNull();
  });

  it('lights one admin menu entry per page and matches query parameters', () => {
    expect(bestEntry(ADMIN_NAV, '/admin')?.entry.label).toBe('Overview');
    expect(bestEntry(ADMIN_NAV, '/admin/organizations')?.entry.label).toBe('All organisations');
    expect(bestEntry(ADMIN_NAV, '/admin/organizations?status=ACTIVE')?.entry.label).toBe('Active');
    expect(bestEntry(ADMIN_NAV, '/admin/organizations/new')?.entry.label).toBe('Add an organisation');
    expect(bestEntry(ADMIN_NAV, '/admin/organizations/0b9c7d6e')?.entry.label).toBe('All organisations');
    expect(bestEntry(ADMIN_NAV, '/admin/plans')?.entry.label).toBe('Plans');
    expect(bestEntry(ADMIN_NAV, '/admin/invoices?status=OVERDUE')?.entry.label).toBe('Overdue invoices');
    expect(bestEntry(ADMIN_NAV, '/admin/payments')?.entry.label).toBe('Payments');
    expect(bestEntry(ADMIN_NAV, '/admin/reports/collections')?.entry.label).toBe('Collections');
    expect(bestEntry(ADMIN_NAV, '/admin/reports/salespeople')?.entry.label).toBe('Salesperson performance');
    expect(bestEntry(ADMIN_NAV, '/admin/admins')?.entry.label).toBe('Administrators & salespeople');
    expect(bestEntry(ADMIN_NAV, '/admin/email')?.entry.label).toBe('Email');
    expect(bestEntry(ADMIN_NAV, '/admin/settings')?.entry.label).toBe('Settings');
    expect(destinations(ADMIN_NAV).length).toBeGreaterThanOrEqual(24);
  });

  it('filters out superadmin-only groups and entries for salespeople', () => {
    const salesNav = filterAdminNav(ADMIN_NAV, false);
    const groupIds = salesNav.map((g) => g.id);
    expect(groupIds).toEqual(['admin-overview', 'admin-organizations', 'admin-billing', 'admin-platform']);
    const links = destinations(salesNav).map((e) => e.to);
    expect(links).not.toContain('/admin/plans');
    expect(links).not.toContain('/admin/admins');
    expect(links).not.toContain('/admin/email');
    expect(links).not.toContain('/admin/settings');
    expect(links).toContain('/admin/invoices');
    expect(links).toContain('/admin/payments');
    expect(links).toContain('/admin/account');
  });

  it('sends an organisation id to its page and keeps the list and /new route distinct', () => {
    const routes = [
      { path: '/admin' },
      { path: '/admin/organizations' },
      { path: '/admin/organizations/new' },
      { path: '/admin/organizations/:organizationId' },
      { path: '/admin/plans' },
      { path: '/admin/invoices' },
      { path: '/admin/payments' },
      { path: '/admin/reports/:report' },
      { path: '/admin/admins' },
      { path: '/admin/email' },
      { path: '/admin/settings' },
      { path: '/admin/*' },
    ];
    const winner = (p: string) => matchRoutes(routes, p)?.at(-1)?.route.path;
    expect(winner('/admin/organizations/0b9c7d6e-1111-4222-8333-444455556666')).toBe('/admin/organizations/:organizationId');
    expect(winner('/admin/organizations/new')).toBe('/admin/organizations/new');
    expect(winner('/admin/organizations')).toBe('/admin/organizations');
    expect(winner('/admin/reports/collections')).toBe('/admin/reports/:report');
    expect(winner('/admin/nowhere')).toBe('/admin/*');
  });
});
