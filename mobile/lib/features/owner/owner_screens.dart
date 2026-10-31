import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/dates.dart';
import '../../core/files.dart';
import '../../core/money.dart';
import '../../core/providers.dart';
import '../../core/widgets/account_sheet.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/notifications_sheet.dart';
import '../../core/widgets/side_drawer.dart';
import '../staff/staff_api.dart';

final chosenOwnerProvider = StateProvider<String?>((ref) => null);

final currentOwnerIdProvider = Provider<String?>((ref) {
  final owners = ref.watch(sessionProvider).valueOrNull?.ownerOf ?? const [];
  final chosen = ref.watch(chosenOwnerProvider);
  if (owners.isEmpty) return null;
  return owners.any((o) => o.landlordId == chosen)
      ? chosen
      : owners.first.landlordId;
});

final ownerOverviewProvider = FutureProvider.autoDispose<Map<String, dynamic>>((
  ref,
) async {
  final id = ref.watch(currentOwnerIdProvider);
  if (id == null) throw StateError('No landlord account');
  final res = await ref
      .watch(apiClientProvider)
      .get('/owner/landlords/${Uri.encodeComponent(id)}');
  return res['data'] as Map<String, dynamic>;
});

final ownerStatementProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, String>((ref, period) async {
      final id = ref.watch(currentOwnerIdProvider);
      if (id == null) throw StateError('No landlord account');
      final res = await ref
          .watch(apiClientProvider)
          .get(
            '/owner/landlords/${Uri.encodeComponent(id)}/statement',
            query: {'from': period, 'to': period},
          );
      return res['data'] as Map<String, dynamic>;
    });

final ownerRemittancesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
      final id = ref.watch(currentOwnerIdProvider);
      if (id == null) throw StateError('No landlord account');
      final res = await ref
          .watch(apiClientProvider)
          .get('/owner/landlords/${Uri.encodeComponent(id)}/remittances');
      return [
        for (final r in (res['data'] as List? ?? const []))
          if (r is Map<String, dynamic>) r,
      ];
    });

RouteBase ownerRoutes() => StatefulShellRoute.indexedStack(
  builder: (_, _, shell) => OwnerShell(shell: shell),
  branches: [
    StatefulShellBranch(
      routes: [
        GoRoute(path: '/owner', builder: (_, _) => const OwnerOverviewScreen()),
      ],
    ),
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/owner/statements',
          builder: (_, _) => const OwnerStatementsScreen(),
        ),
      ],
    ),
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/owner/payouts',
          builder: (_, _) => const OwnerPayoutsScreen(),
        ),
      ],
    ),
  ],
);

class OwnerShell extends ConsumerWidget {
  const OwnerShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final owners = ref.watch(sessionProvider).valueOrNull?.ownerOf ?? const [];
    final currentId = ref.watch(currentOwnerIdProvider);
    final current = owners.where((o) => o.landlordId == currentId).firstOrNull;
    return Scaffold(
      drawer: const KodiHubSideDrawer(),
      appBar: KodiHubAppBar(
        subtitle: current?.name,
        title: owners.length > 1
            ? PopupMenuButton<String>(
                tooltip: 'Switch landlord account',
                onSelected: (id) =>
                    ref.read(chosenOwnerProvider.notifier).state = id,
                itemBuilder: (_) => [
                  for (final o in owners)
                    PopupMenuItem(
                      value: o.landlordId,
                      child: Text('${o.orgName} · ${o.name}'),
                    ),
                ],
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Flexible(
                      child: Text(
                        current?.orgName ?? 'Owner portal',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const Icon(Icons.arrow_drop_down),
                  ],
                ),
              )
            : Text(current?.orgName ?? 'Owner portal'),
        actions: const [NotificationButton(), AccountButton()],
      ),
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) =>
            shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Overview',
          ),
          NavigationDestination(
            icon: Icon(Icons.description_outlined),
            selectedIcon: Icon(Icons.description),
            label: 'Statements',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: 'Payouts',
          ),
        ],
      ),
    );
  }
}

