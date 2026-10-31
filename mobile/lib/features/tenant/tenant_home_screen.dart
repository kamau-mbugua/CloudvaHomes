import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/dates.dart';
import '../../core/files.dart';
import '../../core/money.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets/account_sheet.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/stk_sheet.dart';
import 'tenant_api.dart';

class TenantHomeScreen extends ConsumerWidget {
  const TenantHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(tenantOverviewProvider);
    final selectedHomeKey = ref.watch(selectedTenantHomeKeyProvider);
    final session = ref.watch(sessionProvider).valueOrNull;
    final accounts = session?.tenantOf ?? const [];

    return RefreshIndicator(
      onRefresh: () => ref.refresh(tenantOverviewProvider.future),
      child: AsyncBody(
        value: overview,
        onRetry: () => ref.invalidate(tenantOverviewProvider),
        data: (o) {
          final selectedHome = selectedHomeKey == null
              ? null
              : o.homes.where((h) => h.key == selectedHomeKey).firstOrNull;
          final visibleHomes = selectedHome != null ? [selectedHome] : o.homes;
          final visibleInvoices = selectedHome != null
              ? [
                  for (final i in o.openInvoices)
                    if (i.unit == null ||
                        i.unit!.isEmpty ||
                        i.unit == selectedHome.unit)
                      i,
                ]
              : o.openInvoices;
          final showSwitcher =
              o.homes.length > 1 ||
              selectedHomeKey != null ||
              accounts.length > 1 ||
              (session?.isStaff ?? false) ||
              (session?.isOwner ?? false);

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (showSwitcher)
                _TenantUnitSwitcher(overview: o, selectedHome: selectedHome),
              _OwedCard(o: o, selectedHome: selectedHome),
              if (selectedHome == null && o.homes.length > 1) ...[
                const SizedBox(height: 14),
                _TenantConsolidatedUnitsCard(overview: o),
              ],
              if (visibleInvoices.isNotEmpty) ...[
                const SizedBox(height: 14),
                SectionCard(
                  title: selectedHome != null
                      ? 'Open invoices · ${selectedHome.unit}'
                      : 'Open invoices',
                  trailing: GestureDetector(
                    onTap: () => context.go('/tenant/invoices'),
                    child: const Text(
                      'See all',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: HodiColors.limeText,
                      ),
                    ),
                  ),
                  children: [
                    for (final (idx, i) in visibleInvoices.indexed) ...[
                      if (idx > 0) const Divider(height: 16),
                      InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => context.push('/tenant/invoices/${i.id}'),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      formatPeriod(i.period),
                                      style: const TextStyle(
                                        fontSize: 14.5,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${i.number}${i.unit != null && i.unit!.isNotEmpty ? ' · ${i.unit}' : ''} · due ${formatDay(i.dueDate)}',
                                      style: TextStyle(
                                        fontFamily: 'JetBrainsMono',
                                        fontSize: 11.5,
                                        color: Theme.of(
                                          context,
                                        ).colorScheme.onSurfaceVariant,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    formatKes(i.balance),
                                    style: const TextStyle(
                                      fontSize: 14.5,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  if (i.overdue)
                                    const StatusChip('Overdue', tone: Tone.bad)
                                  else
                                    StatusChip(
                                      'Due ${formatDay(i.dueDate)}',
                                      tone: Tone.warn,
                                    ),
                                ],
                              ),
                              const SizedBox(width: 4),
                              Icon(
                                Icons.chevron_right,
                                size: 18,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
              if (o.howToPay.isNotEmpty) ...[
                const SizedBox(height: 14),
                SectionCard(
                  title: 'How to pay',
                  children: [
                    for (final (index, w) in o.howToPay.indexed) ...[
                      if (index > 0) const Divider(height: 24),
                      _PayWayView(w),
                    ],
                  ],
                ),
              ],
              for (final h in visibleHomes) ...[
                const SizedBox(height: 14),
                SectionCard(
                  title: visibleHomes.length > 1 || selectedHome != null
                      ? 'Your home · ${h.unit}'
                      : 'Your home',
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? const Color(0xFF122438)
                            : HodiColors.paper2,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: Theme.of(
                                context,
                              ).colorScheme.surfaceContainerLowest,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(
                              Icons.home_outlined,
                              color: HodiColors.navy,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${h.unit}, ${h.property}',
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                Text(
                                  '${formatKes(h.rent)} a month',
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    FactRow('Rent a month', formatKes(h.rent)),
                    FactRow(
                      'Billed on',
                      'the ${_ordinal(h.billingDay)} of each month',
                    ),
                    FactRow('Since', formatDay(h.startDate)),
                    if (h.endDate != null)
                      FactRow('Until', formatDay(h.endDate)),
                    if (h.id.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          OutlinedButton.icon(
                            icon: const Icon(
                              Icons.picture_as_pdf_outlined,
                              size: 18,
                            ),
                            label: const Text('Lease agreement PDF'),
                            onPressed: () => openApiPdf(
                              ref.read(apiClientProvider),
                              '${ref.read(tenantApiProvider).base(h.tenantId.isNotEmpty ? h.tenantId : o.tenantId)}/tenancies/${h.id}/lease/pdf',
                              'Lease-${h.unit}.pdf',
                            ),
                          ),
                          if (h.hasSignedLease)
                            OutlinedButton.icon(
                              icon: const Icon(
                                Icons.verified_outlined,
                                size: 18,
                              ),
                              label: const Text('Signed lease'),
                              onPressed: () => openApiPdf(
                                ref.read(apiClientProvider),
                                '${ref.read(tenantApiProvider).base(h.tenantId.isNotEmpty ? h.tenantId : o.tenantId)}/tenancies/${h.id}/lease-document',
                                'Signed-Lease-${h.unit}.pdf',
                              ),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ],
              if (o.depositHeld > 0) ...[
                const SizedBox(height: 12),
                SectionCard(
                  children: [
                    FactRow(
                      'Deposit held',
                      formatKes(
                        selectedHome != null && selectedHome.depositHeld > 0
                            ? selectedHome.depositHeld
                            : o.depositHeld,
                      ),
                      bold: true,
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 12),
              SectionCard(
                title: 'Contact ${o.orgName}',
                children: [
                  if (o.orgPhone != null)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.call_outlined),
                      title: Text(o.orgPhone!),
                      onTap: () =>
                          launchUrl(Uri(scheme: 'tel', path: o.orgPhone)),
                    ),
                  if (o.orgEmail != null)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.mail_outline),
                      title: Text(o.orgEmail!),
                      onTap: () =>
                          launchUrl(Uri(scheme: 'mailto', path: o.orgEmail)),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

Future<void> _switchTenantUnit(
  BuildContext context,
  WidgetRef ref, {
  required Home? home,
  required String fallbackTenantId,
}) async {
  ref.read(selectedTenantHomeKeyProvider.notifier).state = home?.key;
  if (home == null) {
    ref.read(chosenTenantProvider.notifier).state = null;
    await ref.read(sessionProvider.notifier).switchContext(tenantId: null);
  } else {
    final targetTenantId = home.tenantId.isNotEmpty
        ? home.tenantId
        : fallbackTenantId;
    ref.read(chosenTenantProvider.notifier).state = targetTenantId;
    await ref
        .read(sessionProvider.notifier)
        .switchContext(tenantId: targetTenantId);
  }
  if (context.mounted) {
    showMessage(
      context,
      home == null
          ? 'Consolidated units view active (saved as default)'
          : 'Switched to ${home.unit} · ${home.property} (saved as default)',
    );
  }
}

class _TenantUnitSwitcher extends ConsumerWidget {
  const _TenantUnitSwitcher({
    required this.overview,
    required this.selectedHome,
  });

  final TenantOverview overview;
  final Home? selectedHome;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final homes = overview.homes;
    final session = ref.watch(sessionProvider).valueOrNull;
    final isConsolidated = selectedHome == null;

    final title = selectedHome != null
        ? '${selectedHome!.unit} · ${selectedHome!.property}'
        : (homes.length > 1
              ? 'All units (Consolidated)'
              : (homes.isNotEmpty
                    ? '${homes.first.unit} · ${homes.first.property}'
                    : 'My Tenancy'));
    final subtitle = selectedHome != null
        ? 'Monthly rent ${formatKes(selectedHome!.rent)} · Tap to switch unit'
        : (homes.length > 1
              ? '${homes.length} active units · Tap to focus on one unit'
              : 'Tap to switch workspace or portal');

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Material(
        color: scheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _TenantUnitScopeSheet.show(
            context,
            overview: overview,
            selectedHome: selectedHome,
          ),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: !isConsolidated
                    ? HodiColors.lime.withValues(alpha: 0.65)
                    : scheme.outlineVariant,
                width: !isConsolidated ? 1.4 : 1,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: isConsolidated
                        ? (dark
                              ? HodiColors.lime.withValues(alpha: 0.16)
                              : HodiColors.navy)
                        : HodiColors.lime.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    isConsolidated
                        ? Icons.dashboard_customize_outlined
                        : Icons.home_outlined,
                    size: 18,
                    color: isConsolidated
                        ? (dark ? HodiColors.lime : HodiColors.lime)
                        : (dark ? HodiColors.lime : HodiColors.navy),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        homes.length > 1
                            ? (isConsolidated
                                  ? 'YOUR UNITS · CONSOLIDATED'
                                  : 'ACTIVE UNIT · DEFAULT SAVED')
                            : 'TENANCY SCOPE',
                        style: TextStyle(
                          fontFamily: 'JetBrainsMono',
                          fontSize: 9.5,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.1,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11.5,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                if (!isConsolidated && homes.length > 1) ...[
                  const SizedBox(width: 6),
                  TextButton(
                    style: TextButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    onPressed: () => _switchTenantUnit(
                      context,
                      ref,
                      home: null,
                      fallbackTenantId: overview.tenantId,
                    ),
                    child: Text(
                      'All ↺',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: dark ? HodiColors.lime : HodiColors.navy,
                      ),
                    ),
                  ),
                ],
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        session != null &&
                                (session.isStaff || session.isOwner) &&
                                homes.length <= 1
                            ? 'Portal'
                            : 'Switch',
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                          color: scheme.onSurface,
                        ),
                      ),
                      const SizedBox(width: 2),
                      Icon(
                        Icons.keyboard_arrow_down_rounded,
                        size: 16,
                        color: scheme.onSurface,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TenantUnitScopeSheet extends ConsumerWidget {
  const _TenantUnitScopeSheet({
    required this.overview,
    required this.selectedHome,
  });

  final TenantOverview overview;
  final Home? selectedHome;

  static Future<void> show(
    BuildContext context, {
    required TenantOverview overview,
    required Home? selectedHome,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          _TenantUnitScopeSheet(overview: overview, selectedHome: selectedHome),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final homes = overview.homes;
    final session = ref.watch(sessionProvider).valueOrNull;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Switch unit or portal',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 2),
            Text(
              'Your selection updates your active context and is saved as your default.',
              style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 12),
            if (homes.length > 1)
              _TenantScopeOptionTile(
                selected: selectedHome == null,
                leading: Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: dark
                        ? HodiColors.lime.withValues(alpha: 0.16)
                        : HodiColors.navy,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.dashboard_customize_outlined,
                    size: 19,
                    color: HodiColors.lime,
                  ),
                ),
                title: 'All units (Consolidated)',
                subtitle: '${homes.length} leased units combined',
                trailingText: formatKes(overview.owed),
                onTap: () {
                  Navigator.of(context).pop();
                  _switchTenantUnit(
                    context,
                    ref,
                    home: null,
                    fallbackTenantId: overview.tenantId,
                  );
                },
              ),
            for (final h in homes)
              _TenantScopeOptionTile(
                selected: selectedHome?.key == h.key,
                leading: UnitBadge(h.unit),
                title: '${h.unit} · ${h.property}',
                subtitle: 'Rent ${formatKes(h.rent)} / mo',
                trailingText: h.status,
                onTap: () {
                  Navigator.of(context).pop();
                  _switchTenantUnit(
                    context,
                    ref,
                    home: h,
                    fallbackTenantId: overview.tenantId,
                  );
                },
              ),
            if (session != null &&
                (session.isStaff ||
                    session.isOwner ||
                    session.tenantOf.length > 1)) ...[
              const Divider(height: 20),
              ListTile(
                dense: true,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                leading: const Icon(Icons.swap_horiz_rounded, size: 20),
                title: const Text(
                  'Switch organisation or portal (Staff / Owner)',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                ),
                trailing: const Icon(Icons.chevron_right_rounded, size: 18),
                onTap: () {
                  Navigator.of(context).pop();
                  AccountSheet.show(context);
                },
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TenantScopeOptionTile extends StatelessWidget {
  const _TenantScopeOptionTile({
    required this.selected,
    required this.leading,
    required this.title,
    required this.subtitle,
    this.trailingText,
    required this.onTap,
  });

  final bool selected;
  final Widget leading;
  final String title;
  final String subtitle;
  final String? trailingText;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: selected
            ? HodiColors.lime.withValues(alpha: dark ? 0.14 : 0.12)
            : scheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected ? HodiColors.lime : scheme.outlineVariant,
                width: selected ? 1.5 : 1,
              ),
            ),
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
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 12,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                if (trailingText != null) ...[
                  const SizedBox(width: 8),
                  Text(
                    trailingText!,
                    style: const TextStyle(
                      fontFamily: 'JetBrainsMono',
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
                const SizedBox(width: 8),
                Icon(
                  selected
                      ? Icons.check_circle_rounded
                      : Icons.radio_button_unchecked_rounded,
                  size: 20,
                  color: selected
                      ? (dark ? HodiColors.lime : HodiColors.navy)
                      : scheme.outline,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TenantConsolidatedUnitsCard extends ConsumerWidget {
  const _TenantConsolidatedUnitsCard({required this.overview});
  final TenantOverview overview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return SectionCard(
      title: 'Your units breakdown (${overview.homes.length})',
      trailing: Text(
        'Tap to switch →',
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          color: scheme.onSurfaceVariant,
        ),
      ),
      children: [
        for (final (idx, h) in overview.homes.indexed) ...[
          if (idx > 0) const Divider(height: 1),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: UnitBadge(h.unit, width: 52),
            title: Text(
              '${h.unit} · ${h.property}',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: Text(
              '${formatKes(h.rent)} / mo · Billed ${_ordinal(h.billingDay)}',
            ),
            trailing: const Icon(Icons.chevron_right, size: 18),
            onTap: () => _switchTenantUnit(
              context,
              ref,
              home: h,
              fallbackTenantId: overview.tenantId,
            ),
          ),
        ],
      ],
    );
  }
}

class _OwedCard extends ConsumerWidget {
  const _OwedCard({required this.o, this.selectedHome});
  final TenantOverview o;
  final Home? selectedHome;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final owes = o.owed > 0;
    final kicker = selectedHome != null
        ? '${selectedHome!.unit.toUpperCase()} · ${selectedHome!.property.toUpperCase()}'
        : (o.homes.length > 1
              ? 'CONSOLIDATED (${o.homes.length} UNITS)'
              : null);
    return CurvedHeroCard(
      kicker: kicker,
      label: owes ? 'You owe' : 'Nothing to pay',
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          o.orgName,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      children: [
        const SizedBox(height: 2),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            formatKes(o.owed),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 30,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.6,
            ),
          ),
        ),
        if (o.credit > 0) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              '${formatKes(o.credit)} in credit — used on your next invoice',
              style: const TextStyle(
                color: Color(0xE6FFFFFF),
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
        if (o.canPayInApp) ...[
          const SizedBox(height: 16),
          FilledButton.icon(
            style: KodiHubButtonStyles.money(),
            icon: const Icon(Icons.phone_iphone, color: HodiColors.navy),
            label: Text(owes ? 'Pay now' : 'Pay in advance'),
            onPressed: () => showTenantPaySheet(context, ref, o),
          ),
        ],
      ],
    );
  }
}

void showTenantPaySheet(
  BuildContext context,
  WidgetRef ref,
  TenantOverview o, {
  int? amountCents,
  VoidCallback? onSuccess,
}) {
  final targetCents = amountCents ?? o.owed;
  final api = ref.read(tenantApiProvider);
  StkPaySheet.show(
    context,
    StkPaySheet(
      kicker: 'To ${o.orgName}',
      title: 'Pay with M-Pesa',
      intro:
          'An M-Pesa prompt goes to the phone below. Enter your M-Pesa PIN to pay ${o.orgName}.',
      defaultAmount: wholeShillingsUp(targetCents),
      defaultPhone: o.phone,
      amountHint: targetCents > 0
          ? 'You owe ${formatKes(targetCents)}. Whole shillings only.'
          : null,
      submit: (amount, phone, key) => api.pay(o.tenantId, amount, phone, key),
      poll: (id) => api.payStatus(o.tenantId, id),
      pollEvery: ref.read(stkPollIntervalProvider),
      onFinished: (s) {
        if (s.state == 'SUCCESS') {
          ref.invalidate(tenantOverviewProvider);
          onSuccess?.call();
        }
      },
    ),
  );
}

class _PayWayView extends StatelessWidget {
  const _PayWayView(this.w);
  final PayWay w;

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(
      color: Theme.of(context).colorScheme.onSurfaceVariant,
      fontSize: 13,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          w.kind == 'BANK_ACCOUNT' && w.bankName != null
              ? '${w.name} · ${w.bankName}'
              : w.name,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        switch (w.kind) {
          'MPESA_PAYBILL' => Column(
            children: [
              CopyRow(label: 'Paybill', value: w.shortcode ?? ''),
              if (w.accountRef != null)
                CopyRow(label: 'Account number', value: w.accountRef!),
              Text('M-Pesa → Lipa na M-Pesa → Pay Bill', style: muted),
            ],
          ),
          'MPESA_TILL' => Column(
            children: [
              CopyRow(label: 'Till number', value: w.shortcode ?? ''),
              Text(
                'M-Pesa → Lipa na M-Pesa → Buy Goods and Services',
                style: muted,
              ),
            ],
          ),
          _ => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (w.accountNumber != null)
                CopyRow(label: 'Account number', value: w.accountNumber!),
              if (w.accountRef != null)
                CopyRow(label: 'Reference', value: w.accountRef!),
              if (w.accountName != null)
                Text('In the name of ${w.accountName}', style: muted),
            ],
          ),
        },
      ],
    );
  }
}

String _ordinal(int n) {
  if (n >= 11 && n <= 13) return '${n}th';
  return switch (n % 10) {
    1 => '${n}st',
    2 => '${n}nd',
    3 => '${n}rd',
    _ => '${n}th',
  };
}
