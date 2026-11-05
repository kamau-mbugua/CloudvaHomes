import 'package:flutter/material.dart' hide Page;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/dates.dart';
import '../../core/files.dart';
import '../../core/providers.dart';
import 'home_scope.dart';
import 'tenant_api.dart';

/// Documents, Notices and My profile (tenant portal redesign). Documents and Notices follow
/// the home switcher; My profile is about the person.

final _inspectionsProvider = FutureProvider.autoDispose
    .family<List<TenantInspection>, ({String tenantId, String tenancyId})>(
      (ref, k) =>
          ref.watch(tenantApiProvider).inspections(k.tenantId, k.tenancyId),
    );

class TenantDocumentsScreen extends ConsumerWidget {
  const TenantDocumentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final all = ref.watch(allHomesProvider);
    final scope = ref.watch(homeScopeProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Documents')),
      body: all.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(messageOf(e))),
        data: (o) {
          final homes = [
            for (final h in o.homes)
              if ((h.status == 'ACTIVE' || h.status == 'NOTICE') &&
                  (scope is AllHomes ||
                      (scope is OneHome && scope.tenancyId == h.id)))
                h,
          ];
          if (homes.isEmpty) {
            return const Center(child: Text('No current home.'));
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [for (final h in homes) _HomeDocuments(home: h)],
          );
        },
      ),
    );
  }
}

