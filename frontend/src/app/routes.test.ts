import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { ORG_NAV, destinations } from './navigation';

/**
 * The route table App.tsx builds, reduced to paths: each nav entry at its own path, the
 * invoices detail under it. Checks that React Router's ranking sends `/app/invoices/run`
 * to the run page, not to the invoice detail route as an id called "run".
 */
const paths = [
  ...destinations(ORG_NAV).filter((d) => d.to !== '/app').map((d) => d.to),
  '/app/invoices/:invoiceId',
  '/app/payments/:paymentId',
  '/app/reconciliation/:inboundId',
  '/app/remittances/:remittanceId',
];
const routes = paths.map((path) => ({ path }));

const winner = (pathname: string) => matchRoutes(routes, pathname)?.at(-1)?.route.path;

describe('billing routes', () => {
  it('sends /app/invoices/run to the run page', () => {
    expect(winner('/app/invoices/run')).toBe('/app/invoices/run');
  });

  it('sends an invoice id to the detail page', () => {
    expect(winner('/app/invoices/0b9c7d6e-1111-4222-8333-444455556666')).toBe('/app/invoices/:invoiceId');
  });

  it('keeps the list at /app/invoices', () => {
    expect(winner('/app/invoices')).toBe('/app/invoices');
  });

  it('routes the other billing pages', () => {
    expect(winner('/app/meter-readings')).toBe('/app/meter-readings');
    expect(winner('/app/charges')).toBe('/app/charges');
  });
});

describe('payment routes', () => {
  it('sends a payment id to the detail page and keeps the list', () => {
    expect(winner('/app/payments/0b9c7d6e-1111-4222-8333-444455556666')).toBe('/app/payments/:paymentId');
    expect(winner('/app/payments')).toBe('/app/payments');
  });

  it('keeps payment channels apart from payments', () => {
    expect(winner('/app/payment-channels')).toBe('/app/payment-channels');
  });
});

describe('reconciliation routes', () => {
  it('sends an inbound transaction id to its page and keeps the list', () => {
    expect(winner('/app/reconciliation/0b9c7d6e-1111-4222-8333-444455556666')).toBe('/app/reconciliation/:inboundId');
    expect(winner('/app/reconciliation')).toBe('/app/reconciliation');
  });
});

describe('phase 6 routes', () => {
  it('routes expenses and reports to their own pages', () => {
    expect(winner('/app/expenses')).toBe('/app/expenses');
    expect(winner('/app/reports')).toBe('/app/reports');
  });
});

describe('phase 6b routes', () => {
  it('routes agreements, owner statements and remittances, with a remittance detail', () => {
    expect(winner('/app/agreements')).toBe('/app/agreements');
    expect(winner('/app/owner-statements')).toBe('/app/owner-statements');
    expect(winner('/app/remittances')).toBe('/app/remittances');
    expect(winner('/app/remittances/0b9c7d6e-1111-4222-8333-444455556666')).toBe('/app/remittances/:remittanceId');
  });
});

describe('tenant portal routes', () => {
  const tenantRoutes = [
    { path: '/tenant' }, { path: '/tenant/invoices' }, { path: '/tenant/invoices/:invoiceId' },
    { path: '/tenant/statement' }, { path: '/tenant/payments' }, { path: '/tenant/*' },
  ];
  const tenantWinner = (pathname: string) => matchRoutes(tenantRoutes, pathname)?.at(-1)?.route.path;

  it('sends an invoice id to the portal invoice page and keeps the list', () => {
    expect(tenantWinner('/tenant/invoices/0b9c7d6e-1111-4222-8333-444455556666')).toBe('/tenant/invoices/:invoiceId');
    expect(tenantWinner('/tenant/invoices')).toBe('/tenant/invoices');
    expect(tenantWinner('/tenant/statement')).toBe('/tenant/statement');
    expect(tenantWinner('/tenant/nowhere')).toBe('/tenant/*');
  });
});
