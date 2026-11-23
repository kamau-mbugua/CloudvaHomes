import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/money.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import 'booking_view.dart';
import 'calendar_widgets.dart' show CalChip;
import 'detail_ui.dart';
import 'host_api.dart';
import 'host_models.dart';
import 'host_shell.dart';

const _statuses = <({String label, String value})>[
  (label: 'All', value: ''),
  (label: 'Requests', value: 'REQUESTED'),
  (label: 'Awaiting payment', value: 'HELD'),
  (label: 'Confirmed', value: 'CONFIRMED'),
  (label: 'In the house', value: 'CHECKED_IN'),
  (label: 'Checked out', value: 'COMPLETED'),
  (label: 'No-show', value: 'NO_SHOW'),
  (label: 'Cancelled', value: 'CANCELLED'),
];

/// The Bookings tab: every stay, newest first, with a status filter and search.
class BookingsScreen extends ConsumerStatefulWidget {
  const BookingsScreen({super.key});

  @override
  ConsumerState<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends ConsumerState<BookingsScreen> {
  final _search = TextEditingController();
  String _status = '';
  String _q = '';
  int _refreshTick = 0;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _open(String path) async {
    await context.push(path);
    if (mounted) setState(() => _refreshTick++);
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final canCreate = session?.can('bookings:create') ?? false;
    final propId = session?.activePropertyId;
    final api = ref.watch(hostApiProvider);

    return HostTabScaffold(
      title: 'Bookings',
      actions: [
        if (canCreate)
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: FilledButton(
              key: const Key('booking-add'),
              style: FilledButton.styleFrom(
                backgroundColor: HodiColors.lime,
                foregroundColor: HodiColors.navy,
                minimumSize: const Size(0, 36),
                padding: const EdgeInsets.symmetric(horizontal: 14),
              ),
              onPressed: () => _open('/host/bookings/new'),
              child: const Text('+ Booking'),
            ),
          ),
      ],
      bottom: NavySearchField(
        controller: _search,
        hint: 'Search guest, phone or booking code',
        onSubmitted: (v) => setState(() => _q = v.trim()),
        onCleared: () => setState(() => _q = ''),
      ),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
              children: [
                for (final s in _statuses) ...[
                  CalChip(
                    label: s.label,
                    selected: _status == s.value,
                    onTap: () => setState(() => _status = s.value),
                  ),
                  const SizedBox(width: 6),
                ],
              ],
            ),
          ),
          Expanded(
            child: PagedList<HostBooking>(
              resetKey: '$_status-$_q-$propId-$_refreshTick',
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 24),
              load: (page) => api.bookings(
                page: page,
                propertyId: propId,
                status: _status,
                q: _q,
              ),
              empty: EmptyState(
                icon: Icons.book_online_outlined,
                title: _q.isNotEmpty
                    ? 'No booking matches “$_q”'
                    : 'No bookings here yet',
                body:
                    'Bookings you add and ones guests make on your site show here.',
              ),
              itemBuilder: (context, b) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: BookingRow(
                  booking: b,
                  onTap: () => _open('/host/bookings/${b.id}'),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A booking in a list: date tile, guest and code, unit, dates, and status and money pills.
class BookingRow extends StatelessWidget {
  const BookingRow({super.key, required this.booking, required this.onTap});

  final HostBooking booking;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final b = booking;
    final cs = Theme.of(context).colorScheme;
    final money = bookingMoneyPill(b);
    final (tileBg, tileFg) = detailTone(bookingStatusTone(b.status));
    final day = dayLabel(b.checkIn).split(' '); // ["Sat", "14", "Nov"]
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
              Container(
                width: 54,
                constraints: const BoxConstraints(minHeight: 54),
                padding: const EdgeInsets.symmetric(vertical: 6),
                decoration: BoxDecoration(
                  color: tileBg,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      day[1],
                      style: TextStyle(
                        color: tileFg,
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        height: 1.1,
                      ),
                    ),
                    Text(
                      '${day[0]} · ${day[2]}',
                      style: TextStyle(
                        color: tileFg,
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Flexible(
                          flex: 3,
                          child: Text(
                            b.guestName.isEmpty ? 'Guest' : b.guestName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            b.code,
                            maxLines: 1,
                            overflow: TextOverflow.fade,
                            softWrap: false,
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 11,
                              color: HodiColors.inkMuted,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${b.listingTitle} · ${b.unitNumber}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        color: HodiColors.inkMuted,
                      ),
                    ),
                    Text(
                      '${dayRange(b.checkIn, b.checkOut)} · ${b.nights} night${b.nights == 1 ? '' : 's'} · ${b.guests} guest${b.guests == 1 ? '' : 's'}',
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
                          bookingStatusLabel(b.status),
                          tone: bookingStatusTone(b.status),
                        ),
                        if (money != null)
                          DetailPill(money.label, tone: money.tone),
                      ],
                    ),
                  ],
                ),
              ),
              if (b.hasMoney) ...[
                const SizedBox(width: 8),
                Text(
                  formatKes(b.totalCents ?? 0).replaceFirst('.00', ''),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
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
