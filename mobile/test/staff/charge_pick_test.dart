import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/staff/money/charge_pick.dart';

void main() {
  final garbage = {
    'id': 'c1',
    'name': 'Garbage',
    'kind': 'FIXED',
    'amount': 30000,
    'unitIds': <String>[],
    'status': 'ACTIVE',
  };
  final parking = {
    'id': 'c2',
    'name': 'Parking',
    'kind': 'FIXED',
    'amount': 100050,
    'unitIds': ['u3'],
    'status': 'ACTIVE',
  };
  final water = {
    'id': 'c3',
    'name': 'Water',
    'kind': 'METERED',
    'unitRate': 15000,
    'unitLabel': 'm³',
    'unitIds': <String>[],
    'status': 'ACTIVE',
  };
  final power = {
    'id': 'c4',
    'name': 'Electricity',
    'kind': 'VARIABLE',
    'unitIds': <String>[],
    'status': 'ACTIVE',
  };
  final old = {...garbage, 'id': 'c5', 'name': 'Old', 'status': 'INACTIVE'};

  test('offers the active charges that apply to the unit', () {
    final all = [garbage, parking, water, power, old];
    expect(chargesForUnit(all, 'u1').map((c) => c['name']), [
      'Garbage',
      'Water',
      'Electricity',
    ]);
    expect(chargesForUnit(all, 'u3').map((c) => c['name']), [
      'Garbage',
      'Parking',
      'Water',
      'Electricity',
    ]);
  });

  test('describes each charge and fills the line', () {
    expect(chargeOptionLabel(garbage), startsWith('Garbage · KES 300'));
    expect(chargeOptionLabel(garbage), endsWith('a month'));
    expect(chargeOptionLabel(water), contains('per m³'));
    expect(chargeOptionLabel(power), 'Electricity · amount varies');
    expect(chargeLineFor(garbage), (description: 'Garbage', amount: '300'));
    expect(chargeLineFor(parking), (description: 'Parking', amount: '1000.50'));
    expect(chargeLineFor(power), (description: 'Electricity', amount: ''));
  });
}
