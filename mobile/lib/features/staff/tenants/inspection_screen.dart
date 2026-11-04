import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_error.dart';
import '../../../core/widgets/common.dart';
import '../inspections.dart';
import '../more/photo.dart';
import '../staff_api.dart';
import '../staff_widgets.dart';

final _inspectionsProvider = FutureProvider.autoDispose
    .family<List<Inspection>, String>(
      (ref, tenancyId) => ref.watch(staffApiProvider).inspections(tenancyId),
    );

/// A move-in or move-out inspection on the phone (phase 13): the same checklist as the web
/// — condition, note and up to 6 camera photos per area. A move-out shows the move-in
/// condition under each area and highlights anything worse.
class InspectionScreen extends ConsumerWidget {
  const InspectionScreen({
    super.key,
    required this.tenancyId,
    required this.kind,
    required this.title,
  });
  final String tenancyId;
  final String kind; // MOVE_IN | MOVE_OUT
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(_inspectionsProvider(tenancyId));
    return Scaffold(
      appBar: AppBar(
        title: Text(
          kind == 'MOVE_IN' ? 'Move-in inspection' : 'Move-out inspection',
        ),
      ),
      body: list.when(
        loading: () => const KodiHubSkeletonList(rows: 4),
        error: (e, _) => Center(child: Text(staffErrorMessage(e))),
        data: (all) {
          Inspection? find(String k) {
            for (final i in all) {
              if (i.kind == k) return i;
            }
            return null;
          }

          return _InspectionForm(
            key: ValueKey(find(kind)?.id ?? 'new'),
            tenancyId: tenancyId,
            kind: kind,
            title: title,
            saved: find(kind),
            moveIn: kind == 'MOVE_OUT' ? find('MOVE_IN') : null,
          );
        },
      ),
    );
  }
}

class _InspectionForm extends ConsumerStatefulWidget {
  const _InspectionForm({
    super.key,
    required this.tenancyId,
    required this.kind,
    required this.title,
    this.saved,
    this.moveIn,
  });
  final String tenancyId;
  final String kind;
  final String title;
  final Inspection? saved;
  final Inspection? moveIn;

  @override
  ConsumerState<_InspectionForm> createState() => _InspectionFormState();
}

class _InspectionFormState extends ConsumerState<_InspectionForm> {
  late List<InspectionItem> _items;
  late final TextEditingController _notes;
  final Map<String, Uint8List> _newPhotos =
      {}; // upload id → bytes, for thumbnails
  bool _reopen = false;
  bool _saving = false;
  int? _uploading;
  String? _error;

