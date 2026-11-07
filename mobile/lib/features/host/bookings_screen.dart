import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/money.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import 'host_api.dart';
import 'host_models.dart';
import 'host_shell.dart';

const _statuses = <({String label, String value})>[
  (label: 'All', value: ''),
  (label: 'Requested', value: 'REQUESTED'),
  (label: 'Held', value: 'HELD'),
  (label: 'Confirmed', value: 'CONFIRMED'),
  (label: 'Checked in', value: 'CHECKED_IN'),
  (label: 'Completed', value: 'COMPLETED'),
  (label: 'Cancelled', value: 'CANCELLED'),
];

class BookingsScreen extends ConsumerStatefulWidget {
  const BookingsScreen({super.key});

  @override
  ConsumerState<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends ConsumerState<BookingsScreen> {
  String _status = '';
  int _refreshTick = 0;

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final canCreate = session?.can('bookings:create') ?? false;
    final propId = session?.activePropertyId;
    final api = ref.watch(hostApiProvider);

    return HostTabScaffold(
      title: 'Bookings',
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              onPressed: () async {
                final created = await context.push<bool>('/host/bookings/new');
                if (created == true && mounted) {
                  setState(() => _refreshTick++);
                }
              },
              icon: const Icon(Icons.add),
              label: const Text('New booking'),
            )
          : null,
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                for (final s in _statuses)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(
                      label: Text(s.label),
                      selected: _status == s.value,
                      onSelected: (_) => setState(() => _status = s.value),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: PagedList<HostBooking>(
              resetKey: '$_status-$propId-$_refreshTick',
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
              load: (page) =>
                  api.bookings(page: page, propertyId: propId, status: _status),
              empty: const EmptyState(
                icon: Icons.book_online_outlined,
                title: 'No bookings found',
                body: 'Direct and website bookings will appear here.',
              ),
              itemBuilder: (context, b) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  child: ListTile(
                    title: Text('${b.guestName} · ${b.code}'),
                    subtitle: Text(
                      '${b.listingTitle} (${b.unitNumber})\n${b.checkIn} → ${b.checkOut} · ${b.status}',
                    ),
                    isThreeLine: true,
                    trailing: b.hasMoney
                        ? Text(
                            formatKes(b.totalCents ?? 0),
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          )
                        : null,
                    onTap: () => context.push('/host/bookings/${b.id}'),
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
