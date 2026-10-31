import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/dates.dart';
import '../../../core/money.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/common.dart';
import '../staff_api.dart';
import '../staff_widgets.dart';
import '../tenants/record_payment_sheet.dart';

/// Home: this month's figures from `GET /reports/dashboard`, and quick actions.
class StaffHomeScreen extends ConsumerWidget {
  const StaffHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canReports = can(ref, 'reports:view');
    return StaffTabScaffold(
      title: 'Home',
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dashboardProvider);
          try {
            await ref.read(dashboardProvider.future);
          } catch (_) {
            // Shown on the screen with a retry.
          }
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const _QuickActions(),
            const SizedBox(height: 16),
            if (canReports)
              const _DashboardBody()
            else
              const EmptyState(
                icon: Icons.insights_outlined,
                title: 'Figures aren’t available for your role',
                body: 'Use the tabs below to find units, tenants and payments.',
              ),
          ],
        ),
      ),
    );
  }
}

class _QuickActions extends ConsumerWidget {
  const _QuickActions();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final scheme = Theme.of(context).colorScheme;
    final actions = <(IconData, String, VoidCallback, bool)>[
      if (can(ref, 'payments:create'))
        (
          Icons.add,
          'Record payment',
          () => RecordPaymentSheet.show(context),
          true,
        ),
      if (can(ref, 'meters:create'))
        (
          Icons.speed_outlined,
          'Read a meter',
          () => context.go('/staff/more/meters'),
          false,
        ),
      if (can(ref, 'expenses:create'))
        (
          Icons.receipt_outlined,
          'Add expense',
          () => context.go('/staff/more/expenses/new'),
          false,
        ),
    ];
    if (actions.isEmpty) return const SizedBox.shrink();
    return Row(
      children: [
        for (final (i, a) in actions.indexed) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: Material(
              color: a.$4
                  ? HodiColors.lime
                  : (dark ? scheme.surfaceContainerLowest : Colors.white),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: a.$4
                    ? BorderSide.none
                    : BorderSide(color: scheme.outlineVariant),
              ),
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: a.$3,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: 12,
                    horizontal: 8,
                  ),
                  child: Column(
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: a.$4
                              ? HodiColors.navy.withValues(alpha: 0.14)
                              : (dark
                                    ? HodiColors.limeSoftDark
                                    : HodiColors.limeSoft),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          a.$1,
                          size: 18,
                          color: a.$4
                              ? HodiColors.navy
                              : (dark ? HodiColors.lime : HodiColors.limeHover),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        a.$2,
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: a.$4
                              ? HodiColors.navy
                              : (dark ? Colors.white : HodiColors.navy),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

String _percent(double? rate) =>
    rate == null ? '—' : '${(rate * 100).round()}%';

class _DashboardBody extends ConsumerWidget {
  const _DashboardBody();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dash = ref.watch(dashboardProvider);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return AsyncBody(
      value: dash,
      onRetry: () => ref.invalidate(dashboardProvider),
      data: (d) {
        final progress = (d.collectionRate ?? 0).clamp(0.0, 1.0);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            CurvedHeroCard(
              kicker: 'COLLECTED · ${formatPeriod(d.period)}',
              trailing: GestureDetector(
                onTap: () => context.push('/staff/more/reports'),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text(
                    'Reports →',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              children: [
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    formatKes(d.collected),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.8,
                      height: 1.05,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 8,
                    backgroundColor: Colors.white.withValues(alpha: 0.16),
                    valueColor: const AlwaysStoppedAnimation<Color>(
                      HodiColors.lime,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${_percent(d.collectionRate)} of this month’s invoices',
                  style: const TextStyle(
                    color: Color(0xFFB8C6D9),
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Divider(color: Color(0x24FFFFFF), height: 1),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Invoiced',
                      style: TextStyle(color: Color(0xFFB8C6D9), fontSize: 13),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          formatKes(d.invoiced),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _Figure(
                    'Arrears',
                    formatKes(d.arrears),
                    note: 'Overdue, as of today',
                    alert: d.arrears > 0,
                    onTap: () => context.push('/staff/more/reports'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Figure(
                    'Occupancy',
                    _percent(d.occupancyRate),
                    note:
                        '${d.occupied + d.notice} of ${d.units} let · ${d.vacant} vacant',
                    onTap: () => context.go('/staff/units'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _Figure(
                    'Expenses',
                    formatKes(d.expenses),
                    note: 'Net: ${formatKes(d.net)}',
                    onTap: can(ref, 'expenses:view')
                        ? () => context.push('/staff/more/expenses')
                        : null,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Figure(
                    'P&L & Aging',
                    formatPeriod(d.period),
                    note: 'Full financial statements →',
                    onTap: () => context.push('/staff/more/reports'),
                  ),
                ),
              ],
            ),
            if (d.trend.isNotEmpty) ...[
              const SizedBox(height: 12),
              _TrendChartCard(trend: d.trend),
            ],
            if (d.unmatchedMpesa != null && d.unmatchedMpesa! > 0) ...[
              const SizedBox(height: 12),
              Material(
                color: dark
                    ? HodiColors.info.withValues(alpha: 0.22)
                    : const Color(0xFFEBF1FA),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(
                    color: HodiColors.info.withValues(alpha: 0.22),
                  ),
                ),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => context.go('/staff/money?tab=mpesa'),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: dark ? HodiColors.surfaceDark : Colors.white,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            Icons.phone_iphone,
                            size: 20,
                            color: dark
                                ? const Color(0xFF93C5FD)
                                : HodiColors.info,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${d.unmatchedMpesa} M-Pesa ${d.unmatchedMpesa == 1 ? 'payment needs' : 'payments need'} matching',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13.5,
                                  color: dark ? Colors.white : HodiColors.navy,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Review and assign to a tenant',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Assign →',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: dark
                                ? const Color(0xFF93C5FD)
                                : HodiColors.info,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
            if (d.topOverdue.isNotEmpty) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'Most overdue',
                trailing: TextButton(
                  onPressed: () => context.push('/staff/more/reports'),
                  child: const Text('See all →'),
                ),
                children: [
                  for (final (idx, r) in d.topOverdue.indexed) ...[
                    if (idx > 0) const Divider(height: 1),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: UnitBadge(r.tenant.code, width: 52),
                      title: Text(
                        r.tenant.name,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        r.oldestDueDate == null
                            ? r.tenant.code
                            : 'Since ${formatDay(r.oldestDueDate)}',
                      ),
                      trailing: Text(
                        formatKes(r.overdue),
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: toneColor(context, Tone.bad),
                        ),
                      ),
                      onTap: can(ref, 'tenants:view')
                          ? () => context.push('/staff/tenants/${r.tenant.id}')
                          : null,
                    ),
                  ],
                ],
              ),
            ],
          ],
        );
      },
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure(
    this.label,
    this.value, {
    this.note,
    this.alert = false,
    this.onTap,
  });
  final String label;
  final String value;
  final String? note;
  final bool alert;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: dark ? scheme.surfaceContainerLowest : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: scheme.outlineVariant),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Kicker(label),
              const SizedBox(height: 6),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  value,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: alert
                        ? toneColor(context, Tone.warn)
                        : (dark ? Colors.white : HodiColors.navy),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (note != null) ...[
                const SizedBox(height: 4),
                Text(
                  note!,
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 12,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _TrendChartCard extends StatelessWidget {
  const _TrendChartCard({required this.trend});
  final List<({String period, int invoiced, int collected, int expenses})>
  trend;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final recent = trend.length > 6 ? trend.sublist(trend.length - 6) : trend;
    var maxVal = 1;
    for (final t in recent) {
      if (t.invoiced > maxVal) maxVal = t.invoiced;
      if (t.collected > maxVal) maxVal = t.collected;
      if (t.expenses > maxVal) maxVal = t.expenses;
    }

    return SectionCard(
      title: '6-month cashflow trend',
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _LegendDot(
            color: dark ? const Color(0xFF60A5FA) : HodiColors.navy,
            label: 'Invoiced',
          ),
          const SizedBox(width: 8),
          const _LegendDot(color: HodiColors.lime, label: 'Collected'),
          const SizedBox(width: 8),
          _LegendDot(color: toneColor(context, Tone.warn), label: 'Expenses'),
        ],
      ),
      children: [
        const SizedBox(height: 8),
        SizedBox(
          height: 128,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final t in recent)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              _Bar(
                                fraction: (t.invoiced / maxVal).clamp(
                                  0.04,
                                  1.0,
                                ),
                                color: dark
                                    ? const Color(0xFF60A5FA)
                                    : HodiColors.navy,
                              ),
                              const SizedBox(width: 3),
                              _Bar(
                                fraction: (t.collected / maxVal).clamp(
                                  0.04,
                                  1.0,
                                ),
                                color: HodiColors.lime,
                              ),
                              if (t.expenses > 0) ...[
                                const SizedBox(width: 3),
                                _Bar(
                                  fraction: (t.expenses / maxVal).clamp(
                                    0.04,
                                    1.0,
                                  ),
                                  color: toneColor(context, Tone.warn),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          t.period.length >= 7
                              ? t.period.substring(5, 7)
                              : t.period,
                          style: TextStyle(
                            fontFamily: 'JetBrainsMono',
                            fontSize: 10.5,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({required this.fraction, required this.color});
  final double fraction;
  final Color color;

  @override
  Widget build(BuildContext context) => FractionallySizedBox(
    heightFactor: fraction,
    child: Container(
      width: 8,
      decoration: BoxDecoration(
        color: color,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
      ),
    ),
  );
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
      const SizedBox(width: 4),
      Text(
        label,
        style: TextStyle(
          fontSize: 10.5,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    ],
  );
}