  @override
  void initState() {
    super.initState();
    final saved = widget.saved;
    final areas =
        widget.moveIn?.items.map((i) => i.area).toList() ?? defaultAreas;
    _items = saved != null
        ? [
            for (final i in saved.items)
              InspectionItem(
                area: i.area,
                condition: i.condition,
                note: i.note,
                photoUploadIds: [...i.photoUploadIds],
              ),
          ]
        : [for (final a in areas) InspectionItem(area: a, condition: 'GOOD')];
    _notes = TextEditingController(text: saved?.notes ?? '');
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  bool get _acknowledged => widget.saved?.tenantAcknowledgedAt != null;
  bool get _locked =>
      !can(ref, 'tenancies:update') || (_acknowledged && !_reopen);

  Future<void> _addPhoto(int index) async {
    final bytes = await pickPhoto(context);
    if (bytes == null) return;
    setState(() => _uploading = index);
    try {
      final id = await ref
          .read(staffApiProvider)
          .upload('INSPECTION_PHOTO', bytes);
      setState(() {
        _items[index].photoUploadIds.add(id);
        _newPhotos[id] = bytes;
      });
    } on ApiError catch (e) {
      setState(() => _error = staffErrorMessage(e));
    } finally {
      if (mounted) setState(() => _uploading = null);
    }
  }

  Future<void> _save() async {
    final problem = validateInspection(_items);
    if (problem != null) {
      setState(() => _error = '$problem.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      await ref.read(staffApiProvider).saveInspection(
        widget.tenancyId,
        widget.kind,
        {
          'inspectedOn': widget.saved?.inspectedOn ?? today,
          'items': [for (final i in _items) i.toJson()],
          if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
          if (_reopen) 'reopen': true,
        },
      );
      if (!mounted) return;
      ref.invalidate(_inspectionsProvider(widget.tenancyId));
      showMessage(context, 'Inspection saved.');
      Navigator.of(context).pop();
    } on ApiError catch (e) {
      setState(() => _error = staffErrorMessage(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final before = {
      for (final i in widget.moveIn?.items ?? <InspectionItem>[])
        i.area.trim().toLowerCase(): i.condition,
    };
    final worse = {
      for (final r in compareItems(widget.moveIn?.items ?? [], _items))
        if (r.worse) r.area.trim().toLowerCase(),
    };
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(widget.title, style: Theme.of(context).textTheme.titleMedium),
        if (_acknowledged) ...[
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('The tenant has acknowledged this inspection.'),
                  if (can(ref, 'tenancies:update'))
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _reopen,
                      onChanged: (v) => setState(() => _reopen = v ?? false),
                      title: const Text('Reopen to make changes'),
                    ),
                ],
              ),
            ),
          ),
        ],
        for (var index = 0; index < _items.length; index++)
          Card(
            key: ValueKey('area-$index'),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: worse.contains(_items[index].area.trim().toLowerCase())
                    ? Colors.orange
                    : scheme.outlineVariant,
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _items[index].area,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  if (before[_items[index].area.trim().toLowerCase()]
                      case final was?)
                    Text(
                      'At move-in: ${conditionLabel[was]}${worse.contains(_items[index].area.trim().toLowerCase()) ? ' — worse now' : ''}',
                      style: TextStyle(
                        color: scheme.onSurfaceVariant,
                        fontSize: 12.5,
                      ),
                    ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    children: [
                      for (final c in conditions)
                        ChoiceChip(
                          label: Text(conditionLabel[c]!),
                          selected: _items[index].condition == c,
                          onSelected: _locked
                              ? null
                              : (_) =>
                                    setState(() => _items[index].condition = c),
                        ),
                    ],
                  ),
                  TextFormField(
                    initialValue: _items[index].note ?? '',
                    enabled: !_locked,
                    maxLength: 500,
                    decoration: const InputDecoration(
                      labelText: 'Note (optional)',
                      counterText: '',
                    ),
                    onChanged: (v) => _items[index].note = v,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      for (final id in _items[index].photoUploadIds)
                        _newPhotos[id] != null
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.memory(
                                  _newPhotos[id]!,
                                  width: 56,
                                  height: 56,
                                  fit: BoxFit.cover,
                                ),
                              )
                            : const Chip(
                                avatar: Icon(Icons.photo_outlined, size: 16),
                                label: Text('Saved photo'),
                              ),
                      if (!_locked &&
                          _items[index].photoUploadIds.length < maxPhotos)
                        OutlinedButton.icon(
                          icon: const Icon(
                            Icons.add_a_photo_outlined,
                            size: 18,
                          ),
                          label: Text(
                            _uploading == index ? 'Uploading…' : 'Add photo',
                          ),
                          onPressed: _uploading == null
                              ? () => _addPhoto(index)
                              : null,
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        TextField(
          controller: _notes,
          enabled: !_locked,
          maxLines: 3,
          maxLength: 2000,
          decoration: const InputDecoration(
            labelText: 'General notes (optional)',
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_error!, style: TextStyle(color: scheme.error)),
          ),
        if (!_locked)
          FilledButton(
            onPressed: _saving || _uploading != null ? null : _save,
            child: Text(_saving ? 'Saving…' : 'Save inspection'),
          ),
      ],
    );
  }
}
