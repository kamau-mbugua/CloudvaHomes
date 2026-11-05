import '../../core/money.dart';
import 'home_scope.dart';
import 'tenant_api.dart';

/// Pure rules behind the tenant dashboard (tenant portal redesign). Mirrors
/// frontend/src/features/tenant/dashboard.ts: money stays per landlord.

class LandlordToPay {
  const LandlordToPay(
    this.tenantId,
    this.orgName,
    this.owed,
    this.credit,
    this.canPayInApp,
  );
  final String tenantId;
  final String orgName;
  final int owed;
  final int credit;
  final bool canPayInApp;
}

/// One row per landlord account in scope; those owing first, biggest first.
List<LandlordToPay> toPayByLandlord(ConsolidatedOverview o, HomeScope s) {
  final rows = [
    for (final a in o.accounts)
      if (s is AllHomes || (s is OneHome && s.tenantId == a.tenantId))
        LandlordToPay(a.tenantId, a.orgName, a.owed, a.credit, a.canPayInApp),
  ];
  rows.sort((a, b) => b.owed.compareTo(a.owed));
  return rows;
}

int heroTotal(List<LandlordToPay> rows) =>
    rows.fold(0, (sum, r) => sum + r.owed);

class TodoItem {
  const TodoItem(this.kind, this.text, this.route);
  final String kind;
  final String text;
  final String route;
}

typedef InspectionState = ({String tenancyId, String kind, bool acknowledged});

const _leaseWarningDays = 60;

/// Overdue homes, unchecked inspections and leases ending within 60 days, in scope.
List<TodoItem> todoItems(
  List<Home> homes,
  HomeScope s,
  List<InspectionState> inspections,
  String today,
) {
  final inScope = [
    for (final h in homes)
      if ((h.status == 'ACTIVE' || h.status == 'NOTICE') &&
          (s is AllHomes || (s is OneHome && s.tenancyId == h.id)))
        h,
  ];
  final names = {for (final h in inScope) h.id: homeLabel(h)};
  final out = <TodoItem>[];
  for (final h in inScope) {
    if (h.overdue > 0) {
      final late = h.daysLate > 0
          ? ', ${h.daysLate} day${h.daysLate == 1 ? '' : 's'} late'
          : '';
      out.add(
        TodoItem(
          'OVERDUE',
          '${homeLabel(h)}: ${formatKes(h.overdue)} overdue$late',
          '/tenant/invoices',
        ),
      );
    }
  }
  for (final i in inspections) {
    if (!names.containsKey(i.tenancyId) || i.acknowledged) continue;
    final what = i.kind == 'MOVE_OUT' ? 'move-out' : 'move-in';
    out.add(
      TodoItem(
        'INSPECTION',
        'Check your $what inspection for ${names[i.tenancyId]}',
        '/tenant/documents',
      ),
    );
  }
  final now = DateTime.parse(today);
  for (final h in inScope) {
    final end = h.leaseEndDate;
    if (end == null) continue;
    final left = DateTime.parse(end).difference(now).inDays;
    if (left >= 0 && left <= _leaseWarningDays) {
      out.add(
        TodoItem(
          'LEASE_ENDING',
          'Your lease for ${homeLabel(h)} ends in $left day${left == 1 ? '' : 's'}',
          '/tenant/documents',
        ),
      );
    }
  }
  return out;
}
