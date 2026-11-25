import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_error.dart';
import '../../../core/dates.dart';
import '../../../core/money.dart';
import '../../../core/widgets/common.dart';
import '../staff_api.dart';
import '../staff_models.dart';
import '../staff_widgets.dart';
import 'meter_ocr.dart';
import 'meters_data.dart';
import 'photo.dart';
import 'reading_checks.dart';
import 'reading_queue.dart';

export 'reading_checks.dart' show milli, normaliseQuantity;

/// Meter readings: pick a property, then a meter; enter this month's reading with a photo.
/// Readings go in with `PUT /meter-readings` for the month (Nairobi), photos first through
/// `POST /uploads` (purpose METER_PHOTO) and then by id.
class MetersScreen extends ConsumerStatefulWidget {
  const MetersScreen({super.key, this.initialPropertyId});
  final String? initialPropertyId;
  @override
  ConsumerState<MetersScreen> createState() => _MetersScreenState();
}

class _MetersScreenState extends ConsumerState<MetersScreen> {
  String? _propertyId;
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    _propertyId = widget.initialPropertyId;
    // Readings saved offline go up when this screen opens and when the app comes back.
    Future.microtask(() => flushPendingReadings(ref));
    _lifecycle = AppLifecycleListener(
      onResume: () => flushPendingReadings(ref),
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final period = formatPeriod(nairobiPeriod());
    if (!can(ref, 'meters:view')) {
      return Scaffold(
        appBar: KodiHubAppBar(
          title: const Text('Meter readings'),
          subtitle: period,
        ),
        body: const NoPermission('meters'),
      );
    }
    final properties = ref.watch(meterPropertiesProvider);
    return Scaffold(
      appBar: KodiHubAppBar(
        title: const Text('Meter readings'),
        subtitle: period,
      ),
      body: AsyncBody(
        value: properties,
        onRetry: () => ref.invalidate(meterPropertiesProvider),
        data: (cachedProps) {
          final list = cachedProps.value;
          if (list.isEmpty) {
            return Column(
              children: [
                if (cachedProps.savedAt != null)
                  _OfflineCacheBanner(savedAt: cachedProps.savedAt!),
                const Expanded(child: EmptyState(title: 'No properties yet')),
              ],
            );
          }
          final propertyId =
              _propertyId ?? (list.length == 1 ? list.first.id : null);
          return Column(
            children: [
              if (propertyId == null && cachedProps.savedAt != null)
                _OfflineCacheBanner(savedAt: cachedProps.savedAt!),
              const PendingReadingsBanner(),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: DropdownButtonFormField<String>(
                  key: const Key('meter-property'),
                  initialValue: propertyId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Property'),
                  items: [
                    for (final p in list)
                      DropdownMenuItem(value: p.id, child: Text(p.name)),
                  ],
                  onChanged: (v) => setState(() => _propertyId = v),
                ),
              ),
              Expanded(
                child: propertyId == null
                    ? const EmptyState(
                        icon: Icons.speed_outlined,
                        title: 'Choose a property',
                        body: 'Then pick the meter to read.',
                      )
                    : _MeterList(
                        propertyId: propertyId,
                        propertiesSavedAt: cachedProps.savedAt,
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _MeterList extends ConsumerStatefulWidget {
  const _MeterList({required this.propertyId, this.propertiesSavedAt});
  final String propertyId;
  final DateTime? propertiesSavedAt;

  @override
  ConsumerState<_MeterList> createState() => _MeterListState();
}

class _MeterListState extends ConsumerState<_MeterList> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final propertyId = widget.propertyId;
    final meters = ref.watch(meterListProvider(propertyId));
    final canRead = can(ref, 'meters:create');
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(meterPropertiesProvider);
        ref.invalidate(meterListProvider(propertyId));
        try {
          await Future.wait([
            ref.read(meterPropertiesProvider.future),
            ref.read(meterListProvider(propertyId).future),
          ]);
        } on Object {
          // Shown by AsyncBody below.
        }
      },
      child: AsyncBody(
        value: meters,
        onRetry: () => ref.invalidate(meterListProvider(propertyId)),
        data: (cachedMeters) {
          final bannerAt = oldestSavedAt([
            widget.propertiesSavedAt,
            cachedMeters.savedAt,
          ]);
          final rows = cachedMeters.value;
          final active = rows.where((m) => m.status == 'ACTIVE').toList();
          if (active.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                if (bannerAt != null) _OfflineCacheBanner(savedAt: bannerAt),
                const EmptyState(
                  icon: Icons.speed_outlined,
                  title: 'No meters in this property',
                  body: 'Meters are added on the web app.',
                ),
              ],
            );
          }
          final period = nairobiPeriod();
          final readMeters = active
              .where((m) => m.lastReading?.period == period)
              .toList();
          final pendingMeters = active
              .where((m) => m.lastReading?.period != period)
              .toList();
          final readCount = readMeters.length;
          final filtered = switch (_tab) {
            1 => pendingMeters,
            2 => readMeters,
            _ => active,
          };
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
            children: [
              if (bannerAt != null)
                _OfflineCacheBanner(
                  savedAt: bannerAt,
                  margin: const EdgeInsets.only(bottom: 10),
                ),
              KodiHubBatchProgress(
                title: '${formatPeriod(period)} readings',
                completed: readCount,
                total: active.length,
                subtitle: '$readCount of ${active.length} read',
              ),
              if (pendingMeters.isNotEmpty && canRead) ...[
                const SizedBox(height: 10),
                CurvedHeroCard(
                  kicker:
                      'UP NEXT · ${pendingMeters.length} REMAINING THIS MONTH',
                  trailing: StatusChip(
                    pendingMeters.first.chargeName,
                    tone: Tone.info,
                  ),
                  children: [
                    Row(
                      children: [
                        UnitBadge(
                          pendingMeters.first.unitNumber,
                          width: 48,
                          height: 44,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Unit ${pendingMeters.first.unitNumber} · ${pendingMeters.first.chargeName}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Meter ${pendingMeters.first.serialNo} · Last: ${pendingMeters.first.lastReading?.current ?? '0'} ${pendingMeters.first.unitLabel ?? ''}',
                                style: const TextStyle(
                                  color: Color(0xFFB8C6D9),
                                  fontSize: 12.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      icon: const Icon(Icons.speed_outlined, size: 18),
                      label: const Text('Enter reading & photo →'),
                      onPressed: () =>
                          Navigator.of(context, rootNavigator: true).push(
                            MaterialPageRoute<void>(
                              builder: (_) => ReadingScreen(
                                meter: pendingMeters.first,
                                canSave: canRead,
                              ),
                            ),
                          ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 12),
              KodiHubSegmentedTabs(
                tabs: [
                  'All (${active.length})',
                  'Pending (${pendingMeters.length})',
                  'Read ($readCount)',
                ],
                index: _tab,
                onChanged: (i) => setState(() => _tab = i),
              ),
              const SizedBox(height: 10),
              for (final m in filtered)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Card(
                    child: ListTile(
                      leading: UnitBadge(m.unitNumber),
                      title: Text(
                        '${m.unitNumber} · ${m.chargeName}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        'Meter ${m.serialNo} · '
                        '${m.lastReading == null ? 'no readings yet' : 'last ${m.lastReading!.current}${m.unitLabel != null ? ' ${m.unitLabel}' : ''} (${formatPeriod(m.lastReading!.period)})'}',
                      ),
                      trailing: m.lastReading?.period == period
                          ? const StatusChip('Read', tone: Tone.good)
                          : const StatusChip('Pending', tone: Tone.warn),
                      onTap: () =>
                          Navigator.of(context, rootNavigator: true).push(
                            MaterialPageRoute<void>(
                              builder: (_) =>
                                  ReadingScreen(meter: m, canSave: canRead),
                            ),
                          ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class ReadingScreen extends ConsumerStatefulWidget {
  const ReadingScreen({super.key, required this.meter, required this.canSave});
  final Meter meter;
  final bool canSave;
  @override
  ConsumerState<ReadingScreen> createState() => _ReadingScreenState();
}

class _ReadingScreenState extends ConsumerState<ReadingScreen> {
  final _current = TextEditingController();
  final _note = TextEditingController();
  final _period = nairobiPeriod();
  Uint8List? _photo;
  String? _photoUploadId;
  int _ocrRunId = 0;
  bool _ocrRunning = false;
  String? _ocrSuggestion;
  String? _usedOcrSuggestion;
  Map<String, String> _errors = {};
  String? _general;
  bool _saving = false;

  ({String propertyId, String chargeTypeId, String period}) get _sheetKey => (
    propertyId: widget.meter.propertyId,
    chargeTypeId: widget.meter.chargeTypeId,
    period: _period,
  );

  @override
  void dispose() {
    _current.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _runOcr(Uint8List photoBytes, int runId) async {
    final ocr = ref.read(meterOcrProvider);
    String? rawText;
    try {
      rawText = await Future<String?>.sync(
        () => ocr.readText(photoBytes),
      ).timeout(const Duration(seconds: 5));
    } on Object {
      rawText = null;
    }
    if (!mounted || runId != _ocrRunId || !identical(_photo, photoBytes)) {
      return;
    }
    String? suggestion;
    if (rawText != null) {
      final sheetRows =
          ref.read(readingSheetProvider(_sheetKey)).valueOrNull?.value ??
          const <SheetRow>[];
      SheetRow? row;
      for (final r in sheetRows) {
        if (r.meterId == widget.meter.id) row = r;
      }
      final previous = row == null
          ? null
          : (row.reading?.previous ?? row.suggestedPrevious);
      suggestion = suggestReading(
        rawText,
        previous: previous,
        serialNo: widget.meter.serialNo,
      );
    }
    setState(() {
      _ocrRunning = false;
      _ocrSuggestion = suggestion;
    });
  }

  /// No signal (a basement, a rooftop tank): keep the reading on the phone (phase 13).
  Future<void> _saveOffline(
    String current, {
    required bool ocrUsed,
    required bool ocrEdited,
  }) async {
    final owner = await currentQueueOwner(ref);
    final queue = await ref.read(readingQueueProvider.future);
    await queue.enqueue(
      PendingReading(
        meterId: widget.meter.id,
        propertyId: widget.meter.propertyId,
        period: _period,
        current: current,
        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
        savedAt: DateTime.now(),
        ocrUsed: ocrUsed,
        ocrEdited: ocrEdited,
        owner: owner,
      ),
      photo: _photo,
    );
    ref.invalidate(pendingReadingsProvider);
    if (!mounted) return;
    showMessage(
      context,
      'No connection — saved on this phone. It will upload when you’re back online.',
    );
    Navigator.of(context).pop();
  }

  Future<bool> _confirmUnusualUse({
    required String previous,
    required String current,
    required String averageUse,
  }) async {
    final label = widget.meter.unitLabel?.trim();
    final unit = (label == null || label.isEmpty) ? '' : ' $label';
    final used = formatMilli(milli(current) - milli(previous));
    final usual = trimQuantity(averageUse);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Check this reading'),
        content: Text(
          'This is $used$unit, more than 3 times the usual use '
          '(about $usual$unit). Check the meter before saving.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Save anyway'),
          ),
        ],
      ),
    );
    return confirmed == true;
  }

  Future<void> _save(SheetRow? row) async {
    final current = normaliseQuantity(_current.text);
    final previousText = row == null
        ? null
        : (row.reading?.previous ?? row.suggestedPrevious);
    final previous = previousText == null
        ? null
        : normaliseQuantity(previousText);
    final found = <String, String>{};
    if (current == null) {
      found['current'] = 'Enter the reading as a number, e.g. 1234.5.';
    } else if (previous != null && milli(current) < milli(previous)) {
      found['current'] = 'Must be at least the previous reading ($previous).';
    }
    setState(() {
      _errors = found;
      _general = null;
    });
    if (found.isNotEmpty) return;
    final ocrUsed = _photo != null && _usedOcrSuggestion != null;
    // Compare numbers, not text: "1234.50" retyped as "1234.5" is not an edit.
    final ocrEdited = ocrUsed && milli(current!) != milli(_usedOcrSuggestion!);
    if (row != null &&
        previous != null &&
        isUnusualUse(
          previous: previous,
          current: current!,
          averageUse: row.averageUse,
        )) {
      final goAhead = await _confirmUnusualUse(
        previous: previous,
        current: current,
        averageUse: row.averageUse!,
      );
      if (!goAhead || !mounted) return;
    }
    setState(() => _saving = true);
    final api = ref.read(staffApiProvider);
    try {
      if (_photo != null && _photoUploadId == null) {
        try {
          _photoUploadId = await api.upload('METER_PHOTO', _photo!);
        } on ApiError catch (e) {
          if (e.isNetworkError) {
            await _saveOffline(
              current!,
              ocrUsed: ocrUsed,
              ocrEdited: ocrEdited,
            );
            return;
          }
          if (mounted) {
            setState(() => _errors = {'photo': staffErrorMessage(e)});
          }
          return;
        }
      }
      await api.saveReading(
        period: _period,
        meterId: widget.meter.id,
        current: current!,
        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
        photoUploadId: _photoUploadId,
        ocrUsed: ocrUsed,
        ocrEdited: ocrEdited,
      );
      if (!mounted) return;
      ref.invalidate(readingSheetProvider(_sheetKey));
      ref.invalidate(meterListProvider(widget.meter.propertyId));
      ref.invalidate(metersProvider(widget.meter.propertyId));
      showMessage(context, 'Reading saved for ${formatPeriod(_period)}.');
      Navigator.of(context).pop();
    } on ApiError catch (e) {
      if (e.isNetworkError) {
        await _saveOffline(current!, ocrUsed: ocrUsed, ocrEdited: ocrEdited);
        return;
      }
      if (!mounted) return;
      final f = e.fieldErrors;
      final photoError = f['readings[0].photoUploadId'];
      if (photoError != null) _photoUploadId = null;
      setState(() {
        _errors = {
          if (f['readings[0].current'] != null)
            'current': f['readings[0].current']!,
          if (f['readings[0].note'] != null) 'note': f['readings[0].note']!,
          if (photoError != null) 'photo': staffErrorMessage(e),
        };
        _general = _errors.isEmpty ? staffErrorMessage(e) : null;
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.meter;
    final sheet = ref.watch(readingSheetProvider(_sheetKey));
    final cachedSheet = sheet.valueOrNull;
    SheetRow? row;
    for (final r in cachedSheet?.value ?? const <SheetRow>[]) {
      if (r.meterId == m.id) row = r;
    }
    final unit = m.unitLabel == null ? '' : ' ${m.unitLabel}';
    final existing = row?.reading;
    return Scaffold(
      appBar: KodiHubAppBar(
        title: Text('${m.unitNumber} · ${m.chargeName}'),
        subtitle: 'Meter ${m.serialNo}',
        loading: sheet.isLoading,
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(readingSheetProvider(_sheetKey));
          try {
            await ref.read(readingSheetProvider(_sheetKey).future);
          } on Object {
            // Shown by AsyncBody below.
          }
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            if (cachedSheet?.savedAt != null)
              _OfflineCacheBanner(
                savedAt: cachedSheet!.savedAt!,
                margin: const EdgeInsets.only(bottom: 12),
              ),
            SectionCard(
              title: 'Reading for ${formatPeriod(_period)}',
              trailing: existing != null
                  ? const StatusChip('Read', tone: Tone.good)
                  : const StatusChip('Pending', tone: Tone.warn),
              children: [
                FactRow('Meter', m.serialNo),
                if (sheet.isLoading && row == null)
                  const Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: KodiHubSkeletonList(
                      rows: 1,
                      padding: EdgeInsets.zero,
                    ),
                  ),
                if (row != null)
                  FactRow(
                    'Previous',
                    '${existing?.previous ?? row.suggestedPrevious}$unit',
                  ),
                if (existing != null) ...[
                  FactRow('Already entered', '${existing.current}$unit'),
                  FactRow('Used', '${existing.consumption}$unit'),
                  FactRow('Charge', formatKes(existing.amount)),
                  if (existing.readBy != null)
                    FactRow('Read by', existing.readBy!),
                ],
              ],
            ),
            const SizedBox(height: 12),
            if (existing?.billed == true)
              const ErrorBox(
                'This month’s reading is already on an invoice, so it can’t be changed.',
              )
            else if (!widget.canSave)
              const Text('Your role can see readings but not enter them.')
            else ...[
              TextField(
                key: const Key('reading-current'),
                controller: _current,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: existing == null
                      ? 'Current reading$unit'
                      : 'Corrected reading$unit',
                  errorText: _errors['current'],
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _note,
                maxLength: 300,
                decoration: InputDecoration(
                  labelText: 'Note (optional)',
                  errorText: _errors['note'],
                  counterText: '',
                ),
              ),
              const SizedBox(height: 12),
              PhotoField(
                label: 'Add a photo of the meter',
                photo: _photo,
                error: _errors['photo'],
                onPick: () async {
                  final pick = ref.read(meterPhotoPickerProvider);
                  final p = await pick(context);
                  if (p != null && mounted) {
                    final runId = ++_ocrRunId;
                    setState(() {
                      _photo = p;
                      _photoUploadId = null;
                      _ocrRunning = true;
                      _ocrSuggestion = null;
                      _usedOcrSuggestion = null;
                    });
                    unawaited(_runOcr(p, runId));
                  }
                },
                onRemove: () => setState(() {
                  _ocrRunId++;
                  _photo = null;
                  _photoUploadId = null;
                  _ocrRunning = false;
                  _ocrSuggestion = null;
                  _usedOcrSuggestion = null;
                }),
              ),
              if (_ocrRunning)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('Reading the photo…'),
                )
              else if (_ocrSuggestion != null)
                Padding(
                  key: const Key('ocr-suggestion'),
                  padding: const EdgeInsets.only(top: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Suggested from photo: $_ocrSuggestion$unit',
                        ),
                      ),
                      TextButton(
                        onPressed: () {
                          final picked = _ocrSuggestion!;
                          setState(() {
                            _current.text = picked;
                            _usedOcrSuggestion = picked;
                            _ocrSuggestion = null;
                            _errors.remove('current');
                          });
                        },
                        child: const Text('Use'),
                      ),
                      TextButton(
                        onPressed: () => setState(() => _ocrSuggestion = null),
                        child: const Text('Ignore'),
                      ),
                    ],
                  ),
                ),
              if (_general != null) ...[
                const SizedBox(height: 12),
                ErrorBox(_general!),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _saving ? null : () => _save(row),
                child: KodiHubButtonChild(
                  loading: _saving,
                  label: 'Save reading',
                  loadingLabel: 'Saving…',
                  tone: SpinnerTone.navy,
                ),
              ),
            ],
            const SizedBox(height: 24),
            Text(
              'This month in this property',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            AsyncBody(
              value: sheet,
              onRetry: () => ref.invalidate(readingSheetProvider(_sheetKey)),
              data: (cachedRows) {
                final read = cachedRows.value
                    .where((r) => r.reading != null)
                    .toList();
                if (read.isEmpty) {
                  return const EmptyState(title: 'No readings yet this month');
                }
                return Column(
                  children: [
                    for (final r in read)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          '${r.unitNumber} · ${r.reading!.current}$unit',
                        ),
                        subtitle: Text(
                          'Used ${r.reading!.consumption}$unit${r.reading!.readBy != null ? ' · ${r.reading!.readBy}' : ''}',
                        ),
                        trailing: r.reading!.hasPhoto
                            ? const Icon(
                                Icons.photo_outlined,
                                semanticLabel: 'Has a photo',
                              )
                            : null,
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _OfflineCacheBanner extends StatelessWidget {
  const _OfflineCacheBanner({required this.savedAt, this.margin});
  final DateTime savedAt;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      key: const Key('meter-offline-banner'),
      margin: margin ?? const EdgeInsets.fromLTRB(16, 12, 16, 0),
      color: scheme.tertiaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(Icons.cloud_off_outlined, color: scheme.onTertiaryContainer),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Offline — showing data from '
                '${formatTimestamp(savedAt.toIso8601String())}',
                style: TextStyle(color: scheme.onTertiaryContainer),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Readings waiting on this phone (phase 13).
final pendingReadingsProvider = FutureProvider<List<PendingReading>>((
  ref,
) async {
  final owner = ref.watch(queueOwnerProvider);
  if (owner == null) return const [];
  final queue = await ref.watch(readingQueueProvider.future);
  return queue.pendingFor(owner);
});

/// Sends readings saved offline; quietly does nothing without a connection.
Future<FlushResult?> flushPendingReadings(WidgetRef ref) async {
  try {
    final owner = await currentQueueOwner(ref);
    if (owner == null) return null;
    final queue = await ref.read(readingQueueProvider.future);
    if ((await queue.pendingFor(owner)).isEmpty) return null;
    final api = ref.read(staffApiProvider);
    final result = await queue.flush(
      owner: owner,
      uploadPhoto: (jpeg) => api.upload('METER_PHOTO', jpeg),
      save: (r, photoId) => api.saveReading(
        period: r.period,
        meterId: r.meterId,
        current: r.current,
        note: r.note,
        photoUploadId: photoId,
        ocrUsed: r.ocrUsed,
        ocrEdited: r.ocrEdited,
      ),
    );
    ref.invalidate(pendingReadingsProvider);
    if (result.sent > 0) {
      ref.invalidate(readingSheetProvider);
      ref.invalidate(meterListProvider);
      ref.invalidate(metersProvider);
    }
    return result;
  } catch (_) {
    return null;
  }
}

class PendingReadingsBanner extends ConsumerStatefulWidget {
  const PendingReadingsBanner({super.key});
  @override
  ConsumerState<PendingReadingsBanner> createState() =>
      _PendingReadingsBannerState();
}

class _PendingReadingsBannerState extends ConsumerState<PendingReadingsBanner> {
  bool _busy = false;

  Future<void> _upload() async {
    setState(() => _busy = true);
    final r = await flushPendingReadings(ref);
    if (!mounted) return;
    setState(() => _busy = false);
    if (r == null) return;
    showMessage(
      context,
      r.remaining == 0
          ? 'All readings uploaded.'
          : r.sent == 0 && r.failed == 0
          ? 'Still no connection. They’ll upload later.'
          : '${r.sent} uploaded, ${r.remaining} still waiting.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final pending =
        ref.watch(pendingReadingsProvider).value ?? const <PendingReading>[];
    if (pending.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final refused = pending.where((r) => r.lastError != null).toList();
    return Card(
      key: const Key('pending-readings'),
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      color: scheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.cloud_upload_outlined),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${pending.length} ${pending.length == 1 ? 'reading' : 'readings'} waiting to upload',
                  ),
                ),
                TextButton(
                  onPressed: _busy ? null : _upload,
                  child: Text(_busy ? 'Uploading…' : 'Upload now'),
                ),
              ],
            ),
            for (final r in refused)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text('Reading ${r.current} (${r.period})'),
                subtitle: Text(
                  r.lastError!,
                  style: TextStyle(color: scheme.error),
                ),
                trailing: TextButton(
                  onPressed: () async {
                    final queue = await ref.read(readingQueueProvider.future);
                    await queue.remove(r.meterId, r.period);
                    ref.invalidate(pendingReadingsProvider);
                  },
                  child: const Text('Discard'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
