import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/staff/more/meter_ocr.dart';

void main() {
  group('suggestReading', () {
    test('strips leading zeros with previous reading', () {
      expect(suggestReading('01234.5', previous: '1200'), '1234.5');
    });

    test('joins a line of spaced dial digits', () {
      expect(suggestReading('0 1 2 3 4'), '1234');
      expect(suggestReading('0 1 2 3 4', previous: '1100'), '1234');
    });

    test(
      'reads O/o as 0 and I/l/| as 1 inside tokens that contain a digit',
      () {
        expect(suggestReading('O1234'), '1234');
        expect(suggestReading('o12l4.5'), '1214.5');
        expect(suggestReading('|234'), '1234');
        expect(suggestReading('OIL'), isNull);
      },
    );

    test('ignores digits touching letters on either side', () {
      expect(suggestReading('m3 1234'), '1234');
      expect(suggestReading('m3'), isNull);
      expect(suggestReading('m³'), isNull);
      expect(suggestReading('No5'), isNull);
      expect(suggestReading('123kWh'), isNull);
    });

    test('drops candidates matching a 4+ digit meter serial number', () {
      expect(suggestReading('SN 20190815\n1234', serialNo: '20190815'), '1234');
      expect(
        suggestReading('WM-004512\n004512\n189', serialNo: 'WM-004512'),
        '189',
      );
      // Short serial (< 4 digits) does not filter out readings.
      expect(suggestReading('12', serialNo: 'W-12'), '12');
    });

    test('with previous, picks the candidate >= previous closest to it', () {
      expect(suggestReading('1500\n1250', previous: '1200'), '1250');
      expect(suggestReading('1200\n1250', previous: '1200'), '1200');
      // Tie on value breaks toward more raw digits.
      expect(suggestReading('1234\n001234', previous: '1200'), '1234');
      expect(suggestReading('1234\n1234.0', previous: '1200'), '1234.0');
    });

    test('returns null when all candidates are below previous', () {
      expect(suggestReading('950\n1199.9', previous: '1200'), isNull);
    });

    test('converts comma decimal separator to dot', () {
      expect(suggestReading('1234,5'), '1234.5');
    });

    test(
      'ignores runs with > 9 whole digits, > 3 decimals, or multiple dots',
      () {
        expect(suggestReading('1234567890'), isNull);
        expect(suggestReading('12.3456'), isNull);
        expect(suggestReading('12.11.2026'), isNull);
      },
    );

    test('returns null on empty or whitespace-only text', () {
      expect(suggestReading(''), isNull);
      expect(suggestReading('   \n  '), isNull);
    });

    test('keeps a single zero before a decimal point', () {
      expect(suggestReading('000.5'), '0.5');
      expect(suggestReading('0000'), '0');
    });
  });
}