class _HomeDocuments extends ConsumerWidget {
  const _HomeDocuments({required this.home});
  final Home home;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(tenantApiProvider);
    final client = ref.watch(apiClientProvider);
    final base = api.base(home.tenantId);
    final tenancy = Uri.encodeComponent(home.id);
    final inspections = ref.watch(
      _inspectionsProvider((tenantId: home.tenantId, tenancyId: home.id)),
    );
    Future<void> open(String path, String name) async {
      try {
        await openApiPdf(client, path, name);
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(messageOf(e))));
        }
      }
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              homeLabel(home),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            Text(home.orgName),
            if (home.leaseEndDate != null)
              Text('Lease ends ${formatDay(home.leaseEndDate)}'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton(
                  onPressed: () =>
                      open('$base/tenancies/$tenancy/lease/pdf', 'Lease.pdf'),
                  child: const Text('Lease agreement PDF'),
                ),
                if (home.hasSignedLease)
                  OutlinedButton(
                    onPressed: () => open(
                      '$base/tenancies/$tenancy/lease-document',
                      'Signed-lease.pdf',
                    ),
                    child: const Text('Signed lease copy'),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            for (final i
                in inspections.valueOrNull ?? const <TenantInspection>[])
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  '${i.kind == 'MOVE_OUT' ? 'Move-out' : 'Move-in'} inspection · ${formatDay(i.inspectedOn)}',
                ),
                subtitle: Text(
                  i.acknowledged ? 'You checked this' : 'Please check',
                ),
                trailing: Wrap(
                  spacing: 4,
                  children: [
                    IconButton(
                      tooltip: 'PDF',
                      icon: const Icon(Icons.picture_as_pdf_outlined),
                      onPressed: () => open(
                        '${api.inspectionsPath(home.tenantId, home.id)}/${i.kind}/pdf',
                        'Inspection.pdf',
                      ),
                    ),
                    if (!i.acknowledged)
                      FilledButton(
                        onPressed: () async {
                          await api.acknowledgeInspection(
                            home.tenantId,
                            home.id,
                            i.kind,
                          );
                          ref.invalidate(
                            _inspectionsProvider((
                              tenantId: home.tenantId,
                              tenancyId: home.id,
                            )),
                          );
                        },
                        child: const Text('I’ve checked this'),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

final tenantNoticesProvider = FutureProvider.autoDispose
    .family<Page<TenantNotice>, String?>(
      (ref, tenantId) =>
          ref.watch(tenantApiProvider).notices(tenantId: tenantId),
    );

class TenantNoticesScreen extends ConsumerWidget {
  const TenantNoticesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scope = ref.watch(homeScopeProvider);
    final notices = ref.watch(
      tenantNoticesProvider(scope is OneHome ? scope.tenantId : null),
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Notices')),
      body: notices.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(messageOf(e))),
        data: (page) => page.rows.isEmpty
            ? const Center(child: Text('No notices yet.'))
            : ListView.separated(
                itemCount: page.rows.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (_, k) {
                  final n = page.rows[k];
                  final link = n.actionUrl;
                  return ListTile(
                    leading: Icon(
                      n.read
                          ? Icons.notifications_none
                          : Icons.notifications_active_outlined,
                    ),
                    title: Text(n.title),
                    subtitle: Text(
                      [
                        ?n.orgName,
                        formatDay(
                          n.createdAt.length >= 10
                              ? n.createdAt.substring(0, 10)
                              : null,
                        ),
                        n.body,
                      ].join(' · '),
                    ),
                    onTap:
                        link != null &&
                            (link == '/tenant' || link.startsWith('/tenant/'))
                        ? () => context.go(
                            link.startsWith('/tenant/invoices/')
                                ? '/tenant/invoices'
                                : link,
                          )
                        : null,
                  );
                },
              ),
      ),
    );
  }
}

class TenantProfileScreen extends ConsumerStatefulWidget {
  const TenantProfileScreen({super.key});

  @override
  ConsumerState<TenantProfileScreen> createState() =>
      _TenantProfileScreenState();
}

class _TenantProfileScreenState extends ConsumerState<TenantProfileScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _current = TextEditingController();
  final _next = TextEditingController();
  bool _busy = false;
  bool _filled = false;

  @override
  void dispose() {
    for (final c in [_first, _last, _current, _next]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _run(Future<void> Function() job, String done) async {
    setState(() => _busy = true);
    try {
      await job();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(done)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(messageOf(e))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final user = session?.user;
    if (user != null && !_filled) {
      _first.text = user.firstName;
      _last.text = user.lastName;
      _filled = true;
    }
    final accounts = session?.tenantOf ?? const [];
    final who = accounts.length == 1
        ? accounts.first.orgName
        : 'your landlord or agency';
    return Scaffold(
      appBar: AppBar(title: const Text('My profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _first,
            decoration: const InputDecoration(labelText: 'First name'),
          ),
          TextField(
            controller: _last,
            decoration: const InputDecoration(labelText: 'Last name'),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _busy
                ? null
                : () => _run(() async {
                    await ref
                        .read(apiClientProvider)
                        .patch(
                          '/me',
                          body: {
                            'firstName': _first.text.trim(),
                            'lastName': _last.text.trim(),
                          },
                        );
                    await ref.read(sessionProvider.notifier).reload();
                  }, 'Name saved.'),
            child: const Text('Save name'),
          ),
          const SizedBox(height: 16),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Phone'),
            subtitle: Text(user?.phone ?? '—'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Email'),
            subtitle: Text(user?.email ?? '—'),
          ),
          Text(
            'To change your phone number or email, ask $who — they use them to reach you and you sign in with them.',
          ),
          const Divider(height: 32),
          Text(
            'Change password',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          TextField(
            controller: _current,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Current password'),
          ),
          TextField(
            controller: _next,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'New password (at least 10 characters)',
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _busy
                ? null
                : () => _run(() async {
                    await ref
                        .read(sessionProvider.notifier)
                        .changePassword(
                          currentPassword: _current.text,
                          newPassword: _next.text,
                        );
                    _current.clear();
                    _next.clear();
                  }, 'Password changed.'),
            child: const Text('Change password'),
          ),
          const Divider(height: 32),
          Text('You rent from', style: Theme.of(context).textTheme.titleMedium),
          for (final a in accounts)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(a.orgName),
              subtitle: Text('Account ${a.name}'),
            ),
        ],
      ),
    );
  }
}
