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
import 'host_dashboard.dart' show plural, weekday;
import 'host_shell.dart';

String _todayIso() => DateTime.now().toIso8601String().substring(0, 10);

/// The Calendar tab: every unit across a week, grouped by property.
class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  late String _weekStart = _todayIso();
  String _filter = 'all';
  int _refreshTick = 0;
  Future<CalData>? _future;
  String? _futureKey;

  void _refresh() => setState(() => _refreshTick++);

  Future<void> _openPicker() async {
    final unitId = await context.push<String>('/host/calendar/units');
    if (!mounted || unitId == null || unitId.isEmpty) return;
    await _openUnit(unitId);
  }

  Future<void> _openUnit(String unitId) async {
    await context.push(
      '/host/calendar/unit/$unitId?month=${_weekStart.substring(0, 7)}',
    );
    if (mounted) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final propId = session?.activePropertyId;
    final canCreate = session?.can('bookings:create') ?? false;
    final today = _todayIso();
    final days = [for (var i = 0; i < 7; i++) addDays(_weekStart, i)];
    // Today's "free / arriving" counts need today in the range even when another week is shown.
    final from = today.compareTo(_weekStart) < 0 ? today : _weekStart;
    final weekEnd = addDays(_weekStart, 7);
    final to = addDays(today, 1).compareTo(weekEnd) > 0
        ? addDays(today, 1)
        : weekEnd;

    // Fetch again only when the range, property or refresh changes, not when a chip is tapped.
    final key = '$from-$to-$propId-$_refreshTick';
    if (key != _futureKey) {
      _futureKey = key;
      _future = ref
          .read(hostApiProvider)
          .calendar(from: from, to: to, propertyId: propId);
    }
    return FutureBuilder<CalData>(
      future: _future,
      builder: (context, snap) {
        final data = snap.data;
        final orgName = session?.activeOrganization?.name;
        return HostTabScaffold(
          title: 'Calendar',
          subtitle: data == null
              ? orgName
              : [?orgName, plural(data.units.length, 'unit')].join(' · '),
          actions: [
            if (canCreate)
              Padding(
                padding: const EdgeInsets.only(right: 4),
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: HodiColors.lime,
                    foregroundColor: HodiColors.navy,
                    minimumSize: const Size(0, 36),
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                  ),
                  onPressed: () async {
                    await context.push('/host/bookings/new');
                    if (mounted) _refresh();
                  },
                  child: const Text('+ Booking'),
                ),
              ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(56),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Material(
                color: Colors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _openPicker,
                  child: const SizedBox(
                    height: 44,
                    child: Row(
                      children: [
                        SizedBox(width: 14),
                        Icon(Icons.search, size: 18, color: Color(0xFFE6EDF5)),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Find a unit, listing or guest',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Color(0xFFE6EDF5),
                              fontSize: 14,
                            ),
                          ),
                        ),
                        SizedBox(width: 14),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          body: switch (snap) {
            AsyncSnapshot(connectionState: ConnectionState.waiting) =>
              const Center(child: CircularProgressIndicator()),
            AsyncSnapshot(:final error?) => ErrorState(
              message: messageOf(error),
              onRetry: _refresh,
            ),
            _ =>
              data!.units.isEmpty
                  ? const EmptyState(
                      icon: Icons.calendar_month_outlined,
                      title: 'No listings yet',
                      body:
                          'Create a listing to manage availability on the calendar.',
                    )
                  : _week(context, data, days, today),
          },
        );
      },
    );
  }

  Widget _week(
    BuildContext context,
    CalData data,
    List<String> days,
    String today,
  ) {
    bool isFree(CalUnit u) => freeTonight(data.itemsFor(u.id), today);
    bool isArriving(CalUnit u) => arrivingToday(data.itemsFor(u.id), today);
    final groups = data.groups(
      (u) => switch (_filter) {
        'free' => isFree(u),
        'arr' => isArriving(u),
        _ => true,
      },
    );
    final todayCol = days.indexOf(today);
    final cs = Theme.of(context).colorScheme;
    final chips = [
      ('all', 'All units ${data.units.length}'),
      ('free', 'Free tonight ${data.units.where(isFree).length}'),
      ('arr', 'Arriving today ${data.units.where(isArriving).length}'),
    ];

    return Column(
      children: [
        Container(
          color: cs.surface,
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: Column(
            children: [
              Row(
                children: [
                  PageArrow(
                    icon: Icons.chevron_left,
                    tooltip: 'Previous week',
                    onTap: () =>
                        setState(() => _weekStart = addDays(_weekStart, -7)),
                  ),
                  Expanded(
                    child: Text(
                      weekTitle(_weekStart),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  PageArrow(
                    icon: Icons.chevron_right,
                    tooltip: 'Next week',
                    onTap: () =>
                        setState(() => _weekStart = addDays(_weekStart, 7)),
                  ),
                  const SizedBox(width: 4),
                  TodayButton(
                    onTap: () => setState(() => _weekStart = _todayIso()),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final (key, label) in chips) ...[
                      CalChip(
                        label: label,
                        selected: _filter == key,
                        onTap: () => setState(() => _filter = key),
                      ),
                      const SizedBox(width: 6),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  const SizedBox(width: 96),
                  for (final d in days)
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        decoration: BoxDecoration(
                          color: d == today ? HodiColors.navy : null,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Column(
                          children: [
                            Text(
                              weekday(d),
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w500,
                                color: d == today ? Colors.white : null,
                              ),
                            ),
                            Text(
                              '${int.parse(d.substring(8))}',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: d == today ? Colors.white : null,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => _refresh(),
            child: ListView(
              children: [
                if (groups.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      _filter == 'free'
                          ? 'Every unit is taken tonight.'
                          : 'No one arrives today.',
                    ),
                  ),
                for (final g in groups) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
                    child: Text(
                      g.name.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.6,
                        color: HodiColors.inkMuted,
                      ),
                    ),
                  ),
                  for (final u in g.units)
                    _UnitWeekRow(
                      unit: u,
                      spans: rowSpans(days, data.itemsFor(u.id), today),
                      todayCol: todayCol < 0 ? null : todayCol,
                      onTap: () => _openUnit(u.id),
                    ),
                ],
                const Padding(
                  padding: EdgeInsets.all(12),
                  child: SpanLegend(
                    kinds: [
                      SpanKind.checkedIn,
                      SpanKind.confirmed,
                      SpanKind.request,
                      SpanKind.blocked,
                      SpanKind.overdue,
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _UnitWeekRow extends StatelessWidget {
  const _UnitWeekRow({
    required this.unit,
    required this.spans,
    required this.todayCol,
    required this.onTap,
  });

  final CalUnit unit;
  final List<CalSpan> spans;
  final int? todayCol;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      label:
          'Unit ${unit.number}, ${unit.title}, '
          '${spans.isEmpty ? 'free all week' : spans.map((s) => s.label).join(', ')}',
      child: Material(
        color: cs.surface,
        child: InkWell(
          onTap: onTap,
          child: Container(
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: Color(0xFFEEF1F5))),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            constraints: const BoxConstraints(minHeight: 48),
            child: Row(
              children: [
                SizedBox(
                  width: 96,
                  child: Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          unit.number,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            fontFamily: 'monospace',
                          ),
                        ),
                        Text(
                          unit.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            color: HodiColors.inkMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Expanded(
                  child: ExcludeSemantics(
                    child: SpanRow(
                      spans: spans,
                      height: 48,
                      barHeight: 30,
                      highlightColumn: todayCol,
                      highlightColor: const Color(0xFFF3F8E6),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