class OwnerOverviewScreen extends ConsumerWidget {
  const OwnerOverviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(ownerOverviewProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(ownerOverviewProvider),
      child: AsyncBody(
        value: data,
        onRetry: () => ref.invalidate(ownerOverviewProvider),
        data: (d) {
          final landlord = d['landlord'] as Map<String, dynamic>? ?? const {};
          final org = d['organization'] as Map<String, dynamic>? ?? const {};
          final balances = d['balances'] as Map<String, dynamic>? ?? const {};
          final payout = d['payout'] as Map<String, dynamic>?;
          final payable = centsFrom(balances['payable']);
          final depositHeld = centsFrom(balances['depositHeld']);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              CurvedHeroCard(
                label: payable >= 0 ? 'Payable to you' : 'Balance with agency',
                trailing: StatusChip(
                  landlord['code'] as String? ?? 'Owner',
                  tone: Tone.good,
                ),
                children: [
                  Text(
                    formatKes(payable.abs()),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Divider(color: Color(0x2EFFFFFF), height: 1),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Deposits held',
                        style: TextStyle(
                          color: Color(0xCCFFFFFF),
                          fontSize: 13,
                        ),
                      ),
                      Text(
                        formatKes(depositHeld),
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SectionCard(
                title: 'Where payouts go',
                children: [
                  if (payout != null) ...[
                    FactRow('Method', '${payout['method'] ?? ''}'),
                    FactRow('Account', '${payout['masked'] ?? ''}', bold: true),
                  ] else
                    Text(
                      'No payout details on file yet. Contact ${org['name'] ?? 'your agency'} to add them.',
                    ),
                ],
              ),
              const SizedBox(height: 12),
              SectionCard(
                title: 'Managing agency',
                children: [
                  FactRow('Agency', '${org['name'] ?? ''}'),
                  if (org['phone'] != null) FactRow('Phone', '${org['phone']}'),
                  if (org['email'] != null) FactRow('Email', '${org['email']}'),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

class OwnerStatementsScreen extends ConsumerStatefulWidget {
  const OwnerStatementsScreen({super.key});
  @override
  ConsumerState<OwnerStatementsScreen> createState() =>
      _OwnerStatementsScreenState();
}

class _OwnerStatementsScreenState extends ConsumerState<OwnerStatementsScreen> {
  late final String _period = nairobiPeriod();

  @override
  Widget build(BuildContext context) {
    final st = ref.watch(ownerStatementProvider(_period));
    final landlordId = ref.watch(currentOwnerIdProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(ownerStatementProvider(_period)),
      child: AsyncBody(
        value: st,
        onRetry: () => ref.invalidate(ownerStatementProvider(_period)),
        data: (s) {
          final totals = s['totals'] as Map<String, dynamic>? ?? const {};
          final closing = s['closing'] as Map<String, dynamic>? ?? const {};
          final entries = [
            for (final e in (s['entries'] as List? ?? const []))
              if (e is Map<String, dynamic>) e,
          ];
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              SectionCard(
                title: 'Statement · ${formatPeriod(_period)}',
                trailing: landlordId == null
                    ? null
                    : IconButton(
                        tooltip: 'Download statement PDF',
                        icon: const Icon(Icons.picture_as_pdf_outlined),
                        onPressed: () =>
                            openApiPdf(
                              ref.read(apiClientProvider),
                              '/owner/landlords/${Uri.encodeComponent(landlordId)}/statement/pdf?from=$_period&to=$_period',
                              'Owner-Statement-$_period.pdf',
                            ).catchError((Object _) {
                              if (context.mounted) {
                                showMessage(context, 'Couldn’t open the PDF.');
                              }
                            }),
                      ),
                children: [
                  FactRow(
                    'Collections',
                    formatKes(centsFrom(totals['collections'])),
                  ),
                  FactRow(
                    'Commission',
                    '-${formatKes(centsFrom(totals['commission']))}',
                  ),
                  FactRow(
                    'Expenses',
                    '-${formatKes(centsFrom(totals['expenses']))}',
                  ),
                  FactRow(
                    'Payouts',
                    '-${formatKes(centsFrom(totals['remittances']))}',
                  ),
                  const Divider(),
                  FactRow(
                    'Closing payable',
                    formatKes(centsFrom(closing['payable'])),
                    bold: true,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SectionCard(
                title: 'Activity',
                children: [
                  if (entries.isEmpty)
                    const Text('No ledger activity in this month.'),
                  for (final e in entries)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('${e['memo'] ?? e['kind'] ?? ''}'),
                      subtitle: Text(formatDay('${e['occurredAt'] ?? ''}')),
                      trailing: Text(
                        formatKes(centsFrom(e['amount'])),
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
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

class OwnerPayoutsScreen extends ConsumerWidget {
  const OwnerPayoutsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(ownerRemittancesProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(ownerRemittancesProvider),
      child: AsyncBody(
        value: list,
        onRetry: () => ref.invalidate(ownerRemittancesProvider),
        data: (rows) => rows.isEmpty
            ? ListView(
                children: const [
                  EmptyState(
                    icon: Icons.account_balance_wallet_outlined,
                    title: 'No payouts yet',
                    body:
                        'Monthly remittances prepared by your agency will appear here.',
                  ),
                ],
              )
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: rows.length,
                itemBuilder: (context, i) {
                  final r = rows[i];
                  final status = r['status'] as String? ?? 'DRAFT';
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: SectionCard(
                      title:
                          '${r['number'] ?? ''} · ${formatPeriod('${r['period'] ?? ''}')}',
                      trailing: StatusChip(
                        status,
                        tone: status == 'PAID'
                            ? Tone.good
                            : status == 'CANCELLED'
                            ? Tone.bad
                            : Tone.warn,
                      ),
                      children: [
                        FactRow(
                          'Collections',
                          formatKes(centsFrom(r['collections'])),
                        ),
                        FactRow(
                          'Commission',
                          '-${formatKes(centsFrom(r['commission']))}',
                        ),
                        FactRow(
                          'Expenses',
                          '-${formatKes(centsFrom(r['expenses']))}',
                        ),
                        const Divider(),
                        FactRow(
                          'Net payout',
                          formatKes(centsFrom(r['net'])),
                          bold: true,
                        ),
                        if (r['reference'] != null)
                          FactRow('Reference', '${r['reference']}'),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}
