import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/tenant/dashboard_rules.dart';
import 'package:hodi/features/tenant/home_scope.dart';
import 'package:hodi/features/tenant/tenant_api.dart';
import 'package:hodi/features/tenant/tenant_shell.dart';

TenantOverview account(String id, String org, int owed, {int credit = 0}) =>
    TenantOverview(
      tenantId: id,
      code: id,
      firstName: 'A',
      phone: null,
      orgName: org,
      orgPhone: null,
      orgEmail: null,
      owed: owed,
      credit: credit,
      depositHeld: 0,
      homes: const [],
      openInvoices: const [],
      howToPay: const [],
      canPayInApp: true,
    );

Home home(
  String id,
  String tenantId, {
  int overdue = 0,
  int daysLate = 0,
  String? leaseEnd,
}) => Home(
  id: id,
  tenantId: tenantId,
  orgName: 'Org',
  unit: id.toUpperCase(),
  property: 'Court',
  rent: 1,
  billingDay: 1,
  status: 'ACTIVE',
  startDate: '2026-01-01',
  overdue: overdue,
  daysLate: daysLate,
  leaseEndDate: leaseEnd,
);

void main() {
  final o = ConsolidatedOverview(
    owed: 4150000,
    credit: 100000,
    depositHeld: 0,
    homes: [home('g1', 'a1'), home('s2', 'a2')],
    accounts: [
      account('a1', 'Ivory Breeze', 1600000),
      account('a2', 'Ruaka Estates', 2550000),
      account('a3', 'Old Landlord', 0, credit: 100000),
    ],
  );

  test(
    'keeps each landlord separate and never nets credit across landlords',
    () {
      final rows = toPayByLandlord(o, const AllHomes());
      expect(rows.map((r) => (r.orgName, r.owed, r.credit)).toList(), [
        ('Ruaka Estates', 2550000, 0),
        ('Ivory Breeze', 1600000, 0),
        ('Old Landlord', 0, 100000),
      ]);
      expect(heroTotal(rows), 4150000);
      expect(
        toPayByLandlord(o, const OneHome('a1', 'g1')).map((r) => r.orgName),
        ['Ivory Breeze'],
      );
    },
  );

  test(
    'to do: overdue homes, unchecked inspections, leases ending within 60 days',
    () {
      final homes = [
        home('g1', 'a1', overdue: 900000, daysLate: 9, leaseEnd: '2026-12-05'),
        home('b4', 'a1', leaseEnd: '2027-03-01'),
      ];
      final items = todoItems(homes, const AllHomes(), const [
        (tenancyId: 'b4', kind: 'MOVE_IN', acknowledged: false),
        (tenancyId: 'g1', kind: 'MOVE_IN', acknowledged: true),
      ], '2026-11-05');
      expect(items.map((i) => i.kind), [
        'OVERDUE',
        'INSPECTION',
        'LEASE_ENDING',
      ]);
      expect(items.first.text, contains('G1, Court'));
      expect(
        todoItems(homes, const OneHome('a1', 'b4'), const [], '2026-11-05'),
        isEmpty,
      );
    },
  );

  test('five tabs in the design order', () {
    expect(tenantTabs.map((t) => t.label), [
      'Home',
      'Bills',
      'Payments',
      'Repairs',
      'More',
    ]);
    expect(tenantTabs.map((t) => t.path), [
      '/tenant',
      '/tenant/invoices',
      '/tenant/payments',
      '/tenant/requests',
      '/tenant/more',
    ]);
  });
}
