import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/dates.dart';
import '../../core/files.dart';
import '../../core/money.dart';
import '../../core/navigation.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets/account_sheet.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/notifications_sheet.dart';
import '../../core/widgets/paged_list.dart';
import '../../core/widgets/side_drawer.dart';

typedef PlatformJson = Map<String, dynamic>;

String _s(Object? v) => v is String ? v : '';
int _i(Object? v) =>
    v is num ? v.toInt() : (v is String ? int.tryParse(v) ?? 0 : 0);

List<PlatformJson> _rows(Object? body) {
  if (body is PlatformJson) {
    final data = body['data'];
    if (data is List) {
      return [
        for (final e in data)
          if (e is PlatformJson) e,
      ];
    }
  }
  return const [];
}

PlatformJson _data(Object? body) {
  if (body is PlatformJson && body['data'] is PlatformJson) {
    return body['data'] as PlatformJson;
  }
  return const {};
}

Tone _orgStatusTone(String status) => switch (status) {
  'ACTIVE' => Tone.good,
  'TRIAL' => Tone.info,
  'GRACE' => Tone.warn,
  'SUSPENDED' || 'CLOSED' => Tone.bad,
  _ => Tone.neutral,
};

// ───────────────────────────────────────────── API & Providers

class PlatformApi {
  PlatformApi(this._api);
  final ApiClient _api;

  Future<PlatformJson> stats() async =>
      _data(await _api.get('/platform/stats'));

  Future<({List<PlatformJson> rows, bool hasMore})> organizations({
    required int page,
    String? q,
    String? status,
  }) async {
    final body = await _api.get(
      '/platform/organizations',
      query: {
        'page': page,
        'pageSize': 20,
        if (q != null && q.isNotEmpty) 'q': q,
        if (status != null && status.isNotEmpty) 'status': status,
      },
    );
    final meta = body['meta'] as PlatformJson? ?? const {};
    return (rows: _rows(body), hasMore: _i(meta['page']) < _i(meta['pages']));
  }

  Future<PlatformJson> organization(String id) async =>
      _data(await _api.get('/platform/organizations/$id'));

  Future<PlatformJson> updateOrganization(
    String id,
    PlatformJson patch,
  ) async =>
      _data(await _api.patch('/platform/organizations/$id', body: patch));

  Future<List<PlatformJson>> plans() async =>
      _rows(await _api.get('/platform/plans'));

  Future<({List<PlatformJson> rows, bool hasMore})> invoices({
    required int page,
    String? orgId,
  }) async {
    final body = await _api.get(
      '/platform/invoices',
      query: {
        'page': page,
        'pageSize': 20,
        if (orgId != null && orgId.isNotEmpty) 'orgId': orgId,
      },
    );
    final meta = body['meta'] as PlatformJson? ?? const {};
    return (rows: _rows(body), hasMore: _i(meta['page']) < _i(meta['pages']));
  }

  Future<({List<PlatformJson> rows, bool hasMore})> payments({
    required int page,
    String? orgId,
  }) async {
    final body = await _api.get(
      '/platform/payments',
      query: {
        'page': page,
        'pageSize': 20,
        if (orgId != null && orgId.isNotEmpty) 'orgId': orgId,
      },
    );
    final meta = body['meta'] as PlatformJson? ?? const {};
    return (rows: _rows(body), hasMore: _i(meta['page']) < _i(meta['pages']));
  }

  Future<List<PlatformJson>> operators() async {
    final body = await _api.get('/platform/operators');
    final d = body['data'];
    if (d is List) {
      return [
        for (final e in d)
          if (e is PlatformJson) e,
      ];
    }
    if (d is PlatformJson && d['operators'] is List) {
      return [
        for (final e in d['operators'] as List)
          if (e is PlatformJson) e,
      ];
    }
    return const [];
  }
}

final platformApiProvider = Provider(
  (ref) => PlatformApi(ref.watch(apiClientProvider)),
);

