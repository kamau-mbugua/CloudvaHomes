import { describe, expect, it } from 'vitest';
import { propertySwitchRequest, scopedProperty } from './propertyScope';

const properties = [
  { id: 'p1', code: 'IVB', name: 'Ivory Breeze Apartments' },
  { id: 'p2', code: 'ACH', name: 'Acacia Heights' },
];

describe('scopedProperty', () => {
  it('names the property the whole app is narrowed to', () => {
    expect(scopedProperty({ activePropertyId: 'p2', properties })).toEqual(properties[1]);
  });

  it('is null when showing every property', () => {
    expect(scopedProperty({ activePropertyId: null, properties })).toBeNull();
  });

  it('is null for a property the session does not list (the server ignores it too)', () => {
    expect(scopedProperty({ activePropertyId: 'gone', properties })).toBeNull();
  });
});

describe('propertySwitchRequest', () => {
  it('narrows for now without making it the property you open on next time', () => {
    expect(propertySwitchRequest('p2')).toEqual({ propertyId: 'p2', setAsDefault: false });
  });

  it('showing all properties also clears any saved default', () => {
    expect(propertySwitchRequest(null)).toEqual({ propertyId: null, setAsDefault: true });
  });
});
