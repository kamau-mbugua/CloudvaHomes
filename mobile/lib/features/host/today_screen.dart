import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/money.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import 'host_api.dart';
import 'host_models.dart';
import 'host_shell.dart';

class TodayScreen extends ConsumerStatefulWidget {
  const TodayScreen({super.key});

  @override
  ConsumerState<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends ConsumerState<TodayScreen> {
  int _refreshTick = 0;

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final canSeeMoney = session?.can('stay-payments:view') ?? false;
    final propId = session?.activePropertyId;
    final today = DateTime.now().toIso8601String().substring(0, 10);

    return HostTabScaffold(
      title: 'Today',
      body: FutureBuilder<PageResult<HostBooking>>(
        key: ValueKey('$propId-$_refreshTick'),
        future: ref.read(hostApiProvider).bookings(propertyId: propId),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorState(
              message: messageOf(snap.error!),
              onRetry: () => setState(() => _refreshTick++),
            );
          }
          final all = snap.data?.rows ?? const [];
          final arrivals = [
            for (final b in all)
              if (b.checkIn == today &&
                  (b.status == 'CONFIRMED' || b.status == 'HELD'))
                b,
          ];
          final departures = [
            for (final b in all)
              if (b.checkOut == today &&
                  (b.status == 'CHECKED_IN' || b.status == 'CONFIRMED'))
                b,
          ];
          final inHouse = [
            for (final b in all)
              if (b.status == 'CHECKED_IN' ||
                  (b.status == 'CONFIRMED' &&
                      b.checkIn.compareTo(today) <= 0 &&
                      b.checkOut.compareTo(today) > 0))
                b,
          ];
          final requests = [
            for (final b in all)
              if (b.status == 'REQUESTED') b,
          ];
          final toClean = [
            for (final b in all)
              if (!b.cleaningDone &&
                  (b.status == 'COMPLETED' || b.checkOut == today))
                b,
          ];

          int monthCollected = 0;
          int monthOwed = 0;
          for (final b in all) {
            if (b.status != 'CANCELLED' && b.status != 'EXPIRED') {
              monthCollected +=
                  (b.amountPaidCents ?? 0) - (b.amountRefundedCents ?? 0);
              monthOwed += b.owedCents ?? 0;
            }
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (canSeeMoney) ...[
                SectionCard(
                  title: 'This month',
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Collected'),
                              Text(
                                formatKes(monthCollected),
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Balances owed'),
                              Text(
                                formatKes(monthOwed),
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
              ],
              _BoardGroup(title: 'Arriving today', items: arrivals),
              const SizedBox(height: 12),
              _BoardGroup(title: 'Departing today', items: departures),
              const SizedBox(height: 12),
              _BoardGroup(title: 'In-house', items: inHouse),
              const SizedBox(height: 12),
              _BoardGroup(title: 'Requests waiting', items: requests),
              const SizedBox(height: 12),
              _BoardGroup(title: 'Units to clean', items: toClean),
            ],
          );
        },
      ),
    );
  }
}

class _BoardGroup extends StatelessWidget {
  const _BoardGroup({required this.title, required this.items});

  final String title;
  final List<HostBooking> items;

  @override
  Widget build(BuildContext context) => SectionCard(
    title: '$title (${items.length})',
    children: [
      if (items.isEmpty)
        const Text('None right now.')
      else
        for (final b in items)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('${b.guestName} · ${b.unitNumber}'),
            subtitle: Text('${b.listingTitle} · ${b.checkIn} → ${b.checkOut}'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/host/bookings/${b.id}'),
          ),
    ],
  );
}
