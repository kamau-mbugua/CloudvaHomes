import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/dates.dart';
import '../../core/money.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import 'dashboard_rules.dart';
import 'home_scope.dart';
import 'tenant_api.dart';
import 'tenant_home_screen.dart' show PayWayView, showTenantPaySheet;

String? _tenancyOf(HomeScope s) => s is OneHome ? s.tenancyId : null;

final _monthlyProvider = FutureProvider.autoDispose
    .family<List<MonthlyPoint>, String?>(
      (ref, tenancyId) =>
          ref.watch(tenantApiProvider).monthly(tenancyId: tenancyId),
    );

final _activityProvider = FutureProvider.autoDispose
    .family<List<ActivityItem>, String?>(
      (ref, tenancyId) =>
          ref.watch(tenantApiProvider).activity(tenancyId: tenancyId),
    );

/// Open repairs and inspection states for the homes in scope (a person has few accounts).
final _extrasProvider =
    FutureProvider.autoDispose<
      ({List<TenantMaintenanceRequest> open, List<InspectionState> inspections})
    >((ref) async {
      final all = await ref.watch(allHomesProvider.future);
      final scope = ref.watch(homeScopeProvider);
      final api = ref.watch(tenantApiProvider);
      final homes = [
        for (final h in all.homes)
          if ((h.status == 'ACTIVE' || h.status == 'NOTICE') &&
              (scope is AllHomes ||
                  (scope is OneHome && scope.tenancyId == h.id)))
            h,
      ];
      final accountIds = {for (final h in homes) h.tenantId};
      final pages = await Future.wait([
        for (final id in accountIds) api.requests(id),
      ]);
      final unitNames = {for (final h in homes) h.unit};
      final open = [
        for (final p in pages)
          for (final r in p.rows)
            if ((r.status == 'OPEN' || r.status == 'IN_PROGRESS') &&
                (scope is AllHomes || unitNames.contains(r.unitNumber)))
              r,
      ];
      final lists = await Future.wait([
        for (final h in homes)
          api
              .inspections(h.tenantId, h.id)
              .then(
                (l) => [
                  for (final i in l)
                    (
                      tenancyId: h.id,
                      kind: i.kind,
                      acknowledged: i.acknowledged,
                    ),
                ],
              )
              .catchError((_) => <InspectionState>[]),
      ]);
      return (open: open, inspections: [for (final l in lists) ...l]);
    });

