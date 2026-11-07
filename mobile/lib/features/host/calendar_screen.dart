import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import 'calendar_rules.dart';
import 'host_api.dart';
import 'host_shell.dart';

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  late String _month;
  String? _unitId;
  int _refreshTick = 0;

  @override
  void initState() {
    super.initState();
    _month = DateTime.now().toIso8601String().substring(0, 7);
  }

  void _shiftMonth(int delta) {
    final parts = _month.split('-');
    final dt = DateTime.utc(
      int.parse(parts[0]),
      int.parse(parts[1]) + delta,
      1,
    );
    setState(() {
      _month =
          '${dt.year.toString().padLeft(4, '0')}-${dt.month.toString().padLeft(2, '0')}';
    });
  }

  Future<void> _onTapFreeDay(
    BuildContext context, {
    required String unitId,
    required String? listingId,
    required String date,
  }) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (listingId != null)
              ListTile(
                leading: const Icon(Icons.book_online_outlined),
                title: const Text('New booking'),
                subtitle: Text('Check in on $date'),
                onTap: () => Navigator.of(ctx).pop('book'),
              ),
            ListTile(
              leading: const Icon(Icons.block_outlined),
              title: const Text('Block dates'),
              subtitle: Text('Starting $date'),
              onTap: () => Navigator.of(ctx).pop('block'),
            ),
          ],
        ),
      ),
    );
    if (!context.mounted || choice == null) return;
    if (choice == 'book' && listingId != null) {
      final created = await context.push<bool>(
        '/host/bookings/new?listingId=$listingId&checkIn=$date',
      );
      if (created == true && mounted) setState(() => _refreshTick++);
    } else if (choice == 'block') {
      final parts = date.split('-');
      final next = DateTime.utc(
        int.parse(parts[0]),
        int.parse(parts[1]),
        int.parse(parts[2]) + 1,
      ).toIso8601String().substring(0, 10);
      try {
        await ref
            .read(hostApiProvider)
            .createBlock(
              unitId: unitId,
              fromDate: date,
              toDate: next,
              reason: 'Host block',
            );
        if (mounted) setState(() => _refreshTick++);
      } catch (e) {
        if (context.mounted) showMessage(context, messageOf(e));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final propId = session?.activePropertyId;
    final parts = _month.split('-');
    final from = '$_month-01';
    final nextMonth = DateTime.utc(
      int.parse(parts[0]),
      int.parse(parts[1]) + 1,
      1,
    ).toIso8601String().substring(0, 10);

    return HostTabScaffold(
      title: 'Calendar',
      body: FutureBuilder(
        key: ValueKey('$_month-$propId-$_refreshTick'),
        future: ref
            .read(hostApiProvider)
            .calendar(from: from, to: nextMonth, propertyId: propId),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorState(
              message: messageOf(snap.error!),
              onRetry: () => setState(() => _refreshTick++),
            );
          }
          final data = snap.data!;
          if (data.units.isEmpty) {
            return const EmptyState(
              icon: Icons.calendar_month_outlined,
              title: 'No listings yet',
              body: 'Create a listing to manage availability on the calendar.',
            );
          }
          final selectedUnit = data.units.firstWhere(
            (u) => u.id == _unitId,
            orElse: () => data.units.first,
          );
          final unitItems = [
            for (final it in data.items)
              if (it.unitId == selectedUnit.id) it,
          ];
          final days = monthDays(_month, unitItems);

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DropdownButtonFormField<String>(
                initialValue: selectedUnit.id,
                decoration: const InputDecoration(labelText: 'Unit'),
                items: [
                  for (final u in data.units)
                    DropdownMenuItem(
                      value: u.id,
                      child: Text('${u.title} (${u.number})'),
                    ),
                ],
                onChanged: (v) => setState(() => _unitId = v),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    icon: const Icon(Icons.chevron_left),
                    onPressed: () => _shiftMonth(-1),
                  ),
                  Text(_month, style: Theme.of(context).textTheme.titleMedium),
                  IconButton(
                    icon: const Icon(Icons.chevron_right),
                    onPressed: () => _shiftMonth(1),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 7,
                  mainAxisSpacing: 6,
                  crossAxisSpacing: 6,
                ),
                itemCount: days.length,
                itemBuilder: (context, idx) {
                  final d = days[idx];
                  final dayNum = d.date.substring(8);
                  final cs = Theme.of(context).colorScheme;
                  final bg = switch (d.status) {
                    DayStatus.free => HodiColors.successSoft,
                    DayStatus.booked => HodiColors.infoSoft,
                    DayStatus.checkIn => cs.primaryContainer,
                    DayStatus.checkOut => cs.secondaryContainer,
                    DayStatus.turnover => HodiColors.warningSoft,
                    DayStatus.blocked => cs.surfaceContainerHighest,
                  };
                  return InkWell(
                    onTap: () {
                      if (d.status == DayStatus.free ||
                          d.status == DayStatus.checkOut) {
                        _onTapFreeDay(
                          context,
                          unitId: selectedUnit.id,
                          listingId: selectedUnit.listingId,
                          date: d.date,
                        );
                      } else if (d.item != null && d.item!.kind == 'BOOKING') {
                        context.push('/host/bookings/${d.item!.id}');
                      }
                    },
                    child: Container(
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: bg,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(dayNum),
                    ),
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }
}
