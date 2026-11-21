import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/money.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import 'host_api.dart';
import 'host_dashboard.dart';
import 'host_shell.dart';

/// Pill and tile colours from the host dashboard design: (background, foreground).
const _tones = <String, (Color, Color)>{
  'ok': (Color(0xFFEEF6DA), Color(0xFF3F5A0C)),
  'due': (Color(0xFFFFF1E6), Color(0xFF9A3412)),
  'warn': (Color(0xFFFFF4E0), Color(0xFF8A4B00)),
  'bad': (Color(0xFFFDECEA), Color(0xFFB42318)),
  'red': (Color(0xFFFDECEA), Color(0xFFB42318)),
  'amber': (Color(0xFFFFF4E0), Color(0xFF8A4B00)),
  'blue': (Color(0xFFEFF5FC), Color(0xFF1D4F8C)),
  'plain': (Color(0xFFEEF2F7), HodiColors.navy),
  'arrive': (Color(0xFFEEF6DA), Color(0xFF3F5A0C)),
  'late': (Color(0xFFFDECEA), Color(0xFFB42318)),
};

(Color, Color) _tone(String t) => _tones[t] ?? _tones['plain']!;

class TodayScreen extends ConsumerStatefulWidget {
  const TodayScreen({super.key});

  @override
  ConsumerState<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends ConsumerState<TodayScreen> {
  int _refreshTick = 0;
  Future<HostDashboard>? _future;
  String? _futureKey;
  String _tab = 'arriving';
  bool _tabPicked = false;
  String? _busyId;

  void _refresh() => setState(() => _refreshTick++);

  Future<void> _act(String bookingId, String action) async {
    setState(() => _busyId = bookingId);
    try {
      await ref.read(hostApiProvider).bookingAction(bookingId, action);
      if (mounted) {
        showMessage(context, switch (action) {
          'check-in' => 'Guest checked in.',
          'check-out' => 'Guest checked out.',
          _ => 'Marked as no-show.',
        });
        _refresh();
      }
    } catch (e) {
      if (mounted) showMessage(context, messageOf(e));
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _needAction(String bookingId, String action) async {
    switch (action) {
      case 'check-out':
      case 'no-show':
        await _act(bookingId, action);
      case 'open-cleaning':
        await context.push('/host/cleaning');
        if (mounted) _refresh();
      default:
        await _openBooking(bookingId);
    }
  }

  Future<void> _openBooking(String id) async {
    await context.push('/host/bookings/$id');
    if (mounted) _refresh();
  }

  Future<void> _pickBalance(HostDashboard d) async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: d.balances.isEmpty
            ? const Padding(
                padding: EdgeInsets.fromLTRB(24, 0, 24, 24),
                child: Text(
                  'No guest owes you anything that is due. '
                  'Open a booking from Bookings to record a payment.',
                ),
              )
            : ListView(
                shrinkWrap: true,
                children: [
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: Text(
                      'Who is paying?',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  for (final b in d.balances)
                    ListTile(
                      title: Text('${b.guestName ?? 'Guest'} · ${b.code}'),
                      subtitle: Text(
                        '${b.unitTitle} · ${stayRange(b.checkIn, b.checkOut)}',
                      ),
                      trailing: Text(
                        formatKes(b.owedCents ?? 0),
                        style: const TextStyle(
                          color: Color(0xFF9A3412),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      onTap: () => Navigator.of(ctx).pop(b.id),
                    ),
                ],
              ),
      ),
    );
    if (picked != null && mounted) await _openBooking(picked);
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final propId = session?.activePropertyId;

    // Fetch again only when the property or refresh changes, not when a tab is picked.
    final key = '$propId-$_refreshTick';
    if (key != _futureKey) {
      _futureKey = key;
      _future = ref.read(hostApiProvider).dashboard(propertyId: propId);
    }
    return HostTabScaffold(
      title: 'Today',
      body: FutureBuilder<HostDashboard>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorState(
              message: messageOf(snap.error!),
              onRetry: _refresh,
            );
          }
          final d = snap.data!;
          bool can(String permission) => session?.can(permission) ?? false;
          if (d.units == 0) {
            return const EmptyState(
              icon: Icons.house_outlined,
              title: 'No listings yet',
              body:
                  'Add a listing to see your arrivals, departures and occupancy here.',
            );
          }
          final tab = _tabPicked
              ? _tab
              : d.arriving.isEmpty && d.staying.any((r) => r.stage == 'OVERDUE')
              ? 'staying'
              : 'arriving';
          final rows = switch (tab) {
            'leaving' => d.leaving,
            'staying' => d.staying,
            _ => d.arriving,
          };

          return RefreshIndicator(
            onRefresh: () async => _refresh(),
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                _Summary(d: d, firstName: session?.user.firstName ?? ''),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _QuickActions(
                        actions: [
                          if (can('bookings:create'))
                            _Quick(
                              label: 'New booking',
                              icon: Icons.add,
                              bg: HodiColors.navy,
                              fg: Colors.white,
                              onTap: () async {
                                await context.push('/host/bookings/new');
                                if (mounted) _refresh();
                              },
                            ),
                          if (d.money != null && can('stay-payments:create'))
                            _Quick(
                              label: 'Record payment',
                              icon: Icons.payments_outlined,
                              bg: _tone('ok').$1,
                              fg: _tone('ok').$2,
                              onTap: () => _pickBalance(d),
                            ),
                          if (can('bookings:create'))
                            _Quick(
                              label: 'Block dates',
                              icon: Icons.event_busy_outlined,
                              bg: _tone('plain').$1,
                              fg: _tone('plain').$2,
                              onTap: () => context.go('/host/calendar'),
                            ),
                          if (d.toClean != null)
                            _Quick(
                              label: 'Cleaning',
                              icon: Icons.cleaning_services_outlined,
                              bg: _tone('warn').$1,
                              fg: _tone('warn').$2,
                              onTap: () async {
                                await context.push('/host/cleaning');
                                if (mounted) _refresh();
                              },
                            ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      _SectionTitle(
                        'Needs you',
                        badge: d.needs.isEmpty ? null : '${d.needs.length}',
                      ),
                      const SizedBox(height: 10),
                      if (d.needs.isEmpty)
                        const Text('Nothing needs you right now.')
                      else
                        for (final n in d.needs)
                          _NeedCard(
                            need: n,
                            busy: _busyId == n.booking.id,
                            canUpdate: can('bookings:update'),
                            onAction: (action) =>
                                _needAction(n.booking.id, action),
                          ),
                      const SizedBox(height: 24),
                      const _SectionTitle('Today'),
                      const SizedBox(height: 12),
                      _Tabs(
                        selected: tab,
                        counts: {
                          'arriving': d.arriving.length,
                          'leaving': d.leaving.length,
                          'staying': d.staying.length,
                        },
                        onPick: (t) => setState(() {
                          _tab = t;
                          _tabPicked = true;
                        }),
                      ),
                      const SizedBox(height: 12),
                      if (rows.isEmpty)
                        Text(switch (tab) {
                          'leaving' => 'No one leaves today.',
                          'staying' => 'No guests are staying right now.',
                          _ => 'No one arrives today.',
                        })
                      else
                        for (final r in rows)
                          _StayCard(row: r, onTap: () => _openBooking(r.id)),
                      const SizedBox(height: 24),
                      _NightsCard(d: d),
                      const SizedBox(height: 16),
                      _UnitsCard(d: d),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.d, required this.firstName});

  final HostDashboard d;
  final String firstName;

  @override
  Widget build(BuildContext context) {
    const soft = Color(0xFFC9D6E5);
    final money = d.money;
    final monthPct = (d.occupancyMonth * 100).round();
    final hour = DateTime.now().hour;
    final stats = <(String, String, Color?)>[
      if (money != null) ...[
        (
          'Collected ${monthShort(d.today)}',
          formatKes(money.collectedThisMonthCents),
          null,
        ),
        (
          'Still owed',
          formatKes(money.owedCents),
          money.owedCents > 0 ? const Color(0xFFFFC58A) : null,
        ),
      ] else ...[
        ('Arriving today', '${d.arriving.length}', null),
        ('Leaving today', '${d.leaving.length}', null),
      ],
      ('This month', '$monthPct% full', null),
      if (d.toClean != null)
        ('To clean', plural(d.toClean!, 'unit'), null)
      else
        ('Staying', '${d.staying.length}', null),
    ];

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
      decoration: const BoxDecoration(
        color: HodiColors.navy,
        border: Border(bottom: BorderSide(color: HodiColors.lime, width: 4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            longDate(d.today),
            style: const TextStyle(color: soft, fontSize: 13),
          ),
          const SizedBox(height: 4),
          Text(
            firstName.isEmpty
                ? greeting(hour)
                : '${greeting(hour)}, $firstName',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 26,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.07),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                Semantics(
                  label:
                      '${d.occupiedTonight} of ${d.units} units occupied tonight',
                  child: SizedBox(
                    width: 84,
                    height: 84,
                    child: CustomPaint(
                      painter: _RingPainter(
                        d.units == 0 ? 0 : d.occupiedTonight / d.units,
                      ),
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '${d.occupiedTonight}/${d.units}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.w600,
                                height: 1,
                              ),
                            ),
                            const Text(
                              'tonight',
                              style: TextStyle(color: soft, fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Wrap(
                    runSpacing: 12,
                    children: [
                      for (final s in stats)
                        FractionallySizedBox(
                          widthFactor: 0.5,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                s.$1,
                                style: const TextStyle(
                                  color: soft,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(height: 2),
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: Text(
                                  s.$2,
                                  style: TextStyle(
                                    color: s.$3 ?? Colors.white,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.fraction);

  final double fraction;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 10.0;
    final rect = Offset.zero & size;
    final circle = rect.deflate(stroke / 2 + 2);
    canvas.drawArc(
      circle,
      0,
      math.pi * 2,
      false,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.14)
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke,
    );
    if (fraction > 0) {
      canvas.drawArc(
        circle,
        -math.pi / 2,
        math.pi * 2 * fraction.clamp(0, 1),
        false,
        Paint()
          ..color = HodiColors.lime
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round
          ..strokeWidth = stroke,
      );
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.fraction != fraction;
}

class _Quick {
  const _Quick({
    required this.label,
    required this.icon,
    required this.bg,
    required this.fg,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final Color bg;
  final Color fg;
  final VoidCallback onTap;
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.actions});

  final List<_Quick> actions;

  @override
  Widget build(BuildContext context) {
    if (actions.isEmpty) return const SizedBox.shrink();
    return Row(
      children: [
        for (final a in actions)
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: a.onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Column(
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: a.bg,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Icon(a.icon, color: a.fg),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      a.label,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        for (var i = actions.length; i < 4; i++)
          const Expanded(child: SizedBox()),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text, {this.badge, this.trailing});

  final String text;
  final String? badge;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(
          text,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
      ),
      if (badge != null) _Pill(label: badge!, tone: 'bad'),
      ?trailing,
    ],
  );
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.tone, this.small = false});

  final String label;
  final String tone;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = _tone(tone);
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: small ? 8 : 10,
        vertical: small ? 2 : 3,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: fg,
          fontSize: small ? 11 : 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _NeedCard extends StatelessWidget {
  const _NeedCard({
    required this.need,
    required this.busy,
    required this.canUpdate,
    required this.onAction,
  });

  final DashNeed need;
  final bool busy;
  final bool canUpdate;
  final void Function(String action) onAction;

  @override
  Widget build(BuildContext context) {
    final v = needView(need);
    final (bg, fg) = _tone(v.tone);
    final needsUpdate = v.action == 'check-out' || v.action == 'no-show';
    final action = needsUpdate && !canUpdate ? 'open-booking' : v.action;
    final label = needsUpdate && !canUpdate ? 'Open' : v.label;
    final icon = switch (need.kind) {
      'OVERDUE_CHECKOUT' => Icons.warning_amber_rounded,
      'UNIT_NOT_READY' => Icons.schedule,
      'REQUEST' => Icons.chat_bubble_outline,
      _ => Icons.person_off_outlined,
    };
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: fg, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    v.title,
                    style: TextStyle(
                      color: fg,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    v.detail,
                    style: const TextStyle(fontSize: 13, height: 1.4),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: busy ? null : () => onAction(action),
                    child: Text(label),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tabs extends StatelessWidget {
  const _Tabs({
    required this.selected,
    required this.counts,
    required this.onPick,
  });

  final String selected;
  final Map<String, int> counts;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    const labels = {
      'arriving': 'Arriving',
      'leaving': 'Leaving',
      'staying': 'Staying',
    };
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        children: [
          for (final e in labels.entries)
            Expanded(
              child: Semantics(
                selected: selected == e.key,
                button: true,
                child: Material(
                  color: selected == e.key ? cs.surface : Colors.transparent,
                  elevation: selected == e.key ? 1 : 0,
                  borderRadius: BorderRadius.circular(999),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(999),
                    onTap: () => onPick(e.key),
                    child: SizedBox(
                      height: 40,
                      child: Center(
                        child: Text(
                          '${e.value} ${counts[e.key] ?? 0}',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: selected == e.key
                                ? cs.onSurface
                                : cs.onSurfaceVariant,
                          ),
                        ),
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

class _StayCard extends StatelessWidget {
  const _StayCard({required this.row, required this.onTap});

  final DashRow row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final chip = rowChip(row);
    final (chipBg, chipFg) = _tone(chip.tone);
    final pay = payPill(row);
    final ready = readyPill(row);
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 54,
                constraints: const BoxConstraints(minHeight: 54),
                padding: const EdgeInsets.symmetric(vertical: 6),
                decoration: BoxDecoration(
                  color: chipBg,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      chip.top,
                      style: TextStyle(
                        color: chipFg,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      chip.bottom,
                      style: TextStyle(
                        color: chipFg,
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Flexible(
                          child: Text(
                            row.guestName ?? 'Guest',
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          row.code,
                          style: TextStyle(
                            fontSize: 11,
                            color: muted,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${row.unitTitle} · ${row.unitNumber}',
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: muted),
                    ),
                    if (pay != null || ready != null) ...[
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: [
                          if (pay != null)
                            _Pill(
                              label: pay.label,
                              tone: pay.tone,
                              small: true,
                            ),
                          if (ready != null)
                            _Pill(
                              label: ready.label,
                              tone: ready.tone,
                              small: true,
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _NightsCard extends StatelessWidget {
  const _NightsCard({required this.d});

  final HostDashboard d;

  @override
  Widget build(BuildContext context) {
    final week = d.nights.take(7).toList();
    final units = math.max(1, d.units);
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return SectionCard(
      children: [
        _SectionTitle(
          'Next ${week.length} nights',
          trailing: TextButton(
            onPressed: () => context.go('/host/calendar'),
            child: const Text('Calendar'),
          ),
        ),
        const SizedBox(height: 8),
        Semantics(
          label:
              'Units booked: ${week.map((n) => '${weekday(n.date)} ${n.booked}').join(', ')}, of ${d.units}',
          child: ExcludeSemantics(
            child: SizedBox(
              height: 130,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var i = 0; i < week.length; i++)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Text(
                              '${week[i].booked}',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Expanded(
                              child: Align(
                                alignment: Alignment.bottomCenter,
                                child: FractionallySizedBox(
                                  heightFactor: week[i].booked / units,
                                  child: Container(
                                    constraints: const BoxConstraints(
                                      minHeight: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: i == 0
                                          ? HodiColors.navy
                                          : HodiColors.lime,
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              weekday(week[i].date),
                              style: TextStyle(
                                fontSize: 11,
                                color: i == 0 ? null : muted,
                                fontWeight: i == 0
                                    ? FontWeight.w600
                                    : FontWeight.w400,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          nightsSummary(week, d.units),
          style: TextStyle(fontSize: 13, color: muted),
        ),
      ],
    );
  }
}

class _UnitsCard extends StatelessWidget {
  const _UnitsCard({required this.d});

  final HostDashboard d;

  @override
  Widget build(BuildContext context) {
    final tiles = [
      ('Occupied', '${d.count('OCCUPIED') + d.count('LATE')}', 'plain'),
      ('Ready', '${d.count('READY')}', 'ok'),
      ('To clean', '${d.count('TO_CLEAN')}', 'warn'),
      (
        'Arriving, blocked',
        '${d.count('ARRIVING')} · ${d.count('BLOCKED')}',
        'grey',
      ),
    ];
    return SectionCard(
      title: 'Units right now',
      children: [
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 3.2,
          children: [
            for (final t in tiles)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: t.$3 == 'grey'
                      ? const Color(0xFFF1F4F8)
                      : _tone(t.$3).$1,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        t.$1,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: t.$3 == 'grey'
                              ? HodiColors.inkSecondary
                              : _tone(t.$3).$2,
                        ),
                      ),
                    ),
                    Text(
                      t.$2,
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: t.$3 == 'grey'
                            ? HodiColors.inkSecondary
                            : _tone(t.$3).$2,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }
}
