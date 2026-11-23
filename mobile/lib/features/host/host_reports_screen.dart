import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/dates.dart';
import '../../core/files.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import 'booking_view.dart' show shillings;
import 'calendar_widgets.dart' show CalChip;
import 'detail_ui.dart';
import 'host_api.dart';
import 'host_models.dart';
import 'report_view.dart';

/// Money and occupancy for a period: what came in, what went out, what was kept, and how each
/// unit did.
class HostReportsScreen extends ConsumerStatefulWidget {
  const HostReportsScreen({super.key});

  @override
  ConsumerState<HostReportsScreen> createState() => _HostReportsScreenState();
}

class _HostReportsScreenState extends ConsumerState<HostReportsScreen> {
  late final List<ReportPeriod> _periods = reportPeriods(todayIso());
  late ReportPeriod _period = _periods.first;
  Future<HostReportSummary>? _future;
  bool _sharing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  String? get _propertyId =>
      ref.read(sessionProvider).valueOrNull?.activePropertyId;

  void _load() {
    setState(() {
      _future = ref
          .read(hostApiProvider)
          .reportSummary(
            from: _period.from,
            to: _period.to,
            propertyId: _propertyId,
          );
    });
  }

  Future<void> _shareCsv() async {
    setState(() => _sharing = true);
    try {
      await shareApiFile(
        ref.read(apiClientProvider),
        '/host/reports/summary',
        'stays-report-${_period.from}-to-${_period.to}.csv',
        mimeType: 'text/csv',
        query: {
          'from': _period.from,
          'to': _period.to,
          'format': 'csv',
          if (_propertyId != null) 'propertyId': _propertyId,
        },
      );
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    } catch (_) {
      if (mounted) showMessage(context, 'Couldn’t share the report.');
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: KodiHubAppBar(
        title: const Text('Reports'),
        subtitle: periodRange(_period.from, _period.to),
        loading: _sharing,
        actions: [
          IconButton(
            tooltip: 'Share as a spreadsheet (CSV)',
            icon: const Icon(Icons.ios_share),
            onPressed: _sharing ? null : _shareCsv,
          ),
        ],
      ),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
              children: [
                for (final p in _periods) ...[
                  CalChip(
                    label: p.label,
                    selected: p.key == _period.key,
                    onTap: () {
                      if (p.key == _period.key) return;
                      _period = p;
                      _load();
                    },
                  ),
                  const SizedBox(width: 6),
                ],
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder<HostReportSummary>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snap.hasError) {
                  return ErrorState(
                    message: messageOf(snap.error!),
                    onRetry: _load,
                  );
                }
                final s = snap.data!;
                if (s.rows.isEmpty) {
                  return const EmptyState(
                    icon: Icons.bar_chart_outlined,
                    title: 'No listings to report on',
                    body: 'Reports fill in once you have listings and stays.',
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async => _load(),
                  child: _report(s),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _report(HostReportSummary s) {
    final netIn = s.totalReceivedCents - s.totalRefundedCents;
    final rows = [...s.rows]
      ..sort((a, b) => b.profitCents.compareTo(a.profitCents));
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
      children: [
        _ProfitCard(s: s, netIn: netIn),
        const SizedBox(height: 14),
        _OccupancyCard(s: s),
        if (s.monthly.length > 1) ...[
          const SizedBox(height: 14),
          _MonthlyCard(s: s),
        ],
        const SizedBox(height: 18),
        const Padding(
          padding: EdgeInsets.fromLTRB(4, 0, 4, 10),
          child: Text(
            'BY UNIT, MOST PROFITABLE FIRST',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.6,
              color: HodiColors.inkMuted,
            ),
          ),
        ),
        for (final r in rows) ...[_UnitCard(r: r), const SizedBox(height: 10)],
      ],
    );
  }
}

const _good = Color(0xFF3F5A0C);
const _bad = Color(0xFFB42318);

class _ProfitCard extends StatelessWidget {
  const _ProfitCard({required this.s, required this.netIn});

  final HostReportSummary s;
  final int netIn;

  @override
  Widget build(BuildContext context) {
    final profit = s.totalProfitCents;
    return DetailCard(
      title: 'Profit',
      trailing: DetailPill(
        profit >= 0 ? 'You made money' : 'Costs were higher',
        tone: profit >= 0 ? 'ok' : 'bad',
      ),
      gap: 12,
      children: [
        Text(
          '${profit < 0 ? '−' : ''}KES ${shillings(profit.abs())}',
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.5,
            color: profit >= 0 ? _good : _bad,
          ),
        ),
        Row(
          children: [
            Expanded(
              child: Figure('Received', shillings(s.totalReceivedCents)),
            ),
            Expanded(
              child: Figure(
                'Refunded',
                shillings(s.totalRefundedCents),
                color: s.totalRefundedCents > 0
                    ? const Color(0xFF9A3412)
                    : null,
              ),
            ),
            Expanded(
              child: Figure(
                'Expenses',
                shillings(s.totalExpensesCents),
                color: s.totalExpensesCents > 0
                    ? const Color(0xFF9A3412)
                    : null,
              ),
            ),
          ],
        ),
        Text(
          [
            'All amounts in KES. Profit is what guests paid in this period (${shillings(netIn)} after refunds) less expenses.',
            if (s.totalWrittenOffCents > 0)
              '${shillings(s.totalWrittenOffCents)} was written off as unpaid.',
            'Nights stayed in this period are worth ${shillings(s.totalBookedValueCents)}.',
          ].join(' '),
          style: const TextStyle(
            fontSize: 13,
            height: 1.45,
            color: HodiColors.inkSecondary,
          ),
        ),
      ],
    );
  }
}

class _OccupancyCard extends StatelessWidget {
  const _OccupancyCard({required this.s});

