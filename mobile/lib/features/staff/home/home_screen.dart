import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_error.dart';
import '../../../core/auth/session_controller.dart';
import '../../../core/dates.dart';
import '../../../core/money.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/account_sheet.dart';
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
              PropertyOption(
                id: p.id,
                code: p.code,
                name: p.name,
                unitCount: p.unitCount,
                occupiedCount: p.occupiedCount,
                vacantCount: (p.unitCount - p.occupiedCount).clamp(
                  0,
                  p.unitCount,
                ),
              ),
          ];
    final orgs = session.organizations;
    if (props.length <= 1 &&
        orgs.length <= 1 &&
        !session.isTenant &&
        !session.isOwner) {
      return const SizedBox.shrink();
    }

    final activePropertyId = session.activePropertyId;
    PropertyOption? activeProp;
    if (activePropertyId != null) {
      for (final p in props) {
        if (p.id == activePropertyId) {
          activeProp = p;
          break;
        }
      }
    }
    final totalUnits = props.fold<int>(0, (sum, p) => sum + p.unitCount);
    final totalOccupied = props.fold<int>(
      0,
      (sum, p) => sum + p.occupiedCount + p.noticeCount,
    );
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;

    final title = activeProp != null
        ? activeProp.name
        : (props.length > 1
              ? 'All properties (Consolidated)'
              : (session.activeOrganization?.name ?? 'Portfolio'));
    final subtitle = activeProp != null
        ? (activeProp.unitCount > 0
              ? '${activeProp.occupiedCount + activeProp.noticeCount}/${activeProp.unitCount} units let · Default property'
              : 'Active property · Default saved')
        : (props.length > 1
              ? '${props.length} properties${totalUnits > 0 ? ' · $totalOccupied/$totalUnits units let' : ''}'
              : 'Tap to switch workspace or portal');

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: dark ? scheme.surfaceContainerLowest : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: scheme.outlineVariant),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => _StaffScopeSheet.show(
            context,
            properties: props,
            activePropertyId: activePropertyId,
            onSelectProperty: _onSelectProperty,
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            child: Row(
              children: [
                if (activeProp != null && activeProp.code.isNotEmpty)
                  UnitBadge(activeProp.code, width: 44, height: 38)
                else
                  Container(
                    width: 40,
                    height: 38,
                    decoration: BoxDecoration(
                      color: HodiColors.navy,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.layers_outlined,
                      size: 19,
                      color: HodiColors.lime,
                    ),
                  ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: dark ? Colors.white : HodiColors.navy,
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                if (_switching)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else ...[
                  if (activePropertyId != null)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () => _onSelectProperty(null, null),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: scheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            'All ↺',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: dark ? Colors.white : HodiColors.navy,
                            ),
                          ),
                        ),
                      ),
                    ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: dark
                          ? HodiColors.limeSoftDark
                          : HodiColors.limeSoft,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Switch',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: dark ? HodiColors.lime : HodiColors.navy,
                          ),
                        ),
                        const SizedBox(width: 3),
                        Icon(
                          Icons.unfold_more_rounded,
                          size: 16,
                          color: dark ? HodiColors.lime : HodiColors.navy,
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StaffScopeSheet extends ConsumerStatefulWidget {
  const _StaffScopeSheet({
    required this.properties,
    required this.activePropertyId,
    required this.onSelectProperty,
  });

  final List<PropertyOption> properties;
  final String? activePropertyId;
  final Future<void> Function(String? id, String? name) onSelectProperty;

  static Future<void> show(
    BuildContext context, {
    required List<PropertyOption> properties,
    required String? activePropertyId,
    required Future<void> Function(String? id, String? name) onSelectProperty,
  }) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _StaffScopeSheet(
      properties: properties,
      activePropertyId: activePropertyId,
      onSelectProperty: onSelectProperty,
    ),
  );

  @override
  ConsumerState<_StaffScopeSheet> createState() => _StaffScopeSheetState();
}

