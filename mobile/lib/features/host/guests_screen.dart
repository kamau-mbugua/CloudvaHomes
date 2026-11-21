import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/money.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import '../staff/staff_widgets.dart';
import 'host_api.dart';
import 'host_models.dart';

class GuestsScreen extends ConsumerStatefulWidget {
  const GuestsScreen({super.key});

  @override
  ConsumerState<GuestsScreen> createState() => _GuestsScreenState();
}

class _GuestsScreenState extends ConsumerState<GuestsScreen> {
  String _q = '';
  int _refreshTick = 0;

  void _reload() {
    setState(() => _refreshTick++);
  }

  Future<void> _openGuest(HostGuest summary) async {
    await context.push('/host/guests/${summary.id}');
    if (mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(hostApiProvider);
    return Scaffold(
      appBar: const KodiHubAppBar(title: Text('Guests')),
      body: Column(
        children: [
          SearchField(
            hint: 'Search guest name or phone…',
            onChanged: (v) {
              setState(() => _q = v);
            },
          ),
          Expanded(
            child: PagedList<HostGuest>(
              resetKey: '$_q-$_refreshTick',
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              load: (page) => api.guests(page: page, q: _q),
              empty: const EmptyState(
                icon: Icons.people_outline,
                title: 'No guests found',
              ),
              itemBuilder: (context, g) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  child: ListTile(
                    title: Text(
                      g.name,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      [
                        g.phone,
                        '${g.staysCount} stays',
                        if (g.totalPaidCents != null)
                          formatKes(g.totalPaidCents!),
                      ].join(' · '),
                    ),
                    trailing: g.doNotAccept
                        ? const StatusChip('Review')
                        : const Icon(Icons.chevron_right, size: 20),
                    onTap: () => _openGuest(g),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