final platformStatsProvider = FutureProvider.autoDispose<PlatformJson>(
  (ref) => ref.watch(platformApiProvider).stats(),
);

final platformOrgProvider = FutureProvider.autoDispose
    .family<PlatformJson, String>(
      (ref, id) => ref.watch(platformApiProvider).organization(id),
    );

final platformPlansProvider = FutureProvider.autoDispose<List<PlatformJson>>(
  (ref) => ref.watch(platformApiProvider).plans(),
);

final platformOperatorsProvider =
    FutureProvider.autoDispose<List<PlatformJson>>(
      (ref) => ref.watch(platformApiProvider).operators(),
    );

final platformVersionProvider = StateProvider<int>((ref) => 0);

// ───────────────────────────────────────────── Routes & Shell

/// Platform Admin mode (`/platform/...`): 3 lean bottom nav tabs (`Overview`, `Orgs`, `Platform`).
RouteBase platformRoutes() => StatefulShellRoute.indexedStack(
  builder: (_, _, shell) => PlatformShell(shell: shell),
  branches: [
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/platform',
          builder: (_, _) => const PlatformOverviewScreen(),
        ),
      ],
    ),
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/platform/orgs',
          builder: (_, _) => const PlatformOrgsScreen(),
          routes: [
            GoRoute(
              path: ':orgId',
              parentNavigatorKey: rootNavigatorKey,
              builder: (_, state) => PlatformOrgDetailScreen(
                orgId: state.pathParameters['orgId']!,
              ),
            ),
          ],
        ),
      ],
    ),
    StatefulShellBranch(
      routes: [
        GoRoute(
          path: '/platform/manage',
          builder: (_, _) => const PlatformManageScreen(),
        ),
      ],
    ),
  ],
);

class PlatformShell extends ConsumerWidget {
  const PlatformShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final role = session.valueOrNull?.user.platformRole ?? 'ADMIN';
    return Scaffold(
      drawer: const KodiHubSideDrawer(),
      appBar: KodiHubAppBar(
        loading: session.isLoading,
        title: const Text('KodiHub Platform'),
        subtitle: 'Platform Administration · $role',
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
            icon: Icon(Icons.domain_outlined),
            selectedIcon: Icon(Icons.domain),
            label: 'Orgs',
          ),
          NavigationDestination(
            icon: Icon(Icons.admin_panel_settings_outlined),
            selectedIcon: Icon(Icons.admin_panel_settings),
            label: 'Platform',
          ),
        ],
      ),
    );
  }
}

// ───────────────────────────────────────────── 1. Overview Tab

