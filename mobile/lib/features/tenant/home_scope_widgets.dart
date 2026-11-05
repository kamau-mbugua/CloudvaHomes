import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'home_scope.dart';
import 'tenant_api.dart';

/// "All my homes (N) ▾" — opens a sheet to pick one home. Hidden with one home or none.
class HomeSwitcherChip extends ConsumerWidget {
  const HomeSwitcherChip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final all = ref.watch(allHomesProvider).valueOrNull;
    if (all == null) return const SizedBox.shrink();
    final options = homeOptions(all.homes);
    if (options.length < 2) return const SizedBox.shrink();
    final scope = ref.watch(homeScopeProvider);
    final current = scope is OneHome
        ? options.where((o) => o.tenancyId == scope.tenancyId).firstOrNull
        : null;
    final label = current == null
        ? 'All my homes (${options.length})'
        : homeLabel(current.home);
    return ActionChip(
      avatar: const Icon(Icons.home_work_outlined, size: 18),
      label: Text(label, overflow: TextOverflow.ellipsis),
      onPressed: () => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (sheet) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              ListTile(
                leading: const Icon(Icons.apartment_outlined),
                title: Text('All my homes (${options.length})'),
                selected: scope is AllHomes,
                onTap: () {
                  ref.read(homeScopeRawProvider.notifier).set(const AllHomes());
                  Navigator.pop(sheet);
                },
              ),
              for (final o in options)
                ListTile(
                  leading: const Icon(Icons.home_outlined),
                  title: Text(o.label),
                  selected: current?.tenancyId == o.tenancyId,
                  onTap: () {
                    ref
                        .read(homeScopeRawProvider.notifier)
                        .set(OneHome(o.tenantId, o.tenancyId));
                    Navigator.pop(sheet);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Showing only G1, Acacia Heights — Show all" while one home is selected.
class HomeScopeStrip extends ConsumerWidget {
  const HomeScopeStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scope = ref.watch(homeScopeProvider);
    final all = ref.watch(allHomesProvider).valueOrNull;
    if (scope is! OneHome || all == null) return const SizedBox.shrink();
    final home = all.homes.where((h) => h.id == scope.tenancyId).firstOrNull;
    if (home == null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
        child: Row(
          children: [
            Expanded(
              child: Text(
                'Showing only ${homeLabel(home)} · ${home.orgName}',
                style: TextStyle(color: scheme.onSecondaryContainer),
              ),
            ),
            TextButton(
              onPressed: () =>
                  ref.read(homeScopeRawProvider.notifier).set(const AllHomes()),
              child: const Text('Show all'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Top of the Bills / Payments / Statement / Repairs screens. All homes with several
/// landlords: one chip per landlord (each has its own account). One home whose account
/// covers other homes too: a note saying so.
class LedgerScopeHeader extends ConsumerWidget {
  const LedgerScopeHeader({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scope = ref.watch(homeScopeProvider);
    final all = ref.watch(allHomesProvider).valueOrNull;
    final accounts =
        ref.watch(sessionProvider).valueOrNull?.tenantOf ?? const [];
    if (all == null) return const SizedBox.shrink();
    if (scope is OneHome) {
      final others = otherHomesOnAccount(all.homes, scope);
      if (others.isEmpty) return const SizedBox.shrink();
      final org =
          accounts
              .where((a) => a.tenantId == scope.tenantId)
              .firstOrNull
              ?.orgName ??
          'your landlord';
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        child: Text('This account with $org also covers ${others.join(', ')}.'),
      );
    }
    if (accounts.length < 2) return const SizedBox.shrink();
    final current = ref.watch(currentTenantIdProvider);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Row(
        children: [
          for (final a in accounts)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(a.orgName),
                selected: a.tenantId == current,
                onSelected: (_) =>
                    ref.read(chosenTenantProvider.notifier).state = a.tenantId,
              ),
            ),
        ],
      ),
    );
  }
}