class _StaffScopeSheetState extends ConsumerState<_StaffScopeSheet> {
  var _query = '';

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final q = _query.trim().toLowerCase();
    final filtered = q.isEmpty
        ? widget.properties
        : [
            for (final p in widget.properties)
              if (p.name.toLowerCase().contains(q) ||
                  p.code.toLowerCase().contains(q) ||
                  (p.location?.toLowerCase().contains(q) ?? false))
                p,
          ];
    final totalUnits = widget.properties.fold<int>(
      0,
      (sum, p) => sum + p.unitCount,
    );
    final totalOccupied = widget.properties.fold<int>(
      0,
      (sum, p) => sum + p.occupiedCount + p.noticeCount,
    );
    final hasOtherWorkspaces =
        session != null &&
        (session.organizations.length > 1 ||
            session.isTenant ||
            session.isOwner ||
            session.isPlatformAdmin);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: widget.properties.length > 4 ? 0.72 : 0.56,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      builder: (context, scrollController) => ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        children: [
          const Kicker('PORTFOLIO & PROPERTY SCOPE'),
          const SizedBox(height: 4),
          Text(
            'Switch property view',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.4,
              color: dark ? Colors.white : HodiColors.navy,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Updates your active session token and saves your default view.',
            style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
          ),
          if (widget.properties.length > 4) ...[
            const SizedBox(height: 12),
            TextField(
              onChanged: (v) => setState(() => _query = v),
              decoration: const InputDecoration(
                hintText: 'Search property name or code…',
                prefixIcon: Icon(Icons.search, size: 20),
                isDense: true,
              ),
            ),
          ],
          const SizedBox(height: 14),
          if (widget.properties.length > 1) ...[
            _ScopeSheetTile(
              leading: Container(
                width: 44,
                height: 40,
                decoration: BoxDecoration(
                  color: HodiColors.navy,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.layers_outlined,
                  color: HodiColors.lime,
                  size: 20,
                ),
              ),
              title: 'All properties (Consolidated)',
              subtitle:
                  '${widget.properties.length} properties${totalUnits > 0 ? ' · $totalOccupied/$totalUnits units let' : ''}',
              selected: widget.activePropertyId == null,
              onTap: () {
                Navigator.of(context).pop();
                widget.onSelectProperty(null, null);
              },
            ),
            const SizedBox(height: 8),
          ],
          for (final (idx, p) in filtered.indexed) ...[
            if (idx > 0) const SizedBox(height: 8),
            _ScopeSheetTile(
              leading: UnitBadge(
                p.code.isNotEmpty ? p.code : 'P${idx + 1}',
                width: 48,
                height: 40,
              ),
              title: p.name,
              subtitle: p.unitCount > 0
                  ? '${p.occupiedCount + p.noticeCount}/${p.unitCount} let · ${p.vacantCount} vacant'
                        '${p.location != null && p.location!.isNotEmpty ? ' · ${p.location}' : ''}'
                  : (p.location ?? p.code),
              selected: widget.activePropertyId == p.id,
              onTap: () {
                Navigator.of(context).pop();
                widget.onSelectProperty(p.id, p.name);
              },
            ),
          ],
          if (hasOtherWorkspaces) ...[
            const SizedBox(height: 16),
            const Divider(height: 1),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
              leading: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.swap_horiz_rounded, size: 20),
              ),
              title: const Text(
                'Switch organisation or portal',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
              ),
              subtitle: Text(
                session.isTenant
                    ? 'Also linked to your personal Tenant portal'
                    : 'Switch between your organisations and portals',
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).pop();
                AccountSheet.show(context);
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _ScopeSheetTile extends StatelessWidget {
  const _ScopeSheetTile({
    required this.leading,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final Widget leading;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: selected
          ? (dark ? HodiColors.limeSoftDark : HodiColors.limeSoft)
          : (dark ? scheme.surfaceContainerLowest : Colors.white),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: selected ? HodiColors.lime : scheme.outlineVariant,
          width: selected ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          child: Row(
            children: [
              leading,
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: dark ? Colors.white : HodiColors.navy,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 12,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                selected
                    ? Icons.check_circle_rounded
                    : Icons.radio_button_unchecked,
                size: 20,
                color: selected
                    ? (dark ? HodiColors.lime : HodiColors.navy)
                    : scheme.outlineVariant,
              ),
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
