import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/money.dart';
import '../../core/widgets/common.dart';
import 'booking_view.dart';
import 'detail_ui.dart';
import 'host_api.dart';
import 'host_models.dart';

final hostGuestDetailProvider = FutureProvider.autoDispose
    .family<HostGuest, String>(
      (ref, id) => ref.watch(hostApiProvider).guest(id),
    );

/// A guest's page in the booking-details style: contact, money, stays and the host's notes.
class GuestDetailScreen extends ConsumerStatefulWidget {
  const GuestDetailScreen({super.key, required this.guestId});

  final String guestId;

  @override
  ConsumerState<GuestDetailScreen> createState() => _GuestDetailScreenState();
}

class _GuestDetailScreenState extends ConsumerState<GuestDetailScreen> {
  final _notes = TextEditingController();
  final _idNumber = TextEditingController();
  bool? _doNotAccept;
  bool _seeded = false;
  bool _saving = false;

  @override
  void dispose() {
    _notes.dispose();
    _idNumber.dispose();
    super.dispose();
  }

  void _reload() => ref.invalidate(hostGuestDetailProvider(widget.guestId));

  void _seed(HostGuest g) {
    if (_seeded) return;
    _seeded = true;
    _notes.text = g.notes ?? '';
    _doNotAccept = g.doNotAccept;
  }

  Future<void> _save(HostGuest g) async {
    setState(() => _saving = true);
    try {
      await ref.read(hostApiProvider).updateGuest(g.id, {
        'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        'doNotAccept': _doNotAccept ?? g.doNotAccept,
        if (_idNumber.text.trim().isNotEmpty) 'idNumber': _idNumber.text.trim(),
      });
      _idNumber.clear();
      _seeded = false;
      _reload();
      if (mounted) showMessage(context, 'Guest saved.');
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final canUpdate = session?.can('guests:update') ?? false;
    return ref
        .watch(hostGuestDetailProvider(widget.guestId))
        .when(
          loading: () => const Scaffold(
            appBar: KodiHubAppBar(title: Text('Guest')),
            body: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => Scaffold(
            appBar: const KodiHubAppBar(title: Text('Guest')),
            body: ErrorState(message: messageOf(e), onRetry: _reload),
          ),
          data: (g) {
            _seed(g);
            return _page(context, g, canUpdate);
          },
        );
  }

  Widget _page(BuildContext context, HostGuest g, bool canUpdate) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final stays = [...g.stays]..sort((a, b) => b.checkIn.compareTo(a.checkIn));
    final hasPhone = g.phone.isNotEmpty;

    return DetailScaffold(
      loading: _saving,
      onRefresh: () async => _reload(),
      title: Text(
        g.name,
        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
      ),
      subtitle: [
        if (hasPhone) g.phone,
        if (g.email?.isNotEmpty ?? false) g.email!,
      ].join(' · '),
      header: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          HeaderChip(
            g.staysCount == 0
                ? 'No stays yet'
                : '${g.staysCount} stay${g.staysCount == 1 ? '' : 's'}',
          ),
          if (g.lastStay != null)
            HeaderChip('Last stay ${dayLabel(g.lastStay!)}'),
          if (g.doNotAccept) const DetailPill.onNavy('Review before booking'),
        ],
      ),
      bottomBar: !hasPhone && !canUpdate
          ? null
          : DetailActionBar(
              actions: [
                if (hasPhone)
                  BarAction(
                    label: 'Message guest',
                    primary: !canUpdate,
                    onPressed: () => showMessageGuestSheet(
                      context,
                      name: g.name,
                      phone: g.phone,
                    ),
                  ),
                if (canUpdate)
                  BarAction(
                    label: _saving ? 'Saving…' : 'Save changes',
                    primary: true,
                    onPressed: _saving ? null : () => _save(g),
                  ),
              ],
            ),
      children: [
        DetailCard(
          title: 'Contact',
          children: [
            Row(
              children: [
                InitialsAvatar(initials(g.name)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        g.name,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (hasPhone)
                        Text(
                          g.phone,
                          style: TextStyle(fontSize: 13, color: muted),
                        ),
                      if (g.email?.isNotEmpty ?? false)
                        Text(
                          g.email!,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 13, color: muted),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            if (hasPhone) ContactButtons(phone: g.phone),
          ],
        ),
        if (g.totalPaidCents != null)
          DetailCard(
            title: 'Money',
            children: [
              Row(
                children: [
                  Expanded(
                    child: Figure('Paid in all', formatKes(g.totalPaidCents!)),
                  ),
                  Expanded(child: Figure('Stays', '${g.staysCount}')),
                ],
              ),
            ],
          ),
        DetailCard(
          title: 'Stays',
          gap: 0,
          children: [
            if (stays.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 14),
                child: Text('No stays yet.'),
              ),
            for (var i = 0; i < stays.length; i++)
              _StayRow(
                stay: stays[i],
                first: i == 0,
                onTap: () => context.push('/host/bookings/${stays[i].id}'),
              ),
          ],
        ),
        DetailCard(
          title: 'Notes and ID',
          gap: 10,
          children: [
            Text(
              'ID / passport: ${g.idNumberHint ?? 'not recorded'}',
              style: const TextStyle(fontSize: 14),
            ),
            if (canUpdate) ...[
              TextField(
                controller: _notes,
                maxLines: 3,
                minLines: 2,
                decoration: const InputDecoration(labelText: 'Your notes'),
              ),
              TextField(
                controller: _idNumber,
                decoration: const InputDecoration(
                  labelText: 'Update ID / passport (optional)',
                ),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Review before booking'),
                subtitle: const Text(
                  'Their site bookings come in as requests instead of being confirmed straight away.',
                ),
                value: _doNotAccept ?? g.doNotAccept,
                onChanged: (v) => setState(() => _doNotAccept = v),
              ),
            ] else if (g.notes?.trim().isNotEmpty ?? false)
              Text(g.notes!.trim(), style: const TextStyle(fontSize: 14)),
          ],
        ),
      ],
    );
  }
}

class _StayRow extends StatelessWidget {
  const _StayRow({
    required this.stay,
    required this.first,
    required this.onTap,
  });

  final HostGuestStay stay;
  final bool first;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final tone = switch (stay.status) {
      'CHECKED_IN' || 'CONFIRMED' => 'ok',
      'CANCELLED' || 'NO_SHOW' || 'DECLINED' || 'EXPIRED' => 'bad',
      'REQUESTED' || 'HELD' => 'info',
      _ => 'plain',
    };
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          border: first
              ? null
              : const Border(top: BorderSide(color: Color(0xFFEEF1F5))),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        '${dayLabel(stay.checkIn)} → ${dayLabel(stay.checkOut)}',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      DetailPill(bookingStatusLabel(stay.status), tone: tone),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      stay.code,
                      '${stay.listingTitle} · ${stay.unitNumber}',
                      if (stay.amountPaidCents != null)
                        'paid ${formatKes(stay.amountPaidCents!)}',
                    ].join(' · '),
                    style: TextStyle(fontSize: 12, color: muted),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: muted),
          ],
        ),
      ),
    );
  }
}
