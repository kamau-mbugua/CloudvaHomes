import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/dates.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import '../staff/more/photo.dart';
import '../staff/staff_widgets.dart';
import 'tenant_api.dart';

final _tenantRequestsVersionProvider = StateProvider<int>((ref) => 0);

class TenantRequestsScreen extends ConsumerWidget {
  const TenantRequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenantId = ref.watch(currentTenantIdProvider);
    final api = ref.watch(tenantApiProvider);
    final version = ref.watch(_tenantRequestsVersionProvider);
    if (tenantId == null) return const SizedBox.shrink();

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.build_outlined),
        label: const Text('Report issue'),
        onPressed: () => _CreateTenantRequestSheet.show(context, tenantId),
      ),
      body: PagedList<TenantMaintenanceRequest>(
        resetKey: (tenantId, version),
        padding: const EdgeInsets.only(bottom: 88),
        load: (page) async {
          final p = await api.requests(tenantId, page: page);
          return (rows: p.rows, hasMore: p.hasMore);
        },
        empty: const EmptyState(
          icon: Icons.handyman_outlined,
          title: 'No maintenance requests',
          body: 'Report a plumbing, electrical or repair issue with a photo.',
        ),
        itemBuilder: (context, r) => Card(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        r.title,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                    ),
                    StatusChip(
                      switch (r.status) {
                        'IN_PROGRESS' => 'In progress',
                        'RESOLVED' => 'Resolved',
                        'CLOSED' => 'Closed',
                        _ => 'Open',
                      },
                      tone: switch (r.status) {
                        'RESOLVED' || 'CLOSED' => Tone.good,
                        'IN_PROGRESS' => Tone.warn,
                        _ => Tone.neutral,
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  [
                    r.number,
                    expenseCategoryLabel[r.category] ?? r.category,
                    r.priority,
                    if (r.unitNumber != null) 'Unit ${r.unitNumber}',
                    if (r.createdAt.isNotEmpty) formatDay(r.createdAt),
                  ].join(' · '),
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 8),
                Text(r.description),
                if (r.resolutionNote != null &&
                    r.resolutionNote!.isNotEmpty) ...[
                  const Divider(height: 16),
                  Text(
                    'Update: ${r.resolutionNote}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CreateTenantRequestSheet extends ConsumerStatefulWidget {
  const _CreateTenantRequestSheet({required this.tenantId});
  final String tenantId;

  static Future<void> show(BuildContext context, String tenantId) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => _CreateTenantRequestSheet(tenantId: tenantId),
      );

  @override
  ConsumerState<_CreateTenantRequestSheet> createState() =>
      _CreateTenantRequestSheetState();
}

class _CreateTenantRequestSheetState
    extends ConsumerState<_CreateTenantRequestSheet> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  String _category = 'REPAIRS';
  String _priority = 'MEDIUM';
  Uint8List? _photo;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_title.text.trim().isEmpty || _description.text.trim().isEmpty) {
      setState(() => _error = 'Enter a short title and description.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final api = ref.read(tenantApiProvider);
    try {
      final photoIds = <String>[];
      if (_photo != null) {
        photoIds.add(await api.uploadPhoto(widget.tenantId, _photo!));
      }
      await api.createRequest(widget.tenantId, {
        'title': _title.text.trim(),
        'description': _description.text.trim(),
        'category': _category,
        'priority': _priority,
        if (photoIds.isNotEmpty) 'photoUploadIds': photoIds,
      });
      if (!mounted) return;
      ref.read(_tenantRequestsVersionProvider.notifier).state++;
      showMessage(context, 'Maintenance request submitted.');
      Navigator.of(context).pop();
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        4,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Report a maintenance issue',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _title,
              decoration: const InputDecoration(
                labelText: 'What needs fixing?',
                hintText: 'e.g. Leaking kitchen tap',
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _category,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Category'),
                    items: [
                      for (final e in expenseCategoryLabel.entries)
                        DropdownMenuItem(value: e.key, child: Text(e.value)),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => _category = v);
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _priority,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Priority'),
                    items: const [
                      DropdownMenuItem(value: 'LOW', child: Text('Low')),
                      DropdownMenuItem(value: 'MEDIUM', child: Text('Medium')),
                      DropdownMenuItem(value: 'HIGH', child: Text('High')),
                      DropdownMenuItem(value: 'URGENT', child: Text('Urgent')),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => _priority = v);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _description,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Details',
                hintText: 'Describe the issue and best time to visit.',
              ),
            ),
            const SizedBox(height: 12),
            PhotoField(
              label: 'Attach a photo (optional)',
              photo: _photo,
              onPick: () async {
                final p = await pickPhoto(context);
                if (p != null) setState(() => _photo = p);
              },
              onRemove: () => setState(() => _photo = null),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              ErrorBox(_error!),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _submit,
              child: Text(_saving ? 'Submitting…' : 'Submit request'),
            ),
          ],
        ),
      ),
    );
  }
}
