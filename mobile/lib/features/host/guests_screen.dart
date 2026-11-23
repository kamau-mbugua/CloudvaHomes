import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import 'booking_view.dart';
import 'detail_ui.dart';
import 'host_api.dart';
import 'host_models.dart';

/// Everyone who has booked with the host, searchable by name or phone.
class GuestsScreen extends ConsumerStatefulWidget {
  const GuestsScreen({super.key});

  @override
  ConsumerState<GuestsScreen> createState() => _GuestsScreenState();
}

class _GuestsScreenState extends ConsumerState<GuestsScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _q = '';
  int _refreshTick = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _typed(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _q = v.trim());
    });
  }

  Future<void> _openGuest(HostGuest g) async {
    await context.push('/host/guests/${g.id}');
    if (mounted) setState(() => _refreshTick++);
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(hostApiProvider);
    return Scaffold(
      appBar: KodiHubAppBar(
        title: const Text('Guests'),
        bottom: NavySearchField(
          controller: _search,
          hint: 'Search name or phone',
          onChanged: _typed,
          onSubmitted: (v) => setState(() => _q = v.trim()),
        ),
      ),
      body: PagedList<HostGuest>(
        resetKey: '$_q-$_refreshTick',
        padding: const EdgeInsets.fromLTRB(12, 14, 12, 24),
        load: (page) => api.guests(page: page, q: _q),
        empty: EmptyState(
          icon: Icons.people_outline,
          title: _q.isEmpty ? 'No guests yet' : 'No guest matches “$_q”',
          body: _q.isEmpty
              ? 'Guests appear here once they book a stay.'
              : 'Try part of their name or phone number.',
        ),
        itemBuilder: (context, g) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _GuestRow(guest: g, onTap: () => _openGuest(g)),
        ),
      ),
    );
  }
}

class _GuestRow extends StatelessWidget {
  const _GuestRow({required this.guest, required this.onTap});

  final HostGuest guest;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final g = guest;
    final cs = Theme.of(context).colorScheme;
    final paid = g.totalPaidCents;
    return Material(
      color: cs.surfaceContainerLowest,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: cs.outlineVariant),
        borderRadius: BorderRadius.circular(16),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              InitialsAvatar(initials(g.name)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      g.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (g.phone.isNotEmpty)
                      Text(
                        g.phone,
                        style: const TextStyle(
                          fontSize: 13,
                          color: HodiColors.inkMuted,
                        ),
                      ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        DetailPill(
                          g.staysCount == 0
                              ? 'No stays yet'
                              : '${g.staysCount} stay${g.staysCount == 1 ? '' : 's'}',
                          tone: g.staysCount > 1 ? 'info' : 'plain',
                        ),
                        if (paid != null && paid > 0)
                          DetailPill('KES ${shillings(paid)} paid', tone: 'ok'),
                        if (g.lastStay != null)
                          DetailPill('Last ${dayLabel(g.lastStay!)}'),
                        if (g.doNotAccept)
                          const DetailPill(
                            'Review before booking',
                            tone: 'warn',
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: HodiColors.inkMuted),
            ],
          ),
        ),
      ),
    );
  }
}
