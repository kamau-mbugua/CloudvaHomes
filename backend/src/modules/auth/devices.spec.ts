import { describeDevice } from './devices.js';

describe('describeDevice', () => {
  it('names common browsers, systems and the app', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      ),
    ).toBe('Chrome on Mac');
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iPhone or iPad');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/131.0')).toBe(
      'Edge on Windows',
    );
    expect(describeDevice('Dart/3.11 (dart:io)')).toBe('KodiHQ app');
    expect(describeDevice(null)).toBe('Unknown device');
  });
});
