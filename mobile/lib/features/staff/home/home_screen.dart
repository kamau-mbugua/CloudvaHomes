import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/dates.dart';
import '../../../core/money.dart';
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
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: Card(
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: a.$3,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: 14,
                    horizontal: 6,
                  ),
                  child: Column(
                    children: [
                      Icon(
                        a.$1,
                        color: Theme.of(context).colorScheme.secondary,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        a.$2,
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 13),
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
    final text = Theme.of(context).textTheme;
    return AsyncBody(
      value: dash,
      onRetry: () => ref.invalidate(dashboardProvider),
      data: (d) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(formatPeriod(d.period), style: text.titleMedium),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _Figure('Invoiced', formatKes(d.invoiced))),
              const SizedBox(width: 8),
              Expanded(
                child: _Figure(
                  'Collected',
                  formatKes(d.collected),
                  note:
                      '${_percent(d.collectionRate)} of this month’s invoices',
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _Figure(
                  'Arrears',
                  formatKes(d.arrears),
                  note: 'Overdue, as of today',
                  alert: d.arrears > 0,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _Figure(
                  'Occupancy',
                  _percent(d.occupancyRate),
                  note:
                      '${d.occupied + d.notice} of ${d.units} let · ${d.vacant} vacant',
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
                    trailing: Text(formatKes(r.overdue)),
                    onTap: can(ref, 'tenants:view')
                        ? () => context.go('/staff/tenants/${r.tenant.id}')
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
  const _Figure(this.label, this.value, {this.note, this.alert = false});
  final String label;
  final String value;
  final String? note;
  final bool alert;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
            ),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                value,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: alert ? scheme.error : null,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (note != null) ...[
              const SizedBox(height: 2),
              Text(
                note!,
                style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
