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
import 'photo.dart';

/// Meter readings: pick a property, then a meter; enter this month's reading with a photo.
/// Readings go in with `PUT /meter-readings` for the month (Nairobi), photos first through
/// `POST /uploads` (purpose METER_PHOTO) and then by id.
class MetersScreen extends ConsumerStatefulWidget {
  const MetersScreen({super.key});
  @override
  ConsumerState<MetersScreen> createState() => _MetersScreenState();
}

class _MetersScreenState extends ConsumerState<MetersScreen> {
  String? _propertyId;

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
    final properties = ref.watch(propertiesProvider);
    return Scaffold(
      appBar: KodiHubAppBar(
        title: const Text('Meter readings'),
        subtitle: period,
      ),
      body: AsyncBody(
        value: properties,
        onRetry: () => ref.invalidate(propertiesProvider),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(title: 'No properties yet');
          }
          final propertyId =
              _propertyId ?? (list.length == 1 ? list.first.id : null);
          return Column(
            children: [
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
                    : _MeterList(propertyId: propertyId),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _MeterList extends ConsumerWidget {
  const _MeterList({required this.propertyId});
  final String propertyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final meters = ref.watch(metersProvider(propertyId));
    final canRead = can(ref, 'meters:create');
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(metersProvider(propertyId)),
      child: AsyncBody(
        value: meters,
        onRetry: () => ref.invalidate(metersProvider(propertyId)),
        data: (rows) {
          final active = rows.where((m) => m.status == 'ACTIVE').toList();
          if (active.isEmpty) {
            return ListView(
              children: const [
                EmptyState(
                  icon: Icons.speed_outlined,
                  title: 'No meters in this property',
                  body: 'Meters are added on the web app.',
                ),
              ],
            );
          }
          final period = nairobiPeriod();
          final readCount = active
              .where((m) => m.lastReading?.period == period)
              .length;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Kicker('${formatPeriod(period)} readings'),
                    StatusChip(
                      '$readCount of ${active.length} read',
                      tone: readCount == active.length ? Tone.good : Tone.warn,
                    ),
                  ],
                ),
              ),
              for (final m in active)
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

/// "123.4" style quantities: digits with up to 3 decimals, as the API takes them.
String? normaliseQuantity(String input) {
  final t = input.trim().replaceAll(',', '');
  return RegExp(r'^\d+(\.\d{1,3})?$').hasMatch(t) ? t : null;
}

/// Thousandths, to compare readings without doubles.
int milli(String quantity) {
  final parts = quantity.split('.');
  final frac = (parts.length > 1 ? parts[1] : '')
      .padRight(3, '0')
      .substring(0, 3);
  return int.parse(parts[0]) * 1000 + int.parse(frac);
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

  Future<void> _save(SheetRow? row) async {
    final current = normaliseQuantity(_current.text);
    final found = <String, String>{};
    if (current == null) {
      found['current'] = 'Enter the reading as a number, e.g. 1234.5.';
    } else if (row != null && row.reading == null) {
      final previous = normaliseQuantity(row.suggestedPrevious);
      if (previous != null && milli(current) < milli(previous)) {
        found['current'] = 'Must be at least the previous reading ($previous).';
      }
    }
    setState(() {
      _errors = found;
      _general = null;
    });
    if (found.isNotEmpty) return;
    setState(() => _saving = true);
    final api = ref.read(staffApiProvider);
    try {
      if (_photo != null && _photoUploadId == null) {
        try {
          _photoUploadId = await api.upload('METER_PHOTO', _photo!);
        } on ApiError catch (e) {
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
      );
      if (!mounted) return;
      ref.invalidate(sheetProvider(_sheetKey));
      ref.invalidate(metersProvider(widget.meter.propertyId));
      showMessage(context, 'Reading saved for ${formatPeriod(_period)}.');
      Navigator.of(context).pop();
    } on ApiError catch (e) {
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
    final sheet = ref.watch(sheetProvider(_sheetKey));
    SheetRow? row;
    for (final r in sheet.valueOrNull ?? const <SheetRow>[]) {
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
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
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
                  child: KodiHubSkeletonList(rows: 1, padding: EdgeInsets.zero),
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
                final p = await pickPhoto(context);
                if (p != null) {
                  setState(() {
                    _photo = p;
                    _photoUploadId = null;
                  });
                }
              },
              onRemove: () => setState(() {
                _photo = null;
                _photoUploadId = null;
              }),
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
            onRetry: () => ref.invalidate(sheetProvider(_sheetKey)),
            data: (rows) {
              final read = rows.where((r) => r.reading != null).toList();
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
    );
  }
}
