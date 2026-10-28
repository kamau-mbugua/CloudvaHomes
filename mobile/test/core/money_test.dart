import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/money.dart';

void main() {
  test('formats cents as KES with grouping', () {
    expect(formatKes(2500000), 'KES 25,000.00');
    expect(formatKes(5), 'KES 0.05');
    expect(formatKes(-100050), '-KES 1,000.50');
    expect(formatKes(0), 'KES 0.00');
  });

  test('parses typed amounts into cents', () {
    expect(parseKes('1,250.5'), 125050);
    expect(parseKes(' 1250 '), 125000);
    expect(parseKes('0.07'), 7);
    expect(parseKes('1.234'), isNull);
    expect(parseKes('abc'), isNull);
    expect(parseKes('-5'), isNull);
  });

  test('reads JSON money', () {
    expect(centsFrom(100), 100);
    expect(centsFrom('9007199254740'), 9007199254740);
    expect(centsFrom(null), 0);
  });

  test('rounds a balance up to whole shillings for M-Pesa', () {
    expect(wholeShillingsUp(2500050), 2500100);
    expect(wholeShillingsUp(2500000), 2500000);
    expect(wholeShillingsUp(-10), 0);
  });
}
