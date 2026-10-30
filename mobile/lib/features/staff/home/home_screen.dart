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
    final actions = <(IconData, String, VoidCallback)>[
      if (can(ref, 'payments:create'))
        (
          Icons.payments_outlined,
          'Record payment',
          () => RecordPaymentSheet.show(context),
        ),
      if (can(ref, 'meters:create'))
        (
          Icons.speed_outlined,
          'Read a meter',
          () => context.go('/staff/more/meters'),
        ),
      if (can(ref, 'expenses:create'))
        (
          Icons.receipt_outlined,
          'Add expense',
          () => context.go('/staff/more/expenses/new'),
        ),
    ];
    if (actions.isEmpty) return const SizedBox.shrink();
    return Row(
      children: [
        for (final (i, a) in actions.indexed) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(
            child: Card(
              child: InkWell(
                borderRadius: BorderRadius.circular(18),
                onTap: a.$3,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: 14,
                    horizontal: 8,
                  ),
                  child: Column(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: dark
                              ? HodiColors.limeSoft
                              : HodiColors.skySoft,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          a.$1,
                          size: 20,
                          color: dark ? HodiColors.lime : HodiColors.navy,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        a.$2,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
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
    return AsyncBody(
      value: dash,
      onRetry: () => ref.invalidate(dashboardProvider),
      data: (d) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CurvedHeroCard(
            label: 'Collected',
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                formatPeriod(d.period),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
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
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${_percent(d.collectionRate)} of this month’s invoices',
                style: const TextStyle(color: Color(0xCCFFFFFF), fontSize: 13),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(color: Color(0x2EFFFFFF), height: 1),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Invoiced',
                    style: TextStyle(color: Color(0xCCFFFFFF), fontSize: 13),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        formatKes(d.invoiced),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
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
                  tint: d.arrears > 0
                      ? HodiColors.roseSoft
                      : HodiColors.skySoft,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Figure(
                  'Occupancy',
                  _percent(d.occupancyRate),
                  note:
                      '${d.occupied + d.notice} of ${d.units} let · ${d.vacant} vacant',
                  tint: HodiColors.mintSoft,
                ),
              ),
            ],
          ),
          if (d.unmatchedMpesa != null && d.unmatchedMpesa! > 0) ...[
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: const Icon(Icons.help_outline),
                title: Text(
                  '${d.unmatchedMpesa} M-Pesa ${d.unmatchedMpesa == 1 ? 'payment needs' : 'payments need'} matching',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.go('/staff/money?tab=mpesa'),
              ),
            ),
          ],
          if (d.topOverdue.isNotEmpty) ...[
            const SizedBox(height: 12),
            SectionCard(
              title: 'Most overdue',
              children: [
                for (final r in d.topOverdue)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(r.tenant.name),
                    subtitle: Text(
                      r.oldestDueDate == null
                          ? r.tenant.code
                          : 'Since ${formatDay(r.oldestDueDate)}',
                    ),
                    trailing: Text(
                      formatKes(r.overdue),
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    onTap: can(ref, 'tenants:view')
                        ? () => context.push('/staff/tenants/${r.tenant.id}')
                        : null,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure(
    this.label,
    this.value, {
    this.note,
    this.alert = false,
    this.tint,
  });
  final String label;
  final String value;
  final String? note;
  final bool alert;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      decoration: BoxDecoration(
        color: dark ? scheme.surfaceContainerLowest : (tint ?? Colors.white),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: scheme.onSurfaceVariant,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: alert
                    ? scheme.error
                    : (dark ? Colors.white : HodiColors.navy),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          if (note != null) ...[
            const SizedBox(height: 4),
            Text(
              note!,
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }
}
