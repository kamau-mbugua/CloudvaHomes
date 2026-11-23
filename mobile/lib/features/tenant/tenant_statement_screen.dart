import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dates.dart';
import '../../core/money.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import 'tenant_api.dart';
import 'tenant_more_pages.dart' show DocumentPreviewScreen, TenantDoc;

/// The ranges offered; the server's default (no range) is used for "Recent".
enum StatementRange { recent, threeMonths, year }

extension on StatementRange {
  String get label => switch (this) {
    StatementRange.recent => 'Recent',
    StatementRange.threeMonths => '3 months',
    StatementRange.year => 'This year',
  };
}

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

/// Entries by month, in date order: [("November 2026", [...]), …].
List<(String, List<StatementEntry>)> groupByMonth(
  List<StatementEntry> entries,
) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June', //
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  final groups = <(String, List<StatementEntry>)>[];
  for (final e in entries) {
    final d = DateTime.tryParse(e.date);
    final label = d == null ? '' : '${months[d.month - 1]} ${d.year}';
    if (groups.isEmpty || groups.last.$1 != label) groups.add((label, []));
    groups.last.$2.add(e);
  }
  return groups;
}

/// Negative balances are credit.
String balanceText(int cents) =>
    cents < 0 ? '${formatKes(-cents)} credit' : formatKes(cents);

class TenantStatementScreen extends ConsumerWidget {
  const TenantStatementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ref.watch(currentTenantIdProvider);
    if (id == null) {
      return ref.watch(sessionProvider).isLoading
          ? const KodiHubPageLoader()
          : const SizedBox.shrink();
    }
    final choice = ref.watch(statementRangeProvider);
    final range = rangeFor(choice, DateTime.now());
    final statement = ref.watch(tenantStatementProvider(range));

    void preview(Statement s) {
      final q = [
        if (range.from != null) 'from=${range.from}',
        if (range.to != null) 'to=${range.to}',
      ].join('&');
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => DocumentPreviewScreen(
            doc: TenantDoc(
              title: 'Statement',
              subtitle: '${formatDay(s.from)} – ${formatDay(s.to)}',
              path:
                  '${ref.read(tenantApiProvider).base(id)}/statement/pdf${q.isEmpty ? '' : '?$q'}',
              fileName: 'Statement ${s.from} to ${s.to}.pdf',
            ),
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.refresh(tenantStatementProvider(range).future),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Wrap(
            spacing: 8,
            children: [
              for (final r in StatementRange.values)
                ChoiceChip(
                  key: Key('statement-${r.name}'),
                  label: Text(r.label),
                  selected: r == choice,
                  onSelected: (_) =>
                      ref.read(statementRangeProvider.notifier).state = r,
                ),
            ],
          ),
          const SizedBox(height: 12),
          AsyncBody(
            value: statement,
            onRetry: () => ref.invalidate(tenantStatementProvider(range)),
            data: (s) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Summary(statement: s, onPreview: () => preview(s)),
                if (s.entries.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 24),
                    child: EmptyState(
                      title: 'Nothing in this period',
                      icon: Icons.receipt_long_outlined,
                    ),
                  )
                else
                  for (final (month, rows) in groupByMonth(s.entries)) ...[
                    _MonthHeader(month),
                    for (final e in rows) _EntryTile(entry: e),
                  ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.statement, required this.onPreview});

  final Statement statement;
  final VoidCallback onPreview;

  @override
  Widget build(BuildContext context) {
    final s = statement;
    final cs = Theme.of(context).colorScheme;
    final charged = s.entries.fold<int>(0, (a, e) => a + e.debit);
    final paid = s.entries.fold<int>(0, (a, e) => a + e.credit);
    final (closingLabel, closingColor) = s.closing > 0
        ? ('You owe', HodiColors.danger)
        : s.closing < 0
        ? ('Credit', HodiColors.success)
        : ('All paid', HodiColors.success);
    Widget figure(String label, String value) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        border: Border.all(color: cs.outlineVariant),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${formatDay(s.from)} – ${formatDay(s.to)}',
            style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 6),
          Text(
            closingLabel,
            style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
          ),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              s.closing == 0 ? formatKes(0) : formatKes(s.closing.abs()),
              key: const Key('statement-closing'),
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w600,
                color: closingColor,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              figure('Opening', balanceText(s.opening)),
              figure('Charged', formatKes(charged)),
              figure('Paid', formatKes(paid)),
            ],
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            key: const Key('statement-pdf'),
            onPressed: onPreview,
            icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
            label: const Text('Preview PDF'),
          ),
        ],
      ),
    );
  }
}

class _MonthHeader extends StatelessWidget {
  const _MonthHeader(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
    child: Text(
      label.toUpperCase(),
      style: TextStyle(
        fontSize: 11.5,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.8,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    ),
  );
}

class _EntryTile extends StatelessWidget {
  const _EntryTile({required this.entry});
  final StatementEntry entry;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final e = entry;
    final isCharge = e.debit > 0;
    final (icon, fg, bg) = isCharge
        ? (
            Icons.receipt_long_outlined,
            HodiColors.navy,
            const Color(0xFFEEF2F7),
          )
        : (
            Icons.check_circle_outline,
            HodiColors.success,
            HodiColors.successSoft,
          );
    final meta = [
      formatDay(e.date),
      if (e.reference.isNotEmpty) e.reference,
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: cs.surfaceContainerLowest,
          border: Border.all(color: cs.outlineVariant),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 20, color: fg),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    e.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12.5,
                      color: cs.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  isCharge ? formatKes(e.debit) : '−${formatKes(e.credit)}',
                  style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                    color: isCharge ? null : HodiColors.success,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Bal ${balanceText(e.balance)}',
                  style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
