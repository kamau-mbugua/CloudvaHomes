import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/money.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import 'calendar_rules.dart';
import 'calendar_widgets.dart';
import 'host_api.dart';
import 'payment_sheet.dart';

String _todayIso() => DateTime.now().toIso8601String().substring(0, 10);

const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// One unit across a month: tap a day to see what is on it and act.
class UnitMonthScreen extends ConsumerStatefulWidget {
  const UnitMonthScreen({super.key, required this.unitId, this.month});

  final String unitId;

  /// "YYYY-MM"; defaults to this month.
  final String? month;

  @override
  ConsumerState<UnitMonthScreen> createState() => _UnitMonthScreenState();
}

typedef _MonthData = ({CalData cal, int? collectedCents});

class _UnitMonthScreenState extends ConsumerState<UnitMonthScreen> {
  late String _unitId = widget.unitId;
  late final String _today = _todayIso();
  late String _month = widget.month ?? _today.substring(0, 7);
  late String _selected = _defaultSelection(_month);
  int _refreshTick = 0;
  bool _busy = false;
  Future<_MonthData>? _future;
  String? _futureKey;

  String _defaultSelection(String month) =>
      _today.startsWith(month) ? _today : '$month-01';

  void _refresh() => setState(() => _refreshTick++);

  void _goMonth(String month) => setState(() {
    _month = month;
    _selected = _defaultSelection(month);
  });

  Future<_MonthData> _load(List<List<String>> weeks) async {
    final session = ref.read(sessionProvider).value;
    final api = ref.read(hostApiProvider);
    final cal = await api.calendar(
      from: weeks.first.first,
      to: addDays(weeks.last.last, 1),
      propertyId: session?.activePropertyId,
    );
    int? collected;
    if ((session?.can('reports:view') ?? false) &&
        (session?.can('stay-payments:view') ?? false)) {
      try {
        final last = addDays('${shiftMonth(_month, 1)}-01', -1);
        final report = await api.reportSummary(
          from: '$_month-01',
          to: last,
          propertyId: session?.activePropertyId,
        );
        for (final r in report.rows) {
          if (r.unitId == _unitId) {
            collected = r.receivedCents - r.refundedCents;
          }
        }
        collected ??= 0;
      } catch (_) {
        // The stat is a nicety; the calendar still works without it.
        collected = null;
      }
    }
    return (cal: cal, collectedCents: collected);
  }

  Future<void> _switchUnit() async {
    final picked = await context.push<String>('/host/calendar/units');
    if (!mounted || picked == null) return;
    if (picked.isEmpty) {
      context.pop();
    } else {
      setState(() => _unitId = picked);
    }
  }

