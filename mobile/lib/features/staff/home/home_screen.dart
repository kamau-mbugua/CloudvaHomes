import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_error.dart';
import '../../../core/auth/session.dart';
import '../../../core/auth/session_controller.dart';
import '../../../core/dates.dart';
import '../../../core/money.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/common.dart';
import '../staff_api.dart';
import '../staff_models.dart';
import '../staff_widgets.dart';
import '../tenants/record_payment_sheet.dart';

/// Home: this month's figures from `GET /reports/dashboard`, portfolio/property
/// switcher (consolidated + single-property default), and quick actions.
class StaffHomeScreen extends ConsumerWidget {
  const StaffHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canReports = can(ref, 'reports:view');
    return StaffTabScaffold(
      title: 'Home',
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(propertiesProvider);
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
            const _PortfolioSwitcherBar(),
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

Future<void> _switchStaffProperty(
  BuildContext context,
  WidgetRef ref, {
  required String? propertyId,
  String? propertyName,
}) async {
  try {
    await ref
        .read(sessionProvider.notifier)
        .switchContext(propertyId: propertyId);
    ref.invalidate(dashboardProvider);
    ref.read(listsVersionProvider.notifier).state++;
    if (context.mounted) {
      showMessage(
        context,
        propertyId == null
            ? 'Consolidated view active (saved as default)'
            : 'Switched to ${propertyName ?? 'property'} (saved as default)',
      );
    }
  } catch (e) {
    if (context.mounted) showMessage(context, messageOf(e));
  }
}

class _PortfolioSwitcherBar extends ConsumerStatefulWidget {
  const _PortfolioSwitcherBar();

  @override
  ConsumerState<_PortfolioSwitcherBar> createState() =>
      _PortfolioSwitcherBarState();
}

class _PortfolioSwitcherBarState extends ConsumerState<_PortfolioSwitcherBar> {
  var _switching = false;

  Future<void> _onSelectProperty(String? id, String? name) async {
    if (_switching) return;
    setState(() => _switching = true);
    try {
      await _switchStaffProperty(
        context,
        ref,
        propertyId: id,
        propertyName: name,
      );
    } finally {
      if (mounted) setState(() => _switching = false);
    }
  }

  Future<void> _onSelectOrg(OrgMembership org) async {
    if (_switching) return;
    setState(() => _switching = true);
    try {
      await ref
          .read(sessionProvider.notifier)
          .switchContext(organizationId: org.id);
      ref.invalidate(propertiesProvider);
      ref.invalidate(dashboardProvider);
      ref.read(listsVersionProvider.notifier).state++;
      if (mounted) {
        showMessage(context, 'Switched to ${org.name} (saved as default)');
      }
    } catch (e) {
      if (mounted) showMessage(context, messageOf(e));
    } finally {
      if (mounted) setState(() => _switching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).valueOrNull;
    if (session == null) return const SizedBox.shrink();

    final canProps = can(ref, 'properties:view');
    final fetchedProps = canProps
        ? ref.watch(propertiesProvider).valueOrNull
        : null;
    final props = (fetchedProps != null && fetchedProps.isNotEmpty)
        ? fetchedProps
        : [
            for (final p in session.properties)
              PropertyOption(id: p.id, code: p.code, name: p.name),
          ];
    final orgs = session.organizations;
    if (props.length <= 1 && orgs.length <= 1) {
      return const SizedBox.shrink();
    }

    final activePropertyId = session.activePropertyId;
    final totalUnits = props.fold<int>(0, (sum, p) => sum + p.unitCount);
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Kicker(
                  activePropertyId == null
                      ? 'PORTFOLIO SCOPE · CONSOLIDATED (${props.length} PROPERTIES)'
                      : 'ACTIVE PROPERTY SCOPE · DEFAULT SAVED',
                ),
              ),
              if (_switching)
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else if (activePropertyId != null)
                GestureDetector(
                  onTap: () => _onSelectProperty(null, null),
                  child: Text(
                    'All properties ↺',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: dark ? HodiColors.lime : HodiColors.navy,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                if (orgs.length > 1)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: PopupMenuButton<OrgMembership>(
                      tooltip: 'Switch organisation',
                      onSelected: _onSelectOrg,
                      itemBuilder: (_) => [
                        for (final o in orgs)
                          PopupMenuItem(
                            value: o,
                            child: Row(
                              children: [
                                Icon(
                                  o.id == session.activeOrganization?.id
                                      ? Icons.radio_button_checked
                                      : Icons.radio_button_off,
                                  size: 18,
                                ),
                                const SizedBox(width: 8),
                                Expanded(child: Text(o.name)),
                              ],
                            ),
                          ),
                      ],
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: dark
                              ? scheme.surfaceContainerLowest
                              : Colors.white,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: scheme.outlineVariant),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.domain_outlined, size: 15),
                            const SizedBox(width: 6),
                            Text(
                              session.activeOrganization?.name ??
                                  'Organisation',
                              style: const TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(width: 4),
                            const Icon(Icons.expand_more, size: 16),
                          ],
                        ),
                      ),
                    ),
                  ),
                if (props.length > 1) ...[
                  _ScopePill(
                    icon: Icons.dashboard_customize_outlined,
                    label: 'All properties',
                    badge: totalUnits > 0
                        ? '$totalUnits units'
                        : '${props.length}',
                    selected: activePropertyId == null,
                    onTap: () => _onSelectProperty(null, null),
                  ),
                  for (final p in props) ...[
                    const SizedBox(width: 8),
                    _ScopePill(
                      icon: Icons.apartment_outlined,
                      label: p.name,
                      badge: p.unitCount > 0
                          ? '${p.occupiedCount}/${p.unitCount}'
                          : (p.code.isNotEmpty ? p.code : null),
                      selected: activePropertyId == p.id,
                      onTap: () => _onSelectProperty(p.id, p.name),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ScopePill extends StatelessWidget {
  const _ScopePill({
    required this.icon,
    required this.label,
    this.badge,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String? badge;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bg = selected
        ? HodiColors.navy
        : (dark ? scheme.surfaceContainerLowest : Colors.white);
    final fg = selected
        ? Colors.white
        : (dark ? Colors.white : HodiColors.navy);

    return Material(
      color: bg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: BorderSide(
          color: selected ? HodiColors.lime : scheme.outlineVariant,
          width: selected ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 15, color: selected ? HodiColors.lime : fg),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: fg,
                ),
              ),
              if (badge != null && badge!.isNotEmpty) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 1.5,
                  ),
                  decoration: BoxDecoration(
                    color: selected
                        ? Colors.white.withValues(alpha: 0.16)
                        : scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    badge!,
                    style: TextStyle(
                      fontFamily: 'JetBrainsMono',
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      color: selected
                          ? HodiColors.lime
                          : scheme.onSurfaceVariant,
                    ),
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
    final session = ref.watch(sessionProvider).valueOrNull;
    final canProps = can(ref, 'properties:view');
    final props = canProps
        ? (ref.watch(propertiesProvider).valueOrNull ??
              const <PropertyOption>[])
        : const <PropertyOption>[];
    final activePropId = session?.activePropertyId;
    String? activePropName;
    if (activePropId != null) {
      for (final p in props) {
        if (p.id == activePropId) {
          activePropName = p.name;
          break;
        }
      }
      if (activePropName == null && session != null) {
        for (final p in session.properties) {
          if (p.id == activePropId) {
            activePropName = p.name;
            break;
          }
        }
      }
    }

    final dark = Theme.of(context).brightness == Brightness.dark;
    return AsyncBody(
      value: dash,
      onRetry: () => ref.invalidate(dashboardProvider),
      data: (d) {
        final progress = (d.collectionRate ?? 0).clamp(0.0, 1.0);
        final propCount = d.byProperty.isNotEmpty
            ? d.byProperty.length
            : props.length;
        final heroKicker = activePropName != null
            ? '${activePropName.toUpperCase()} · ${formatPeriod(d.period)}'
            : (propCount > 1
                  ? 'CONSOLIDATED ($propCount PROPERTIES) · ${formatPeriod(d.period)}'
                  : 'COLLECTED · ${formatPeriod(d.period)}');

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            CurvedHeroCard(
              kicker: heroKicker,
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
            if (activePropId == null &&
                (d.byProperty.length > 1 || props.length > 1)) ...[
              const SizedBox(height: 12),
              _ConsolidatedPropertiesCard(
                byProperty: d.byProperty,
                properties: props,
              ),
            ],
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

class _ConsolidatedPropertiesCard extends ConsumerWidget {
  const _ConsolidatedPropertiesCard({
    required this.byProperty,
    required this.properties,
  });

  final List<DashboardPropertyRow> byProperty;
  final List<PropertyOption> properties;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final count = byProperty.isNotEmpty ? byProperty.length : properties.length;

    return SectionCard(
      title: 'Properties breakdown ($count)',
      trailing: Text(
        'Tap to switch →',
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          color: scheme.onSurfaceVariant,
        ),
      ),
      children: [
        if (byProperty.isNotEmpty)
          for (final (idx, p) in byProperty.indexed) ...[
            if (idx > 0) const Divider(height: 1),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: UnitBadge(
                p.property.code.isNotEmpty ? p.property.code : 'P${idx + 1}',
                width: 52,
              ),
              title: Text(
                p.property.name,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                '${p.occupied + p.notice}/${p.units} let (${_percent(p.rate)})'
                '${p.expenses > 0 ? ' · ${formatKes(p.expenses)} exp.' : ''}',
              ),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    formatKes(p.collected),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13.5,
                    ),
                  ),
                  Text(
                    'of ${formatKes(p.invoiced)}',
                    style: TextStyle(
                      fontSize: 11,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
              onTap: () => _switchStaffProperty(
                context,
                ref,
                propertyId: p.property.id,
                propertyName: p.property.name,
              ),
            ),
          ]
        else
          for (final (idx, p) in properties.indexed) ...[
            if (idx > 0) const Divider(height: 1),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: UnitBadge(
                p.code.isNotEmpty ? p.code : 'P${idx + 1}',
                width: 52,
              ),
              title: Text(
                p.name,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                '${p.occupiedCount}/${p.unitCount} let · ${p.vacantCount} vacant'
                '${p.location != null && p.location!.isNotEmpty ? ' · ${p.location}' : ''}',
              ),
              trailing: const Icon(Icons.chevron_right, size: 18),
              onTap: () => _switchStaffProperty(
                context,
                ref,
                propertyId: p.id,
                propertyName: p.name,
              ),
            ),
          ],
      ],
    );
  }
}
