import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session_controller.dart';
import '../../core/dates.dart';
import '../../core/money.dart';
import '../../core/widgets/common.dart';
import 'host_api.dart';
import 'host_models.dart';

class HostReportsScreen extends ConsumerStatefulWidget {
  const HostReportsScreen({super.key});

  @override
  ConsumerState<HostReportsScreen> createState() => _HostReportsScreenState();
}

class _HostReportsScreenState extends ConsumerState<HostReportsScreen> {
  late String _from;
  late String _to;
  Future<HostReportSummary>? _future;

  @override
  void initState() {
    super.initState();
    final today = todayIso();
    _from = '${today.substring(0, 7)}-01';
    _to = today;
    _reload();
  }

  void _reload() {
    final propId = ref.read(sessionProvider).valueOrNull?.activePropertyId;
    setState(() {
      _future = ref
          .read(hostApiProvider)
          .reportSummary(from: _from, to: _to, propertyId: propId);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const KodiHubAppBar(title: Text('Host reports')),
      body: FutureBuilder<HostReportSummary>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(snap.error.toString(), textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: _reload,
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            );
          }
          final summary = snap.data;
          if (summary == null) {
            return const EmptyState(
              icon: Icons.bar_chart_outlined,
              title: 'No report data',
            );
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Kicker('Summary'),
                      const SizedBox(height: 8),
                      Text(
                        'Received: ${formatKes(summary.totalReceivedCents)}',
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Booked value: ${formatKes(summary.totalBookedValueCents)}',
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Expenses: ${formatKes(summary.totalExpensesCents)}',
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Net profit: ${formatKes(summary.totalProfitCents)}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Nights: ${summary.totalNights} · Occupancy: ${(summary.totalOccupancy * 100).toStringAsFixed(1)}% · ADR: ${formatKes(summary.totalAdrCents)}',
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Padding(
                padding: EdgeInsets.only(left: 4, bottom: 8),
                child: Kicker('Per unit performance'),
              ),
              if (summary.rows.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('No units recorded yet.'),
                  ),
                )
              else
                for (final r in summary.rows) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            r.title,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${r.propertyName} · ${r.unitNumber}',
                            style: TextStyle(
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurfaceVariant,
                            ),
                          ),
                          const Divider(height: 18),
                          Text('Received: ${formatKes(r.receivedCents)}'),
                          const SizedBox(height: 2),
                          Text('Expenses: ${formatKes(r.expensesCents)}'),
                          const SizedBox(height: 2),
                          Text(
                            'Profit: ${formatKes(r.profitCents)}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${r.nights} nights · ${(r.occupancy * 100).toStringAsFixed(1)}% occ · ADR ${formatKes(r.adrCents)}',
                            style: TextStyle(
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
            ],
          );
        },
      ),
    );
  }
}