  Future<void> _run(Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) {
        showMessage(context, done);
        _refresh();
      }
    } catch (e) {
      if (mounted) showMessage(context, messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _act(DayAction a, DayInfo info, CalUnit unit) async {
    final api = ref.read(hostApiProvider);
    final item = info.item;
    switch (a) {
      case DayAction.newBooking:
        await context.push(
          '/host/bookings/new?listingId=${unit.listingId ?? ''}&checkIn=$_selected',
        );
        if (mounted) _refresh();
      case DayAction.block:
        await _run(
          () => api.createBlock(
            unitId: unit.id,
            fromDate: _selected,
            toDate: addDays(_selected, 1),
            reason: 'Host block',
          ),
          'Date blocked.',
        );
      case DayAction.unblock:
        await _run(() => api.deleteBlock(item!.id), 'Dates unblocked.');
      case DayAction.checkIn:
        await _run(
          () => api.bookingAction(item!.id, 'check-in'),
          'Guest checked in.',
        );
      case DayAction.checkOut:
        await _run(
          () => api.bookingAction(item!.id, 'check-out'),
          'Guest checked out.',
        );
      case DayAction.mpesa:
        setState(() => _busy = true);
        try {
          final booking = await api.booking(item!.id);
          if (!mounted) return;
          await showHostMpesaPromptSheet(
            context,
            ref,
            booking: booking,
            onPaid: _refresh,
          );
        } catch (e) {
          if (mounted) showMessage(context, messageOf(e));
        } finally {
          if (mounted) setState(() => _busy = false);
        }
      case DayAction.openBooking:
        await context.push('/host/bookings/${item!.id}');
        if (mounted) _refresh();
    }
  }

  bool _allowed(DayAction a) {
    final s = ref.read(sessionProvider).value;
    bool can(String p) => s?.can(p) ?? false;
    return switch (a) {
      DayAction.newBooking || DayAction.block => can('bookings:create'),
      DayAction.unblock ||
      DayAction.checkIn ||
      DayAction.checkOut => can('bookings:update'),
      DayAction.mpesa => can('stay-payments:create'),
      DayAction.openBooking => true,
    };
  }

  @override
  Widget build(BuildContext context) {
    final weeks = monthWeeks(_month);
    // Fetch again only when the month, unit or refresh changes, not on every tap.
    final key = '$_month-$_unitId-$_refreshTick';
    if (key != _futureKey) {
      _futureKey = key;
      _future = _load(weeks);
    }
    return FutureBuilder<_MonthData>(
      future: _future,
      builder: (context, snap) {
        final data = snap.data;
        CalUnit? unit;
        for (final u in data?.cal.units ?? const <CalUnit>[]) {
          if (u.id == _unitId) unit = u;
        }
        return Scaffold(
          appBar: KodiHubAppBar(
            title: InkWell(
              onTap: _switchUnit,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          unit?.title ?? 'Unit',
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const Icon(Icons.expand_more, size: 18),
                    ],
                  ),
                  if (unit != null)
                    Text(
                      '${unit.propertyName} · Unit ${unit.number} · tap to switch',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFFC9D6E5),
                      ),
                    ),
                ],
              ),
            ),
            loading: _busy,
          ),
          body: switch (snap) {
            AsyncSnapshot(connectionState: ConnectionState.waiting) =>
              const Center(child: CircularProgressIndicator()),
            AsyncSnapshot(:final error?) => ErrorState(
              message: messageOf(error),
              onRetry: _refresh,
            ),
            _ =>
              unit == null
                  ? const EmptyState(
                      icon: Icons.search_off,
                      title: 'Unit not found',
                      body:
                          'This unit has no listing, or it is outside the property you are viewing.',
                    )
                  : _body(context, data!, unit, weeks),
          },
        );
      },
    );
  }

  Widget _body(
    BuildContext context,
    _MonthData data,
    CalUnit unit,
    List<List<String>> weeks,
  ) {
    final items = data.cal.itemsFor(unit.id);
    final stats = monthStats(_month, items, _today);
    final info = dayInfo(_selected, items, unit, _today);
    final actions = info.actions.where(_allowed).toList();

    return RefreshIndicator(
      onRefresh: () async => _refresh(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 14, 12, 24),
        children: [
          Row(
            children: [
              PageArrow(
                icon: Icons.chevron_left,
                tooltip: 'Previous month',
                onTap: () => _goMonth(shiftMonth(_month, -1)),
              ),
              Expanded(
                child: Text(
                  monthTitle(_month),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              PageArrow(
                icon: Icons.chevron_right,
                tooltip: 'Next month',
                onTap: () => _goMonth(shiftMonth(_month, 1)),
              ),
              const SizedBox(width: 4),
              TodayButton(onTap: () => _goMonth(_today.substring(0, 7))),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _Stat('Nights booked', '${stats.booked} of ${stats.days}'),
              const SizedBox(width: 8),
              _Stat('Occupancy', '${(stats.occupancy * 100).round()}%'),
              if (data.collectedCents != null) ...[
                const SizedBox(width: 8),
                _Stat('Collected', formatKes(data.collectedCents!)),
              ],
            ],
          ),
          const SizedBox(height: 14),
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(6, 10, 6, 10),
              child: Column(
                children: [
                  Row(
                    children: [
                      for (final w in _weekdays)
                        Expanded(
                          child: Text(
                            w,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: HodiColors.inkMuted,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  for (final week in weeks)
                    _WeekRow(
                      days: week,
                      month: _month,
                      today: _today,
                      selected: _selected,
                      spans: rowSpans(week, items, _today),
                      onPick: (d) => setState(() => _selected = d),
                    ),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(8, 8, 8, 2),
                    child: SpanLegend(
                      kinds: [
                        SpanKind.past,
                        SpanKind.checkedIn,
                        SpanKind.confirmed,
                        SpanKind.blocked,
                      ],
                      showToday: true,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Semantics(
            liveRegion: true,
            child: Card(
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            info.title,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        _InfoPill(label: info.pill, tone: info.tone),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      info.text,
                      style: const TextStyle(fontSize: 14, height: 1.45),
                    ),
                    if (actions.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (var i = 0; i < actions.length; i++)
                            i == 0
                                ? FilledButton(
                                    onPressed: _busy
                                        ? null
                                        : () => _act(actions[i], info, unit),
                                    child: Text(_actionLabel(actions[i])),
                                  )
                                : OutlinedButton(
                                    onPressed: _busy
                                        ? null
                                        : () => _act(actions[i], info, unit),
                                    child: Text(_actionLabel(actions[i])),
                                  ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String _actionLabel(DayAction a) => switch (a) {
  DayAction.newBooking => 'New booking',
  DayAction.block => 'Block this date',
  DayAction.unblock => 'Unblock',
  DayAction.openBooking => 'Open booking',
  DayAction.checkIn => 'Check in',
  DayAction.checkOut => 'Check out',
  DayAction.mpesa => 'Send M-Pesa prompt',
};

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border.all(color: const Color(0xFFE3E8EF)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: HodiColors.inkMuted),
          ),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    ),
  );
}

class _InfoPill extends StatelessWidget {
  const _InfoPill({required this.label, required this.tone});

  final String label;
  final String tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      'ok' => (const Color(0xFFEEF6DA), const Color(0xFF3F5A0C)),
      'bad' => (const Color(0xFFFDECEA), const Color(0xFFB42318)),
      'info' => (const Color(0xFFEFF5FC), const Color(0xFF1D4F8C)),
      'grey' => (const Color(0xFFE3E8EF), const Color(0xFF33465F)),
      _ => (const Color(0xFFEEF2F7), HodiColors.navy),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _WeekRow extends StatelessWidget {
  const _WeekRow({
    required this.days,
    required this.month,
    required this.today,
    required this.selected,
    required this.spans,
    required this.onPick,
  });

  final List<String> days;
  final String month;
  final String today;
  final String selected;
  final List<CalSpan> spans;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 4),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Color(0xFFF1F4F8))),
      ),
      child: Column(
        children: [
          Row(
            children: [
              for (final d in days)
                Expanded(child: Center(child: _dayButton(d, cs))),
            ],
          ),
          const SizedBox(height: 2),
          ExcludeSemantics(child: SpanRow(spans: spans, height: 24)),
        ],
      ),
    );
  }

  Widget _dayButton(String d, ColorScheme cs) {
    final inMonth = d.startsWith(month);
    final isSel = inMonth && d == selected;
    final isToday = d == today;
    final day = int.parse(d.substring(8));
    final fg = isSel
        ? Colors.white
        : !inMonth
        ? const Color(0xFFB8C2CE)
        : d.compareTo(today) < 0
        ? const Color(0xFF7A8BA0)
        : cs.onSurface;
    return Semantics(
      button: inMonth,
      selected: isSel,
      label: longDateLabel(d),
      excludeSemantics: true,
      child: InkResponse(
        key: ValueKey('day-$d'),
        onTap: inMonth ? () => onPick(d) : null,
        radius: 22,
        child: Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isSel ? HodiColors.navy : null,
            shape: BoxShape.circle,
            border: isToday && !isSel
                ? Border.all(color: HodiColors.lime, width: 2)
                : null,
          ),
          child: Text(
            '$day',
            style: TextStyle(
              fontSize: 15,
              fontWeight: isToday || isSel ? FontWeight.w700 : FontWeight.w500,
              color: fg,
            ),
          ),
        ),
      ),
    );
  }
}

/// "2026-11-21" → "21 November" for screen readers.
String longDateLabel(String iso) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June', //
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  final p = iso.split('-').map(int.parse).toList();
  return '${p[2]} ${months[p[1] - 1]}';
}
