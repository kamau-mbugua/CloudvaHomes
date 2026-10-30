import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dates.dart';
import '../../core/files.dart';
import '../../core/money.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import 'tenant_api.dart';

/// The ranges offered; the server's default (no range) is used for "Recent".
enum StatementRange { recent, threeMonths, year }

({String? from, String? to}) rangeFor(StatementRange r, DateTime today) =>
    switch (r) {
      StatementRange.recent => (from: null, to: null),
      StatementRange.threeMonths => (
        from: toDay(DateTime(today.year, today.month - 2, 1)),
        to: toDay(today),
      ),
      StatementRange.year => (
        from: toDay(DateTime(today.year, 1, 1)),
        to: toDay(today),
      ),
    };

final statementRangeProvider = StateProvider.autoDispose(
  (ref) => StatementRange.threeMonths,
);

class TenantStatementScreen extends ConsumerWidget {
  const TenantStatementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ref.watch(currentTenantIdProvider);
    if (id == null) return const SizedBox.shrink();
    final choice = ref.watch(statementRangeProvider);
    final range = rangeFor(choice, DateTime.now());
    final statement = ref.watch(tenantStatementProvider(range));
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return RefreshIndicator(
      onRefresh: () => ref.refresh(tenantStatementProvider(range).future),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SegmentedButton<StatementRange>(
            segments: const [
              ButtonSegment(
                value: StatementRange.recent,
                label: Text('Recent'),
              ),
              ButtonSegment(
                value: StatementRange.threeMonths,
                label: Text('3 months'),
              ),
              ButtonSegment(
                value: StatementRange.year,
                label: Text('This year'),
              ),
            ],
            selected: {choice},
            onSelectionChanged: (s) =>
                ref.read(statementRangeProvider.notifier).state = s.first,
          ),
          const SizedBox(height: 12),
          AsyncBody(
            value: statement,
            onRetry: () => ref.invalidate(tenantStatementProvider(range)),
            data: (s) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionCard(
                  title: '${formatDay(s.from)} – ${formatDay(s.to)}',
                  trailing: IconButton(
                    tooltip: 'Statement PDF',
                    icon: const Icon(Icons.picture_as_pdf_outlined),
                    onPressed: () {
                      final q = [
                        if (range.from != null) 'from=${range.from}',
                        if (range.to != null) 'to=${range.to}',
                      ].join('&');
                      openApiPdf(
                        ref.read(apiClientProvider),
                        '${ref.read(tenantApiProvider).base(id)}/statement/pdf${q.isEmpty ? '' : '?$q'}',
                        'statement.pdf',
                      ).catchError((Object _) {
                        if (context.mounted) {
                          showMessage(context, 'Couldn’t open the PDF.');
                        }
                      });
                    },
                  ),
                  children: [
                    FactRow('Opening balance', _balance(s.opening)),
                    FactRow('Closing balance', _balance(s.closing), bold: true),
                  ],
                ),
                const SizedBox(height: 12),
                if (s.entries.isEmpty)
                  const EmptyState(title: 'Nothing in this period')
                else
                  Card(
                    child: Column(
                      children: [
                        for (final (idx, e) in s.entries.indexed) ...[
                          if (idx > 0) const Divider(height: 1),
                          ListTile(
                            title: Text(e.description),
                            subtitle: Text(
                              '${formatDay(e.date)} · ${e.reference}',
                              style: TextStyle(color: muted),
                            ),
                            trailing: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  e.debit > 0
                                      ? formatKes(e.debit)
                                      : '-${formatKes(e.credit)}',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    color: e.debit > 0
                                        ? null
                                        : toneColor(context, Tone.good),
                                  ),
                                ),
                                Text(
                                  _balance(e.balance),
                                  style: TextStyle(color: muted, fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                        ],
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

/// Negative balances are credit.
String _balance(int cents) =>
    cents < 0 ? '${formatKes(-cents)} credit' : formatKes(cents);
