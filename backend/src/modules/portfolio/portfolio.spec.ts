import { emptyContext, runWithContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import {
  landlordScope,
  propertyScope,
  requireAllProperties,
  tenancyScope,
  tenantScope,
  unitScope,
} from './property-scope.js';
import { defaultBillingDay } from './tenancies/tenancies.service.js';
import { cleanUnitNumbers } from './units/units.service.js';

describe('property scope', () => {
  const limited = (fn: () => void) =>
    runWithContext(emptyContext({ orgId: 'o', propertyIds: ['p1', 'p2'] }), fn);
  const unlimited = (fn: () => void) => runWithContext(emptyContext({ orgId: 'o' }), fn);

  it('adds no filter for callers with access to every property', () => {
    unlimited(() => {
      expect(propertyScope()).toEqual({});
      expect(unitScope()).toEqual({});
      expect(tenancyScope()).toEqual({});
      expect(tenantScope()).toEqual({});
      expect(landlordScope()).toEqual({});
      expect(() => requireAllProperties()).not.toThrow();
    });
  });

  it('limits every portfolio query to the caller’s properties', () => {
    limited(() => {
      const ids = { in: ['p1', 'p2'] };
      expect(propertyScope()).toEqual({ id: ids });
      expect(unitScope()).toEqual({ propertyId: ids });
      expect(tenancyScope()).toEqual({ unit: { propertyId: ids } });
      expect(landlordScope()).toEqual({ properties: { some: { id: ids } } });
      // Tenants on their units, plus tenants not yet moved in anywhere.
      expect(tenantScope()).toEqual({
        OR: [{ tenancies: { some: { unit: { propertyId: ids } } } }, { tenancies: { none: {} } }],
      });
      expect(() => requireAllProperties()).toThrow(AppError);
    });
  });
});

describe('cleanUnitNumbers', () => {
  it('trims numbers', () => {
    expect(cleanUnitNumbers([' A1', 'A2 '])).toEqual(['A1', 'A2']);
  });

  it('reports repeats (case-insensitively) at the position of the repeat', () => {
    try {
      cleanUnitNumbers(['A1', 'B1', 'a1']);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).details).toEqual([
        { field: 'numbers[2]', message: 'a1 is listed twice' },
      ]);
    }
  });
});

describe('defaultBillingDay', () => {
  it('uses the move-in day, capped at 28 so every month has it', () => {
    expect(defaultBillingDay(new Date('2026-11-07T00:00:00Z'))).toBe(7);
    expect(defaultBillingDay(new Date('2026-10-31T00:00:00Z'))).toBe(28);
  });
});
