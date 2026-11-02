import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/api_error.dart';
import '../auth/session_controller.dart';
import '../dates.dart';
import '../notifications/push_service.dart';
import '../providers.dart';
import '../theme.dart';
import 'common.dart';

class AppNotification {
  AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.createdAt,
    this.actionUrl,
    this.readAt,
  });

  final String id;
  final String kind;
  final String title;
  final String body;
  final String createdAt;
  final String? actionUrl;
  final String? readAt;

  String? get link => actionUrl;
  bool get isRead => readAt != null;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
    id: j['id'] as String,
    kind: j['kind'] as String? ?? 'GENERAL',
    title: j['title'] as String? ?? '',
    body: j['body'] as String? ?? '',
    createdAt: j['createdAt'] as String? ?? '',
    actionUrl: (j['actionUrl'] ?? j['link']) as String?,
    readAt: j['readAt'] as String?,
  );
}

/// Tracks the last known unread notification count so [NotificationButton] can display a numeric
/// badge without forcing an eager HTTP request during unrelated widget tests.
final unreadNotificationsCountProvider = StateProvider<int?>((ref) => null);

final notificationsProvider =
    FutureProvider.autoDispose<
      ({List<AppNotification> items, int unreadCount})
    >((ref) async {
      final res = await ref
          .watch(apiClientProvider)
          .get('/notifications', query: {'page': 1, 'pageSize': 40});
      final rows = [
        for (final r in (res['data'] as List? ?? const []))
          if (r is Map<String, dynamic>) AppNotification.fromJson(r),
      ];
      final meta = res['meta'] as Map<String, dynamic>? ?? const {};
      final unread = (meta['unreadCount'] as num?)?.toInt() ?? 0;
      Future.microtask(() {
        ref.read(unreadNotificationsCountProvider.notifier).state = unread;
      });
      return (items: rows, unreadCount: unread);
    });

({IconData icon, String label, Color color}) _kindStyle(String kind) {
  final k = kind.toUpperCase();
  if (k.contains('PAYMENT')) {
    return (
      icon: Icons.payments_outlined,
      label: 'PAYMENT',
      color: HodiColors.limeText,
    );
  }
  if (k.contains('INVOICE')) {
    return (
      icon: Icons.receipt_long_outlined,
      label: 'INVOICE',
      color: HodiColors.navy,
    );
  }
  if (k.contains('REMINDER')) {
    return (
      icon: Icons.alarm_outlined,
      label: 'REMINDER',
      color: const Color(0xFFB45309),
    );
  }
  if (k.contains('MAINTENANCE')) {
    return (
      icon: Icons.handyman_outlined,
      label: 'MAINTENANCE',
      color: const Color(0xFF0369A1),
    );
  }
  if (k.contains('UNIT_ASSIGNED') || k.contains('TENANCY')) {
    return (
      icon: Icons.home_work_outlined,
      label: 'TENANCY',
      color: const Color(0xFF4338CA),
    );
  }
  return (
    icon: Icons.notifications_active_outlined,
    label: 'ALERT',
    color: HodiColors.navy,
  );
}

class NotificationButton extends ConsumerWidget {
  const NotificationButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadNotificationsCountProvider);
    return IconButton(
      tooltip: unread != null && unread > 0
          ? 'Notifications ($unread unread)'
          : 'Notifications',
      icon: Stack(
        clipBehavior: Clip.none,
        children: [
          const Icon(Icons.notifications_outlined, size: 22),
          if (unread == null)
            Positioned(
              right: 1,
              top: 1,
              child: Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: const Color(0xFF84BD00),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: const Color(0xFF002B4D),
                    width: 1.5,
                  ),
                ),
              ),
            )
          else if (unread > 0)
            Positioned(
              right: -4,
              top: -4,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                decoration: BoxDecoration(
                  color: HodiColors.danger,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: const Color(0xFF002B4D),
                    width: 1.5,
                  ),
                ),
                child: Text(
                  unread > 99 ? '99+' : '$unread',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontFamily: 'JetBrainsMono',
                    color: Colors.white,
                    fontSize: 9.5,
                    fontWeight: FontWeight.w700,
                    height: 1.2,
                  ),
                ),
              ),
            ),
        ],
      ),
      onPressed: () => NotificationsSheet.show(context),
    );
  }
}

class NotificationsSheet extends ConsumerStatefulWidget {
  const NotificationsSheet({super.key});

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => const NotificationsSheet(),
  );

  @override
  ConsumerState<NotificationsSheet> createState() => _NotificationsSheetState();
}

class _NotificationsSheetState extends ConsumerState<NotificationsSheet> {
  bool _unreadOnly = false;
  bool _sendingTest = false;

  Future<void> _markAllRead() async {
    try {
      await ref.read(apiClientProvider).post('/notifications/read-all');
      ref.invalidate(notificationsProvider);
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    }
  }

