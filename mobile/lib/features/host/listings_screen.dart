import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/money.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import '../staff/staff_widgets.dart';
import 'host_api.dart';
import 'host_shell.dart';

class ListingsScreen extends ConsumerWidget {
  const ListingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncListings = ref.watch(hostListingsProvider);
    final canCreate = can(ref, 'listings:create');
    final canUpdate = can(ref, 'listings:update');

    return HostTabScaffold(
      title: 'Listings',
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              onPressed: () => context.push('/host/listings/new'),
              backgroundColor: HodiColors.lime,
              foregroundColor: HodiColors.navy,
              icon: const Icon(Icons.add),
              label: const Text('Add listing'),
            )
          : null,
      body: asyncListings.when(
        loading: () => const KodiHubSkeletonList(rows: 4),
        error: (err, _) => ErrorState(
          message: messageOf(err),
          onRetry: () => ref.invalidate(hostListingsProvider),
        ),
        data: (items) {
          if (items.isEmpty) {
            return const EmptyState(
              icon: Icons.bed_outlined,
              title: 'No listings yet',
              body:
                  'Add your first short-stay unit with photos and nightly price.',
            );
          }

          return RefreshIndicator(
            onRefresh: () => ref.refresh(hostListingsProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 88),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final item = items[index];
                return Card(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => context.push('/host/listings/${item.id}'),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        children: [
                          UnitBadge(
                            item.unitNumber.isEmpty ? 'ST' : item.unitNumber,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item.title,
                                  style: const TextStyle(
                                    fontSize: 15.5,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  [
                                    item.propertyName,
                                    '${item.bedrooms} BR · up to ${item.maxGuests} guests',
                                  ].join(' · '),
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.onSurfaceVariant,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 4,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  children: [
                                    Text(
                                      '${formatKes(item.nightlyPriceCents)} / night',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13.5,
                                      ),
                                    ),
                                    StatusChip(
                                      item.published ? 'Published' : 'Draft',
                                      tone: item.published
                                          ? Tone.good
                                          : Tone.neutral,
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          if (canUpdate)
                            Switch(
                              value: item.published,
                              onChanged: (next) async {
                                try {
                                  await ref.read(hostApiProvider).updateListing(
                                    item.id,
                                    {'published': next},
                                  );
                                  ref.invalidate(hostListingsProvider);
                                } on ApiError catch (e) {
                                  if (context.mounted) {
                                    showMessage(context, e.message);
                                  }
                                }
                              },
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
