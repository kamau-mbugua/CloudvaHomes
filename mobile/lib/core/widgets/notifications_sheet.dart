import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_error.dart';
import '../dates.dart';
import '../providers.dart';
import 'common.dart';

class AppNotification {
  AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.createdAt,
    this.link,
    this.readAt,
  });

  final String id;
  final String kind;
  final String title;
  final String body;
  final String createdAt;
  final String? link;
  final String? readAt;

  bool get isRead => readAt != null;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
    id: j['id'] as String,
    kind: j['kind'] as String? ?? 'GENERAL',
    title: j['title'] as String? ?? '',
    body: j['body'] as String? ?? '',
    createdAt: j['createdAt'] as String? ?? '',
    link: j['link'] as String?,
    readAt: j['readAt'] as String?,
  );
}

final notificationsProvider =
    FutureProvider.autoDispose<
      ({List<AppNotification> items, int unreadCount})
    >((ref) async {
      final res = await ref.watch(apiClientProvider).get('/notifications');
      final rows = [
        for (final r in (res['data'] as List? ?? const []))
          if (r is Map<String, dynamic>) AppNotification.fromJson(r),
      ];
      final meta = res['meta'] as Map<String, dynamic>? ?? const {};
      final unread = (meta['unreadCount'] as num?)?.toInt() ?? 0;
      return (items: rows, unreadCount: unread);
    });

class NotificationButton extends StatelessWidget {
  const NotificationButton({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Notifications',
      icon: Stack(
        clipBehavior: Clip.none,
        children: [
          const Icon(Icons.notifications_outlined, size: 22),
          Positioned(
            right: 1,
            top: 1,
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: const Color(0xFF84BD00),
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFF002B4D), width: 1.5),
              ),
            ),
          ),
        ],
      ),
      onPressed: () => NotificationsSheet.show(context),
    );
  }
}

class NotificationsSheet extends ConsumerWidget {
  const NotificationsSheet({super.key});

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => const NotificationsSheet(),
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncData = ref.watch(notificationsProvider);
    final api = ref.read(apiClientProvider);

    Future<void> markAllRead() async {
      try {
        await api.post('/notifications/read-all');
        ref.invalidate(notificationsProvider);
      } on ApiError catch (e) {
        if (context.mounted) showMessage(context, e.message);
      }
    }

    Future<void> markRead(AppNotification n) async {
      if (n.isRead) return;
      try {
        await api.post('/notifications/${Uri.encodeComponent(n.id)}/read');
        ref.invalidate(notificationsProvider);
      } on ApiError catch (e) {
        if (context.mounted) showMessage(context, e.message);
      }
    }

    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.72,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 12, 8),
            child: Row(
              children: [
                Text(
                  'Notifications',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const Spacer(),
                if ((asyncData.valueOrNull?.unreadCount ?? 0) > 0)
                  TextButton(
                    onPressed: markAllRead,
                    child: const Text('Mark all read'),
                  ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: AsyncBody(
              value: asyncData,
              onRetry: () => ref.invalidate(notificationsProvider),
              data: (d) => d.items.isEmpty
                  ? const EmptyState(
                      icon: Icons.notifications_none_outlined,
                      title: 'No notifications yet',
                      body:
                          'Maintenance updates, invoice alerts and payment receipts will appear here.',
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      itemCount: d.items.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, i) {
                        final n = d.items[i];
                        return ListTile(
                          leading: Icon(
                            n.isRead
                                ? Icons.notifications_none_outlined
                                : Icons.notifications_active_outlined,
                            color: n.isRead
                                ? null
                                : Theme.of(context).colorScheme.primary,
                          ),
                          title: Text(
                            n.title,
                            style: TextStyle(
                              fontWeight: n.isRead
                                  ? FontWeight.w500
                                  : FontWeight.w700,
                            ),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 2),
                              Text(n.body),
                              if (n.createdAt.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  formatTimestamp(n.createdAt),
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ],
                          ),
                          onTap: () => markRead(n),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
