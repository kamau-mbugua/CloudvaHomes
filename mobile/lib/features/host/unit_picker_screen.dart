import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import 'calendar_rules.dart';
import 'calendar_widgets.dart';
import 'host_api.dart';

/// How far ahead "next booking" looks.
const _lookAheadDays = 120;

String _todayIso() => DateTime.now().toIso8601String().substring(0, 10);

/// Search units by number, listing, property or guest. Pops with the chosen unit id, or with
/// an empty string for "All units, week view".
class UnitPickerScreen extends ConsumerStatefulWidget {
  const UnitPickerScreen({super.key});

  @override
  ConsumerState<UnitPickerScreen> createState() => _UnitPickerScreenState();
}

class _UnitPickerScreenState extends ConsumerState<UnitPickerScreen> {
  final _search = TextEditingController();
  String _filter = 'all';
  late final String _today = _todayIso();
  late final Future<CalData> _future;

  @override
  void initState() {
    super.initState();
    final propId = ref.read(sessionProvider).value?.activePropertyId;
    _future = ref
        .read(hostApiProvider)
        .calendar(
          from: _today,
          to: addDays(_today, _lookAheadDays),
          propertyId: propId,
        );
    _search.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: cs.surface,
        foregroundColor: cs.onSurface,
        title: const Text(
          'Choose a unit',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(112),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Column(
              children: [
                TextField(
                  controller: _search,
                  autofocus: true,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Unit number, listing, property or guest',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _search.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Clear search',
                            icon: const Icon(Icons.close),
                            onPressed: _search.clear,
                          ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(
                        color: HodiColors.navy,
                        width: 2,
                      ),
                    ),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final (key, label) in const [
                        ('all', 'All'),
                        ('free', 'Free tonight'),
                        ('busy', 'Occupied'),
                      ])
                        CalChip(
                          label: label,
                          selected: _filter == key,
                          onTap: () => setState(() => _filter = key),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: FutureBuilder<CalData>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorState(message: messageOf(snap.error!));
          }
          return _list(context, snap.data!);
        },
      ),
    );
  }

  Widget _list(BuildContext context, CalData data) {
    final needle = _search.text.trim().toLowerCase();
    final lines = {
      for (final u in data.units) u.id: unitLine(data.itemsFor(u.id), _today),
    };
    bool keep(CalUnit u) {
      final free = freeTonight(data.itemsFor(u.id), _today);
      if (_filter == 'free' && !free) return false;
      if (_filter == 'busy' && free) return false;
      if (needle.isEmpty) return true;
      final guests = data
          .itemsFor(u.id)
          .map((i) => i.guestName ?? '')
          .join(' ');
      return '${u.number} ${u.title} ${u.propertyName} ${lines[u.id]!.text} $guests'
          .toLowerCase()
          .contains(needle);
    }

    final groups = data.groups(keep);
    return ListView(
      padding: const EdgeInsets.only(bottom: 16),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Material(
            color: const Color(0xFFEEF6DA),
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => context.pop(''),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    const Icon(
                      Icons.view_week_outlined,
                      color: Color(0xFF3F5A0C),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Text(
                        'All units, week view',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF3F5A0C),
                        ),
                      ),
                    ),
                    Text(
                      '${data.units.length}',
                      style: const TextStyle(color: Color(0xFF3F5A0C)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (groups.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
            child: Text(
              needle.isEmpty
                  ? 'No unit matches this filter.'
                  : 'No unit matches “${_search.text.trim()}”. '
                        'Try a unit number such as ${data.units.first.number}, or part of a listing name.',
              style: const TextStyle(color: HodiColors.inkMuted),
            ),
          ),
        for (final g in groups) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
            child: Text(
              '${g.name.toUpperCase()} · ${g.units.length}',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.6,
                color: HodiColors.inkMuted,
              ),
            ),
          ),
          Card(
            margin: const EdgeInsets.symmetric(horizontal: 12),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (var i = 0; i < g.units.length; i++) ...[
                  if (i > 0) const Divider(height: 1),
                  _UnitTile(
                    unit: g.units[i],
                    line: lines[g.units[i].id]!,
                    onTap: () => context.pop(g.units[i].id),
                  ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _UnitTile extends StatelessWidget {
  const _UnitTile({
    required this.unit,
    required this.line,
    required this.onTap,
  });

  final CalUnit unit;
  final ({String text, String tone}) line;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dot = switch (line.tone) {
      'free' => HodiColors.lime,
      'late' => const Color(0xFFB42318),
      'block' => const Color(0xFF9AA8B8),
      _ => HodiColors.navy,
    };
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2F7),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  unit.number,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    fontFamily: 'monospace',
                    color: HodiColors.navy,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      unit.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: dot,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            line.text,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              color: HodiColors.inkMuted,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: HodiColors.inkMuted),
            ],
          ),
        ),
      ),
    );
  }
}