  final HostReportSummary s;

  @override
  Widget build(BuildContext context) => DetailCard(
    title: 'Occupancy',
    trailing: Text(
      percent(s.totalOccupancy),
      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
    ),
    gap: 12,
    children: [
      _Bar(
        fraction: s.totalOccupancy,
        label: '${percent(s.totalOccupancy)} of available nights booked',
      ),
      Row(
        children: [
          Expanded(child: Figure('Nights booked', '${s.totalNights}')),
          Expanded(
            child: Figure(
              'Average a night',
              'KES ${shillings(s.totalAdrCents)}',
            ),
          ),
          Expanded(child: Figure('Units', '${s.rows.length}')),
        ],
      ),
    ],
  );
}

class _MonthlyCard extends StatelessWidget {
  const _MonthlyCard({required this.s});

  final HostReportSummary s;

  @override
  Widget build(BuildContext context) {
    final months = s.monthly;
    final peak = math.max(
      1,
      months.fold<int>(
        0,
        (m, e) => math.max(m, math.max(e.received - e.refunded, e.expenses)),
      ),
    );
    return DetailCard(
      title: 'Month by month',
      gap: 12,
      children: [
        Semantics(
          label: months
              .map(
                (m) =>
                    '${monthShort(m.period)}: received ${shillings(m.received - m.refunded)}, expenses ${shillings(m.expenses)}',
              )
              .join('; '),
          child: ExcludeSemantics(
            child: SizedBox(
              height: 140,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final m in months)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Column(
                          children: [
                            Expanded(
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  _Column(
                                    fraction: (m.received - m.refunded) / peak,
                                    color: HodiColors.lime,
                                  ),
                                  const SizedBox(width: 2),
                                  _Column(
                                    fraction: m.expenses / peak,
                                    color: const Color(0xFFE8A33D),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              monthShort(m.period),
                              style: const TextStyle(
                                fontSize: 11,
                                color: HodiColors.inkMuted,
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
        const Wrap(
          spacing: 14,
          children: [
            _Key(color: HodiColors.lime, label: 'Received, after refunds'),
            _Key(color: Color(0xFFE8A33D), label: 'Expenses'),
          ],
        ),
      ],
    );
  }
}

class _Column extends StatelessWidget {
  const _Column({required this.fraction, required this.color});

  final double fraction;
  final Color color;

  @override
  Widget build(BuildContext context) => Expanded(
    child: FractionallySizedBox(
      heightFactor: fraction.clamp(0, 1).toDouble(),
      alignment: Alignment.bottomCenter,
      child: Container(
        constraints: const BoxConstraints(minHeight: 2),
        decoration: BoxDecoration(
          color: color,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
        ),
      ),
    ),
  );
}

class _Key extends StatelessWidget {
  const _Key({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(3),
        ),
      ),
      const SizedBox(width: 6),
      Text(
        label,
        style: const TextStyle(fontSize: 12, color: HodiColors.inkSecondary),
      ),
    ],
  );
}

class _Bar extends StatelessWidget {
  const _Bar({required this.fraction, required this.label});

  final double fraction;
  final String label;

  @override
  Widget build(BuildContext context) => Semantics(
    label: label,
    child: ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: LinearProgressIndicator(
        value: fraction.clamp(0, 1).toDouble(),
        minHeight: 8,
        color: HodiColors.lime,
        backgroundColor: const Color(0xFFEDF1F5),
      ),
    ),
  );
}

class _UnitCard extends StatelessWidget {
  const _UnitCard({required this.r});

  final HostReportUnitRow r;

  @override
  Widget build(BuildContext context) {
    final profit = r.profitCents;
    return DetailCard(
      gap: 10,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    r.title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    '${r.propertyName} · ${r.unitNumber}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: HodiColors.inkMuted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  '${profit < 0 ? '−' : ''}KES ${shillings(profit.abs())}',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: profit > 0
                        ? _good
                        : profit < 0
                        ? _bad
                        : null,
                  ),
                ),
              ),
            ),
          ],
        ),
        Row(
          children: [
            Expanded(
              child: _Bar(
                fraction: r.occupancy,
                label: '${percent(r.occupancy)} booked',
              ),
            ),
            const SizedBox(width: 10),
            Flexible(
              child: Text(
                '${percent(r.occupancy)} · ${r.nights} night${r.nights == 1 ? '' : 's'}',
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
        Row(
          children: [
            Expanded(
              child: Figure(
                'Received',
                shillings(r.receivedCents - r.refundedCents),
              ),
            ),
            Expanded(child: Figure('Expenses', shillings(r.expensesCents))),
            Expanded(
              child: Figure(
                'A night',
                r.nights == 0 ? '–' : shillings(r.adrCents),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