  Future<void> _sendTestAlert() async {
    setState(() => _sendingTest = true);
    try {
      await ref.read(apiClientProvider).post('/notifications/test');
      ref.invalidate(notificationsProvider);
      if (mounted) {
        showMessage(context, 'Test notification sent.');
      }
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _sendingTest = false);
    }
  }

  Future<void> _dismiss(AppNotification n) async {
    try {
      await ref
          .read(apiClientProvider)
          .delete('/notifications/${Uri.encodeComponent(n.id)}');
      ref.invalidate(notificationsProvider);
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    }
  }

  Future<void> _handleTap(AppNotification n) async {
    if (!n.isRead) {
      try {
        await ref
            .read(apiClientProvider)
            .post('/notifications/${Uri.encodeComponent(n.id)}/read');
        ref.invalidate(notificationsProvider);
      } on ApiError catch (e) {
        if (mounted) showMessage(context, e.message);
      }
    }
    if (!mounted) return;
    final target = mobileRouteForActionUrl(n.actionUrl);
    if (target != null) {
      final router = GoRouter.maybeOf(context);
      Navigator.of(context).pop();
      if (target.mode != null) {
        ref.read(appModeProvider.notifier).state = target.mode;
      }
      router?.go(target.route);
    }
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(notificationsProvider);
    final unreadCount = asyncData.valueOrNull?.unreadCount ?? 0;
    final scheme = Theme.of(context).colorScheme;

    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.78,
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
                if (unreadCount > 0) ...[
                  const SizedBox(width: 8),
                  StatusChip('$unreadCount unread', tone: Tone.info),
                ],
                const Spacer(),
                if (unreadCount > 0)
                  TextButton(
                    onPressed: _markAllRead,
                    child: const Text('Mark all read'),
                  ),
                IconButton(
                  tooltip: 'Send test notification',
                  onPressed: _sendingTest ? null : _sendTestAlert,
                  icon: const Icon(
                    Icons.notifications_active_outlined,
                    size: 20,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
            child: Row(
              children: [
                FilterChip(
                  label: const Text('All'),
                  selected: !_unreadOnly,
                  onSelected: (_) => setState(() => _unreadOnly = false),
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text('Unread ($unreadCount)'),
                  selected: _unreadOnly,
                  onSelected: (_) => setState(() => _unreadOnly = true),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: AsyncBody(
              value: asyncData,
              onRetry: () => ref.invalidate(notificationsProvider),
              data: (d) {
                final visible = _unreadOnly
                    ? d.items.where((i) => !i.isRead).toList()
                    : d.items;
                if (visible.isEmpty) {
                  return EmptyState(
                    icon: Icons.notifications_none_outlined,
                    title: _unreadOnly
                        ? 'No unread notifications'
                        : 'No notifications yet',
                    body: _unreadOnly
                        ? 'You have read all your notifications.'
                        : 'Maintenance updates, invoice alerts and payment receipts will appear here.',
                  );
                }
                return RefreshIndicator(
                  onRefresh: () => ref.refresh(notificationsProvider.future),
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: visible.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final n = visible[i];
                      final style = _kindStyle(n.kind);
                      return Dismissible(
                        key: ValueKey('notif-${n.id}'),
                        direction: DismissDirection.endToStart,
                        background: Container(
                          color: HodiColors.danger,
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: const Icon(
                            Icons.delete_outline,
                            color: Colors.white,
                          ),
                        ),
                        onDismissed: (_) => _dismiss(n),
                        child: Material(
                          color: n.isRead
                              ? Colors.transparent
                              : scheme.primary.withValues(alpha: 0.05),
                          child: ListTile(
                            leading: Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                color: style.color.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(
                                style.icon,
                                size: 20,
                                color: style.color,
                              ),
                            ),
                            title: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    n.title,
                                    style: TextStyle(
                                      fontWeight: n.isRead
                                          ? FontWeight.w500
                                          : FontWeight.w700,
                                    ),
                                  ),
                                ),
                                if (!n.isRead)
                                  Container(
                                    width: 8,
                                    height: 8,
                                    margin: const EdgeInsets.only(left: 6),
                                    decoration: const BoxDecoration(
                                      color: HodiColors.lime,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                              ],
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const SizedBox(height: 3),
                                Text(n.body),
                                const SizedBox(height: 5),
                                Row(
                                  children: [
                                    Text(
                                      style.label,
                                      style: TextStyle(
                                        fontFamily: 'JetBrainsMono',
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: style.color,
                                        letterSpacing: 0.8,
                                      ),
                                    ),
                                    if (n.createdAt.isNotEmpty) ...[
                                      Text(
                                        ' · ${formatTimestamp(n.createdAt)}',
                                        style: TextStyle(
                                          fontSize: 11.5,
                                          color: scheme.onSurfaceVariant,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                            trailing: n.actionUrl != null
                                ? Icon(
                                    Icons.chevron_right,
                                    size: 18,
                                    color: scheme.onSurfaceVariant,
                                  )
                                : null,
                            onTap: () => _handleTap(n),
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
