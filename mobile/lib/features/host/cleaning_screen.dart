import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/dates.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import '../staff/staff_widgets.dart';
import 'booking_view.dart';
import 'calendar_rules.dart' show addDays;
import 'calendar_widgets.dart' show CalChip;
import 'detail_ui.dart';
import 'host_api.dart';
import 'host_models.dart';

/// How soon a unit must be ready: (label, tone). The next arrival decides it.
({String label, String tone}) cleaningUrgency(
  String? nextCheckIn,
  String today,
) {
  if (nextCheckIn == null) return (label: 'No arrival booked', tone: 'plain');
  if (nextCheckIn.compareTo(today) <= 0) {
    return (label: 'Guest arrives today', tone: 'bad');
  }
  if (nextCheckIn == addDays(today, 1)) {
    return (label: 'Guest arrives tomorrow', tone: 'warn');
  }
  return (label: 'Next guest ${dayLabel(nextCheckIn)}', tone: 'ok');
}

/// Units to clean after guests leave, and the ones already cleaned.
class CleaningScreen extends ConsumerStatefulWidget {
  const CleaningScreen({super.key});

  @override
  ConsumerState<CleaningScreen> createState() => _CleaningScreenState();
}

class _CleaningScreenState extends ConsumerState<CleaningScreen> {
  String _status = 'OPEN';
  int _refreshTick = 0;
  String? _busyId;

  void _reload() => setState(() => _refreshTick++);

  Future<void> _markDone(HostCleaningTask task, {String? note}) async {
    setState(() => _busyId = task.id);
    try {
      await ref.read(hostApiProvider).markCleaningDone(task.id, note: note);
      if (!mounted) return;
      showMessage(context, '${task.unitTitle} is clean.');
      _reload();
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _markDoneWithNote(HostCleaningTask task) async {
    final ctrl = TextEditingController();
    final note = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          0,
          16,
          MediaQuery.viewInsetsOf(ctx).bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Mark ${task.unitTitle} clean',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              autofocus: true,
              maxLines: 3,
              maxLength: 500,
              decoration: const InputDecoration(
                labelText: 'Note',
                hintText: 'e.g. Fresh linens; the kitchen tap drips',
              ),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(ctrl.text.trim()),
              child: const Text('Mark clean'),
            ),
          ],
        ),
      ),
    );
    ctrl.dispose();
    if (note != null && mounted) await _markDone(task, note: note);
  }

  @override
  Widget build(BuildContext context) {
    final canUpdate = can(ref, 'cleaning:update');
    final propId = ref.watch(sessionProvider).valueOrNull?.activePropertyId;
    final api = ref.watch(hostApiProvider);
    final today = todayIso();

    return Scaffold(
      appBar: const KodiHubAppBar(title: Text('Cleaning')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
            child: Row(
              children: [
                CalChip(
                  label: 'To clean',
                  selected: _status == 'OPEN',
                  onTap: () => setState(() => _status = 'OPEN'),
                ),
                const SizedBox(width: 6),
                CalChip(
                  label: 'Done',
                  selected: _status == 'DONE',
                  onTap: () => setState(() => _status = 'DONE'),
                ),
              ],
            ),
          ),
          Expanded(
            child: PagedList<HostCleaningTask>(
              resetKey: '$_status-$propId-$_refreshTick',
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
              load: (page) => api.cleaningTasks(
                page: page,
                status: _status,
                propertyId: propId,
              ),
              empty: EmptyState(
                icon: Icons.cleaning_services_outlined,
                title: _status == 'OPEN'
                    ? 'All units are clean'
                    : 'Nothing cleaned yet',
                body: _status == 'OPEN'
                    ? 'A unit shows here when a guest checks out.'
                    : 'Units you mark clean show here.',
              ),
              itemBuilder: (context, t) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _CleaningCard(
                  task: t,
                  today: today,
                  busy: _busyId == t.id,
                  canUpdate: canUpdate,
                  onDone: () => _markDone(t),
                  onDoneWithNote: () => _markDoneWithNote(t),
                  onOpenBooking: t.bookingId == null
                      ? null
                      : () => context.push('/host/bookings/${t.bookingId}'),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CleaningCard extends StatelessWidget {
  const _CleaningCard({
    required this.task,
    required this.today,
    required this.busy,
    required this.canUpdate,
    required this.onDone,
    required this.onDoneWithNote,
    required this.onOpenBooking,
  });

  final HostCleaningTask task;
  final String today;
  final bool busy;
  final bool canUpdate;
  final VoidCallback onDone;
  final VoidCallback onDoneWithNote;
  final VoidCallback? onOpenBooking;

  @override
  Widget build(BuildContext context) {
    final t = task;
    final open = t.status == 'OPEN';
    final urgency = cleaningUrgency(t.nextCheckIn, today);
    final (iconBg, iconFg) = detailTone(open ? urgency.tone : 'ok');
    final leftBy = [
      if (t.guestName != null) t.guestName!,
      if (t.bookingCode != null) t.bookingCode!,
    ].join(' · ');
    return DetailCard(
      gap: 10,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: iconBg,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                open ? Icons.cleaning_services_outlined : Icons.check,
                color: iconFg,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    t.unitTitle,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    '${t.propertyName} · ${t.unitNumber}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: HodiColors.inkMuted,
                    ),
                  ),
                ],
              ),
            ),
            if (open) ...[
              const SizedBox(width: 8),
              Flexible(child: DetailPill(urgency.label, tone: urgency.tone)),
            ],
          ],
        ),
        if (open && t.since.isNotEmpty)
          _Line(
            icon: Icons.logout,
            text: leftBy.isEmpty
                ? 'Waiting since ${whenLabel(t.since)}'
                : 'Left by $leftBy, ${whenLabel(t.since)}',
            onTap: onOpenBooking,
          ),
        if (!open && t.doneAt != null)
          _Line(
            icon: Icons.check_circle_outline,
            text:
                'Cleaned ${whenLabel(t.doneAt!)}${t.doneBy != null ? ' · by ${t.doneBy}' : ''}',
          ),
        if (!open && leftBy.isNotEmpty)
          _Line(
            icon: Icons.logout,
            text: 'After $leftBy',
            onTap: onOpenBooking,
          ),
        if (t.note?.trim().isNotEmpty ?? false)
          _Line(icon: Icons.sticky_note_2_outlined, text: t.note!.trim()),
        if (open && canUpdate)
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: busy ? null : onDone,
                child: Text(busy ? 'Saving…' : 'Mark clean'),
              ),
              TextButton(
                onPressed: busy ? null : onDoneWithNote,
                child: const Text('Add a note'),
              ),
            ],
          ),
      ],
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text, this.onTap});

  final IconData icon;
  final String text;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final row = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 16, color: HodiColors.inkMuted),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 13,
              height: 1.35,
              color: onTap == null
                  ? HodiColors.inkSecondary
                  : HodiColors.limeText,
              fontWeight: onTap == null ? FontWeight.w400 : FontWeight.w500,
            ),
          ),
        ),
        if (onTap != null)
          const Icon(Icons.chevron_right, size: 16, color: HodiColors.limeText),
      ],
    );
    return onTap == null ? row : InkWell(onTap: onTap, child: row);
  }
}
