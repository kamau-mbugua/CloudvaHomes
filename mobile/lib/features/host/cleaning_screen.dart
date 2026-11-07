import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import '../staff/staff_widgets.dart';
import 'host_api.dart';
import 'host_models.dart';

class CleaningScreen extends ConsumerStatefulWidget {
  const CleaningScreen({super.key});

  @override
  ConsumerState<CleaningScreen> createState() => _CleaningScreenState();
}

class _CleaningScreenState extends ConsumerState<CleaningScreen> {
  String _status = 'OPEN';
  int _refreshTick = 0;

  void _reload() {
    setState(() => _refreshTick++);
  }

  Future<void> _markDone(HostCleaningTask task) async {
    try {
      await ref.read(hostApiProvider).markCleaningDone(task.id);
      if (!mounted) return;
      showMessage(context, 'Marked ${task.unitTitle} as clean.');
      _reload();
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canUpdate = can(ref, 'cleaning:update');
    final propId = ref.watch(sessionProvider).valueOrNull?.activePropertyId;
    final api = ref.watch(hostApiProvider);
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return Scaffold(
      appBar: const KodiHubAppBar(title: Text('Cleaning')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('To clean'),
                  selected: _status == 'OPEN',
                  onSelected: (_) {
                    if (_status != 'OPEN') {
                      setState(() => _status = 'OPEN');
                    }
                  },
                ),
                ChoiceChip(
                  label: const Text('Completed'),
                  selected: _status == 'DONE',
                  onSelected: (_) {
                    if (_status != 'DONE') {
                      setState(() => _status = 'DONE');
                    }
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: PagedList<HostCleaningTask>(
              resetKey: '$_status-$propId-$_refreshTick',
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              load: (page) => api.cleaningTasks(
                page: page,
                status: _status,
                propertyId: propId,
              ),
              empty: EmptyState(
                icon: Icons.cleaning_services_outlined,
                title: _status == 'OPEN'
                    ? 'All units are clean'
                    : 'No completed cleaning tasks yet',
              ),
              itemBuilder: (context, t) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          t.unitTitle,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${t.propertyName} · ${t.unitNumber}',
                          style: TextStyle(color: muted),
                        ),
                        if (t.nextCheckIn != null) ...[
                          const SizedBox(height: 6),
                          Text(
                            'Next check-in: ${t.nextCheckIn}',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ],
                        if (t.note != null && t.note!.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(t.note!),
                        ],
                        if (t.status == 'OPEN' && canUpdate) ...[
                          const SizedBox(height: 10),
                          Align(
                            alignment: Alignment.centerRight,
                            child: FilledButton.tonal(
                              onPressed: () => _markDone(t),
                              child: const Text('Mark done'),
                            ),
                          ),
                        ],
                      ],
                    ),
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