class PlatformOverviewScreen extends ConsumerWidget {
  const PlatformOverviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(platformStatsProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(platformStatsProvider),
      child: AsyncBody(
        value: stats,
        onRetry: () => ref.invalidate(platformStatsProvider),
        data: (s) {
          final orgs = s['organizations'] as PlatformJson? ?? const {};
          final activeCount = _i(orgs['ACTIVE']);
          final trialCount = _i(orgs['TRIAL']);
          final graceCount = _i(orgs['GRACE']);
          final suspendedCount = _i(orgs['SUSPENDED']);
          final totalOrgs =
              activeCount +
              trialCount +
              graceCount +
              suspendedCount +
              _i(orgs['CLOSED']);
          final collected = centsFrom(s['collectedThisMonth']);
          final outstanding = centsFrom(s['outstanding']);
          final lastMonthBilled = centsFrom(s['lastMonthBilled']);
          final lastMonth = _s(s['lastMonth']);

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              CurvedHeroCard(
                kicker: 'PLATFORM REVENUE · THIS MONTH',
                trailing: StatusChip('$totalOrgs orgs', tone: Tone.info),
                children: [
                  Text(
                    formatKes(collected),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.8,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Collected this month across all organisations',
                    style: TextStyle(color: Color(0xFFB8C6D9), fontSize: 12.5),
                  ),
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Divider(color: Color(0x24FFFFFF), height: 1),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        lastMonth.isEmpty
                            ? 'Last month billed'
                            : 'Billed (${formatPeriod(lastMonth)})',
                        style: const TextStyle(
                          color: Color(0xFFB8C6D9),
                          fontSize: 13,
                        ),
                      ),
                      Text(
                        formatKes(lastMonthBilled),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Outstanding SaaS balance',
                        style: TextStyle(
                          color: Color(0xFFB8C6D9),
                          fontSize: 13,
                        ),
                      ),
                      Text(
                        formatKes(outstanding),
                        style: const TextStyle(
                          color: HodiColors.lime,
                          fontSize: 14.5,
                          fontWeight: FontWeight.w700,
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
                    child: _PlatformKpiTile(
                      label: 'Active Orgs',
                      value: '$activeCount',
                      note: '$trialCount in trial · $graceCount in grace',
                      onTap: () => context.go('/platform/orgs'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _PlatformKpiTile(
                      label: 'Occupied Units',
                      value: '${_i(s['occupiedUnits'])}',
                      note: 'Billable units across platform',
                      onTap: () => context.go('/platform/orgs'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _PlatformKpiTile(
                      label: 'Suspended Orgs',
                      value: '$suspendedCount',
                      note: 'Overdue SaaS billing',
                      alert: suspendedCount > 0,
                      onTap: () => context.go('/platform/orgs'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _PlatformKpiTile(
                      label: 'Plans & Billing',
                      value: 'Manage',
                      note: 'Plans, invoices & operators →',
                      onTap: () => context.go('/platform/manage'),
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

class _PlatformKpiTile extends StatelessWidget {
  const _PlatformKpiTile({
    required this.label,
    required this.value,
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
              Text(
                value,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: alert
                      ? toneColor(context, Tone.bad)
                      : (dark ? Colors.white : HodiColors.navy),
                ),
              ),
              if (note != null) ...[
                const SizedBox(height: 4),
                Text(
                  note!,
                  style: TextStyle(
                    fontSize: 12,
                    color: scheme.onSurfaceVariant,
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

// ───────────────────────────────────────────── 2. Organisations Tab & Detail

class PlatformOrgsScreen extends ConsumerStatefulWidget {
  const PlatformOrgsScreen({super.key});

  @override
  ConsumerState<PlatformOrgsScreen> createState() => _PlatformOrgsScreenState();
}

class _PlatformOrgsScreenState extends ConsumerState<PlatformOrgsScreen> {
  String _q = '';
  String _status = '';

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(platformApiProvider);
    final version = ref.watch(platformVersionProvider);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: TextField(
            onChanged: (v) => setState(() => _q = v.trim()),
            decoration: const InputDecoration(
              hintText: 'Organisation name, billing ref or owner',
              prefixIcon: Icon(Icons.search),
              isDense: true,
            ),
          ),
        ),
        SizedBox(
          height: 52,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Row(
              children: [
                for (final (val, label) in const [
                  ('', 'All'),
                  ('ACTIVE', 'Active'),
                  ('TRIAL', 'Trial'),
                  ('GRACE', 'Grace'),
                  ('SUSPENDED', 'Suspended'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(label),
                      selected: _status == val,
                      onSelected: (_) => setState(() => _status = val),
                    ),
                  ),
              ],
            ),
          ),
        ),
        Expanded(
          child: PagedList<PlatformJson>(
            resetKey: (_q, _status, version),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            load: (page) =>
                api.organizations(page: page, q: _q, status: _status),
            empty: const EmptyState(
              icon: Icons.domain_outlined,
              title: 'No organisations match',
            ),
            itemBuilder: (context, o) {
              final status = _s(o['status']);
              final plan = (o['plan'] as Map?)?['name'] ?? 'Default';
              final units = _i(o['occupiedUnits']);
              final balance = centsFrom(o['balance']);
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Card(
                  child: ListTile(
                    leading: InitialsBadge(
                      name: _s(o['name']).isEmpty ? 'KH' : _s(o['name']),
                      lime: false,
                    ),
                    title: Text(
                      _s(o['name']),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      '${_s(o['billingRef'])} · $plan · $units units${balance > 0 ? ' · Owes ${formatKes(balance)}' : ''}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: StatusChip(status, tone: _orgStatusTone(status)),
                    onTap: () => context.push('/platform/orgs/${o['id']}'),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Detail screen for a single organisation in Platform mode.
/// Uses 3 segmented tabs (`Overview | Invoices | Payments`) and pushes over the root navigator
/// so there is no bottom navigation bar.
class PlatformOrgDetailScreen extends ConsumerStatefulWidget {
  const PlatformOrgDetailScreen({super.key, required this.orgId});
  final String orgId;

  @override
  ConsumerState<PlatformOrgDetailScreen> createState() =>
      _PlatformOrgDetailScreenState();
}

class _PlatformOrgDetailScreenState
    extends ConsumerState<PlatformOrgDetailScreen> {
  int _tab = 0;
  bool _busy = false;

  Future<void> _setStatus(String status) async {
    setState(() => _busy = true);
    try {
      await ref.read(platformApiProvider).updateOrganization(widget.orgId, {
        'status': status,
      });
      ref.invalidate(platformOrgProvider(widget.orgId));
      ref.invalidate(platformStatsProvider);
      ref.read(platformVersionProvider.notifier).state++;
      if (mounted) showMessage(context, 'Organisation status set to $status.');
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final orgId = widget.orgId;
    final orgAsync = ref.watch(platformOrgProvider(orgId));
    final orgVal = orgAsync.valueOrNull;
    final api = ref.watch(platformApiProvider);
    return Scaffold(
      appBar: KodiHubAppBar(
        title: Text(
          _s(orgVal?['name']).isEmpty ? 'Organisation' : _s(orgVal?['name']),
        ),
        subtitle: _s(orgVal?['billingRef']),
      ),
      body: AsyncBody(
        value: orgAsync,
        onRetry: () => ref.invalidate(platformOrgProvider(orgId)),
        data: (o) {
          final status = _s(o['status']);
          final price = o['price'] as PlatformJson? ?? const {};
          final owner = o['owner'] as PlatformJson?;
          final plan = o['plan'] as PlatformJson?;
          final balance = centsFrom(o['balance']);
          final credit = centsFrom(o['credit']);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              CurvedHeroCard(
                kicker: '${_s(o['billingRef'])} · ${_s(o['kind'])}',
                trailing: StatusChip(status, tone: _orgStatusTone(status)),
                children: [
                  Text(
                    _s(o['name']),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${_i(o['occupiedUnits'])} occupied units · ${plan?['name'] ?? 'Standard'}',
                        style: const TextStyle(
                          color: Color(0xFFB8C6D9),
                          fontSize: 13,
                        ),
                      ),
                      Text(
                        balance > 0
                            ? 'Owes ${formatKes(balance)}'
                            : (credit > 0
                                  ? 'Credit ${formatKes(credit)}'
                                  : 'Paid up'),
                        style: const TextStyle(
                          color: HodiColors.lime,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              KodiHubSegmentedTabs(
                tabs: const ['Overview', 'Invoices', 'Payments'],
                index: _tab,
                onChanged: (i) => setState(() => _tab = i),
              ),
              const SizedBox(height: 12),
              if (_tab == 0) ...[
                SectionCard(
                  title: 'Subscription & Pricing',
                  children: [
                    FactRow('Plan', '${plan?['name'] ?? 'Default'}'),
                    FactRow(
                      'Price per unit',
                      formatKes(centsFrom(price['pricePerUnit'])),
                    ),
                    FactRow(
                      'Minimum monthly',
                      formatKes(centsFrom(price['minimumMonthly'])),
                    ),
                    FactRow('Occupied units', '${_i(o['occupiedUnits'])}'),
                    if (o['trialEndsAt'] != null)
                      FactRow('Trial ends', formatDay(_s(o['trialEndsAt']))),
                    if (o['noSuspendUntil'] != null)
                      FactRow(
                        'Protected until',
                        formatDay(_s(o['noSuspendUntil'])),
                      ),
                  ],
                ),
                if (owner != null) ...[
                  const SizedBox(height: 12),
                  SectionCard(
                    title: 'Owner contact',
                    children: [
                      FactRow(
                        'Name',
                        '${owner['firstName'] ?? ''} ${owner['lastName'] ?? owner['name'] ?? ''}'
                            .trim(),
                      ),
                      if (owner['email'] != null)
                        FactRow('Email', '${owner['email']}'),
                      if (owner['phone'] != null)
                        FactRow('Phone', '${owner['phone']}'),
                    ],
                  ),
                ],
                const SizedBox(height: 12),
                SectionCard(
                  title: 'Platform status actions',
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (status != 'ACTIVE')
                          FilledButton(
                            onPressed: _busy
                                ? null
                                : () => _setStatus('ACTIVE'),
                            child: const Text('Set Active'),
                          ),
                        if (status != 'GRACE')
                          OutlinedButton(
                            onPressed: _busy ? null : () => _setStatus('GRACE'),
                            child: const Text('Set Grace'),
                          ),
                        if (status != 'SUSPENDED')
                          OutlinedButton(
                            onPressed: _busy
                                ? null
                                : () => _setStatus('SUSPENDED'),
                            child: const Text('Suspend'),
                          ),
                      ],
                    ),
                  ],
                ),
              ] else if (_tab == 1)
                SizedBox(
                  height: 460,
                  child: PagedList<PlatformJson>(
                    resetKey: ('org-inv', orgId),
                    load: (page) => api.invoices(page: page, orgId: orgId),
                    empty: const EmptyState(
                      title: 'No SaaS invoices for this organisation',
                    ),
                    itemBuilder: (context, inv) => Card(
                      child: ListTile(
                        title: Text(
                          '${inv['number'] ?? ''} · ${formatPeriod(_s(inv['period']))}',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        subtitle: Text(
                          'Due ${formatDay(_s(inv['dueDate']))} · Total ${formatKes(centsFrom(inv['total']))}',
                        ),
                        trailing: IconButton(
                          tooltip: 'Invoice PDF',
                          icon: const Icon(Icons.picture_as_pdf_outlined),
                          onPressed: () => openApiPdf(
                            ref.read(apiClientProvider),
                            '/platform/invoices/${inv['id']}/pdf',
                            '${inv['number'] ?? 'invoice'}.pdf',
                          ),
                        ),
                      ),
                    ),
                  ),
                )
              else
                SizedBox(
                  height: 460,
                  child: PagedList<PlatformJson>(
                    resetKey: ('org-pay', orgId),
                    load: (page) => api.payments(page: page, orgId: orgId),
                    empty: const EmptyState(
                      title: 'No SaaS payments for this organisation',
                    ),
                    itemBuilder: (context, pay) => Card(
                      child: ListTile(
                        title: Text(
                          formatKes(centsFrom(pay['amount'])),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        subtitle: Text(
                          '${pay['reference'] ?? ''} · ${formatDay(_s(pay['receivedAt']))} · ${pay['method'] ?? ''}',
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

// ───────────────────────────────────────────── 3. Platform Management Tab (Plans | Invoices | Payments | Operators)

class PlatformManageScreen extends ConsumerStatefulWidget {
  const PlatformManageScreen({super.key});

  @override
  ConsumerState<PlatformManageScreen> createState() =>
      _PlatformManageScreenState();
}

class _PlatformManageScreenState extends ConsumerState<PlatformManageScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(platformApiProvider);
    final plans = ref.watch(platformPlansProvider);
    final operators = ref.watch(platformOperatorsProvider);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: KodiHubSegmentedTabs(
            tabs: const ['Plans', 'Invoices', 'Payments', 'Operators'],
            index: _tab,
            onChanged: (i) => setState(() => _tab = i),
          ),
        ),
        Expanded(
          child: switch (_tab) {
            0 => AsyncBody(
              value: plans,
              onRetry: () => ref.invalidate(platformPlansProvider),
              data: (rows) => rows.isEmpty
                  ? const EmptyState(title: 'No SaaS plans configured')
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: rows.length,
                      itemBuilder: (context, i) {
                        final p = rows[i];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: SectionCard(
                            title: '${p['name'] ?? ''}',
                            trailing: StatusChip(
                              p['isDefault'] == true
                                  ? 'Default'
                                  : (p['active'] == false
                                        ? 'Inactive'
                                        : 'Active'),
                              tone: p['active'] == false
                                  ? Tone.neutral
                                  : Tone.good,
                            ),
                            children: [
                              if (p['description'] != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 6),
                                  child: Text('${p['description']}'),
                                ),
                              FactRow(
                                'Per occupied unit',
                                formatKes(centsFrom(p['pricePerUnit'])),
                              ),
                              FactRow(
                                'Minimum monthly',
                                formatKes(centsFrom(p['minimumMonthly'])),
                              ),
                              FactRow('Trial days', '${_i(p['trialDays'])}'),
                              FactRow(
                                'Organisations on plan',
                                '${_i(p['organizationCount'])}',
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
            1 => PagedList<PlatformJson>(
              resetKey: 'platform-invoices',
              padding: const EdgeInsets.all(16),
              load: (page) => api.invoices(page: page),
              empty: const EmptyState(title: 'No platform invoices yet'),
              itemBuilder: (context, inv) {
                final orgName =
                    (inv['organization'] as Map?)?['name'] ?? 'Organisation';
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Card(
                    child: ListTile(
                      title: Text(
                        '$orgName · ${formatKes(centsFrom(inv['total']))}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        '${inv['number'] ?? ''} · ${formatPeriod(_s(inv['period']))} · Due ${formatDay(_s(inv['dueDate']))}',
                      ),
                      trailing: StatusChip(
                        _s(inv['status']),
                        tone: inv['status'] == 'PAID'
                            ? Tone.good
                            : (inv['overdue'] == true ? Tone.bad : Tone.warn),
                      ),
                    ),
                  ),
                );
              },
            ),
            2 => PagedList<PlatformJson>(
              resetKey: 'platform-payments',
              padding: const EdgeInsets.all(16),
              load: (page) => api.payments(page: page),
              empty: const EmptyState(title: 'No platform payments yet'),
              itemBuilder: (context, pay) {
                final orgName =
                    (pay['organization'] as Map?)?['name'] ?? 'Organisation';
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Card(
                    child: ListTile(
                      title: Text(
                        '$orgName · ${formatKes(centsFrom(pay['amount']))}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        '${pay['reference'] ?? ''} · ${formatDay(_s(pay['receivedAt']))} · ${pay['method'] ?? ''}',
                      ),
                    ),
                  ),
                );
              },
            ),
            _ => AsyncBody(
              value: operators,
              onRetry: () => ref.invalidate(platformOperatorsProvider),
              data: (rows) => rows.isEmpty
                  ? const EmptyState(title: 'No platform operators')
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: rows.length,
                      itemBuilder: (context, i) {
                        final op = rows[i];
                        final name =
                            '${op['firstName'] ?? ''} ${op['lastName'] ?? ''}'
                                .trim();
                        final role =
                            '${op['platformRole'] ?? op['role'] ?? 'ADMIN'}';
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Card(
                            child: ListTile(
                              leading: InitialsBadge(
                                name: name.isEmpty ? 'OP' : name,
                              ),
                              title: Text(
                                name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              subtitle: Text(
                                '${op['email'] ?? op['phone'] ?? ''} · ${_i(op['organizationsCount'])} orgs',
                              ),
                              trailing: StatusChip(role, tone: Tone.info),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          },
        ),
      ],
    );
  }
}