/// The tenant dashboard (tenant portal redesign): to pay per landlord, my homes, billed vs
/// paid, recent activity, maintenance, to do and deposits — for all homes or the selected one.
class TenantDashboardScreen extends ConsumerWidget {
  const TenantDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final all = ref.watch(allHomesProvider);
    final scope = ref.watch(homeScopeProvider);
    return all.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(messageOf(e)),
        ),
      ),
      data: (o) {
        final homes = [
          for (final h in o.homes)
            if ((h.status == 'ACTIVE' || h.status == 'NOTICE') &&
                (scope is AllHomes ||
                    (scope is OneHome && scope.tenancyId == h.id)))
              h,
        ];
        final rows = toPayByLandlord(o, scope);
        final extras = ref.watch(_extrasProvider).valueOrNull;
        final todo = todoItems(
          o.homes,
          scope,
          extras?.inspections ?? const [],
          todayIso(),
        );
        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(allHomesProvider);
            ref.invalidate(_extrasProvider);
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _Hero(o: o, rows: rows, homes: homes),
              if (scope is AllHomes && homes.length > 1) ...[
                const SizedBox(height: 16),
                Text(
                  'My homes',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                for (final h in homes) _HomeCard(home: h),
              ],
              const SizedBox(height: 8),
              _BilledVsPaid(tenancyId: _tenancyOf(scope)),
              _Activity(
                tenancyId: _tenancyOf(scope),
                severalLandlords: rows.length > 1,
              ),
              SectionCard(
                title: 'Maintenance',
                trailing: TextButton(
                  onPressed: () => context.go('/tenant/requests'),
                  child: const Text('All'),
                ),
                children: [
                  Text(
                    '${extras?.open.length ?? 0} open',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  for (final r
                      in (extras?.open ?? const <TenantMaintenanceRequest>[])
                          .take(2))
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(r.title),
                      subtitle: Text(
                        r.status == 'IN_PROGRESS' ? 'In progress' : 'Open',
                      ),
                    ),
                ],
              ),
              if (todo.isNotEmpty)
                SectionCard(
                  title: 'To do',
                  children: [
                    for (final t in todo)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.flag_outlined),
                        title: Text(t.text),
                        onTap: () => context.go(t.route),
                      ),
                  ],
                ),
              SectionCard(
                title: 'Deposit held',
                children: [
                  for (final a in o.accounts)
                    if (rows.any((r) => r.tenantId == a.tenantId))
                      Row(
                        children: [
                          Expanded(child: Text(a.orgName)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              formatKes(a.depositHeld),
                              textAlign: TextAlign.end,
                            ),
                          ),
                        ],
                      ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Hero extends ConsumerWidget {
  const _Hero({required this.o, required this.rows, required this.homes});
  final ConsolidatedOverview o;
  final List<LandlordToPay> rows;
  final List<Home> homes;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final total = heroTotal(rows);
    final button = payButton(rows);
    final owing = rows.where((r) => r.owed > 0).toList();
    final next = ([for (final h in homes) ?h.nextDueDate]..sort()).firstOrNull;
    final where = homes.length > 1
        ? 'Across ${homes.length} homes'
        : (homes.isEmpty ? 'No current home' : homeLabel(homes.first));
    const light = TextStyle(color: Colors.white70);
    return CurvedHeroCard(
      kicker: total > 0 ? 'To pay' : 'Nothing to pay',
      children: [
        Text(
          formatKes(total),
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        Text(
          next == null ? where : '$where · next due ${formatDay(next)}',
          style: light,
        ),
        if (owing.length > 1)
          for (final r in owing)
            Row(
              children: [
                Expanded(child: Text(r.orgName, style: light)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    formatKes(r.owed),
                    style: light,
                    textAlign: TextAlign.end,
                  ),
                ),
              ],
            ),
        for (final r in rows.where((r) => r.credit > 0))
          Text(
            '${formatKes(r.credit)} in credit with ${r.orgName}',
            style: light,
          ),
        const SizedBox(height: 12),
        if (button != null)
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: HodiColors.lime,
              foregroundColor: HodiColors.navy,
              minimumSize: const Size.fromHeight(48),
            ),
            onPressed: () => _payNow(context, ref, button.opens),
            child: Text(button.label),
          ),
      ],
    );
  }

  void _payNow(BuildContext context, WidgetRef ref, String opens) {
    TenantOverview? accountOf(String id) =>
        o.accounts.where((a) => a.tenantId == id).firstOrNull;
    if (opens == 'prompt') {
      final a = accountOf(rows.first.tenantId);
      if (a != null) {
        showTenantPaySheet(
          context,
          ref,
          a,
          onSuccess: () => ref.invalidate(allHomesProvider),
        );
      }
      return;
    }
    final list = rows.where((r) => r.owed > 0).isEmpty
        ? rows
        : rows.where((r) => r.owed > 0).toList();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            Text(
              list.length == 1
                  ? 'Pay ${list.first.orgName}'
                  : 'Who do you want to pay?',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (list.length > 1)
              const Text('Each landlord or agency is paid separately.'),
            for (final r in list)
              ExpansionTile(
                // No M-Pesa prompt for this landlord: the details are the way to pay.
                initiallyExpanded: !r.canPayInApp,
                tilePadding: EdgeInsets.zero,
                title: Text(r.orgName),
                subtitle: Text(
                  r.owed > 0 ? '${formatKes(r.owed)} to pay' : 'Nothing to pay',
                ),
                trailing: r.canPayInApp
                    ? FilledButton(
                        onPressed: () {
                          Navigator.pop(sheet);
                          final a = accountOf(r.tenantId);
                          if (a != null) {
                            showTenantPaySheet(
                              context,
                              ref,
                              a,
                              onSuccess: () => ref.invalidate(allHomesProvider),
                            );
                          }
                        },
                        child: const Text('Pay'),
                      )
                    : null,
                children: [
                  for (final w
                      in accountOf(r.tenantId)?.howToPay ?? const <PayWay>[])
                    PayWayView(w),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _HomeCard extends ConsumerWidget {
  const _HomeCard({required this.home});
  final Home home;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (text, color) = home.overdue > 0
        ? (
            '${formatKes(home.overdue)} overdue${home.daysLate > 0 ? ' · ${home.daysLate} days late' : ''}',
            Theme.of(context).colorScheme.error,
          )
        : home.due > 0
        ? ('${formatKes(home.due)} due', null)
        : ('Paid up', const Color(0xFF3D7D16));
    return Card(
      child: ListTile(
        title: Text(homeLabel(home)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              text,
              style: TextStyle(color: color, fontWeight: FontWeight.w600),
            ),
            Text(
              '${home.orgName} · Rent ${formatKes(home.rent)}${home.leaseEndDate != null ? ' · lease ends ${formatDay(home.leaseEndDate)}' : ''}',
            ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => ref
            .read(homeScopeRawProvider.notifier)
            .set(OneHome(home.tenantId, home.id)),
      ),
    );
  }
}

const _chartMonths = 6;

/// Billed (navy) vs paid (lime) per month. Bars scale to the space left after the month
/// labels, so larger text never overflows; tap a month for its figures (the latest month
/// shows by default).
class _BilledVsPaid extends ConsumerStatefulWidget {
  const _BilledVsPaid({required this.tenancyId});
  final String? tenancyId;

  @override
  ConsumerState<_BilledVsPaid> createState() => _BilledVsPaidState();
}

class _BilledVsPaidState extends ConsumerState<_BilledVsPaid> {
  int? _picked;

  @override
  Widget build(BuildContext context) {
    final points = ref.watch(_monthlyProvider(widget.tenancyId)).valueOrNull;
    final theme = Theme.of(context);
    final title = 'Billed vs paid · last $_chartMonths months';
    if (points == null) {
      return SectionCard(title: title, children: const [SizedBox(height: 120)]);
    }
    final peak = points.fold<int>(
      0,
      (m, p) => [m, p.invoiced, p.paid].reduce((a, b) => a > b ? a : b),
    );
    if (peak == 0) {
      return SectionCard(
        title: title,
        children: const [Text('Nothing billed or paid in these months yet.')],
      );
    }
    final picked = (_picked ?? points.length - 1).clamp(0, points.length - 1);
    final shown = points[picked];
    final scaler = MediaQuery.textScalerOf(context);
    final labelHeight =
        scaler.scale(theme.textTheme.labelSmall?.fontSize ?? 11) * 1.4 + 6;

    return SectionCard(
      title: title,
      children: [
        SizedBox(
          height: 110 + labelHeight,
          child: LayoutBuilder(
            builder: (context, box) {
              final barMax = box.maxHeight - labelHeight;
              Widget bar(int v, Color c) => Container(
                width: 8,
                height: v <= 0 ? 0 : (barMax * v / peak).clamp(2, barMax),
                decoration: BoxDecoration(
                  color: c,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(2),
                  ),
                ),
              );
              return Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final (i, p) in points.indexed)
                    Expanded(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(6),
                        onTap: () => setState(() => _picked = i),
                        child: Container(
                          decoration: BoxDecoration(
                            color: i == picked
                                ? theme.colorScheme.primary.withValues(
                                    alpha: 0.06,
                                  )
                                : null,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  bar(p.invoiced, HodiColors.navy),
                                  const SizedBox(width: 2),
                                  bar(p.paid, HodiColors.lime),
                                ],
                              ),
                              SizedBox(
                                height: labelHeight,
                                child: Center(
                                  child: FittedBox(
                                    fit: BoxFit.scaleDown,
                                    child: Text(
                                      formatPeriodShort(p.period),
                                      style: theme.textTheme.labelSmall
                                          ?.copyWith(
                                            fontWeight: i == picked
                                                ? FontWeight.w700
                                                : null,
                                          ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
        const SizedBox(height: 6),
        Text(
          '${formatPeriod(shown.period)}: billed ${formatKes(shown.invoiced)} · paid ${formatKes(shown.paid)}',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 6),
        const Wrap(
          spacing: 12,
          runSpacing: 4,
          children: [
            _Key(HodiColors.navy, 'Billed'),
            _Key(HodiColors.lime, 'Paid'),
          ],
        ),
      ],
    );
  }
}

class _Key extends StatelessWidget {
  const _Key(this.color, this.label);
  final Color color;
  final String label;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(width: 10, height: 10, color: color),
      const SizedBox(width: 4),
      Text(label),
    ],
  );
}

class _Activity extends ConsumerWidget {
  const _Activity({required this.tenancyId, required this.severalLandlords});
  final String? tenancyId;
  final bool severalLandlords;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items =
        ref.watch(_activityProvider(tenancyId)).valueOrNull ??
        const <ActivityItem>[];
    return SectionCard(
      title: 'Recent activity',
      children: [
        if (items.isEmpty) const Text('Nothing yet.'),
        for (final a in items)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(switch (a.kind) {
              'PAYMENT' => Icons.check_circle_outline,
              'INVOICE' => Icons.receipt_long_outlined,
              'RENT_CHANGE' => Icons.trending_up,
              _ => Icons.notifications_none,
            }),
            title: Text(a.title),
            subtitle: Text(
              '${formatDay(a.at.substring(0, 10))}${severalLandlords ? ' · ${a.orgName}' : ''}',
            ),
            trailing: a.amount == null ? null : Text(formatKes(a.amount!)),
            onTap: () => context.go(
              a.link.startsWith('/tenant/invoices/')
                  ? '/tenant/invoices'
                  : a.link,
            ),
          ),
      ],
    );
  }
}
