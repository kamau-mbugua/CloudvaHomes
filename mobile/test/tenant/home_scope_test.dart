import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/tenant/home_scope.dart';
import 'package:hodi/features/tenant/tenant_api.dart';

Home home(
  String id,
  String tenantId,
  String unit,
  String property,
  String org, {
  String status = 'ACTIVE',
}) => Home(
  id: id,
  tenantId: tenantId,
  orgName: org,
  unit: unit,
  property: property,
  rent: 100,
  billingDay: 1,
  status: status,
  startDate: '2026-01-01',
);

final homes = [
  home('ty1', 'acc1', 'G1', 'Acacia Heights', 'Ivory Breeze'),
  home('ty2', 'acc1', 'B4', 'Palm Gardens', 'Ivory Breeze', status: 'NOTICE'),
  home('ty3', 'acc2', 'Shop 2', 'Ruaka Mall', 'Ruaka Estates'),
  home('ty0', 'acc2', 'Old 1', 'Ruaka Mall', 'Ruaka Estates', status: 'ENDED'),
];

void main() {
  test('lists homes still lived in, named with their landlord', () {
    expect(homeOptions(homes).map((o) => o.label), [
      'G1, Acacia Heights · Ivory Breeze',
      'B4, Palm Gardens · Ivory Breeze',
      'Shop 2, Ruaka Mall · Ruaka Estates',
    ]);
  });

  test(
    'restores a saved home; ended, unknown or garbage falls back to all',
    () {
      final options = homeOptions(homes);
      expect(
        resolveScope(serializeScope(const OneHome('acc2', 'ty3')), options),
        const OneHome('acc2', 'ty3'),
      );
      expect(
        resolveScope(serializeScope(const OneHome('acc2', 'ty0')), options),
        const AllHomes(),
      );
      expect(resolveScope('nonsense', options), const AllHomes());
      expect(resolveScope(null, options), const AllHomes());
    },
  );

  test('keys the saved choice by person', () {
    expect(homeScopeKey('u1'), 'tenant.home.u1');
  });

  test('names the other homes on the same landlord account', () {
    expect(otherHomesOnAccount(homes, const OneHome('acc1', 'ty1')), [
      'B4, Palm Gardens',
    ]);
    expect(otherHomesOnAccount(homes, const AllHomes()), isEmpty);
  });
}
