import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_error.dart';
import '../../../core/dates.dart';
import '../../../core/files.dart';
import '../../../core/money.dart';
import '../../../core/providers.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/common.dart';
import '../../../core/widgets/paged_list.dart';
import '../staff_api.dart';
import '../staff_models.dart';
import '../staff_widgets.dart';

/// Money tab: payments, invoices and unmatched M-Pesa, each shown with its permission.
class MoneyScreen extends ConsumerWidget {
  const MoneyScreen({super.key, this.initialTab});

  /// `payments`, `invoices` or `mpesa`.
  final String? initialTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tabs = <(String, String, Widget)>[
      if (can(ref, 'payments:view'))
        ('payments', 'Payments', const _PaymentsList()),
      if (can(ref, 'invoices:view'))
        ('invoices', 'Invoices', const _InvoicesList()),
      if (can(ref, 'reconciliation:view'))
        ('mpesa', 'M-Pesa', const _UnmatchedList()),
    ];
    if (tabs.isEmpty) {
      return const StaffTabScaffold(
        title: 'Money',
        body: NoPermission('payments or invoices'),
      );
    }
    final start = tabs.indexWhere((t) => t.$1 == initialTab);
    return DefaultTabController(
      length: tabs.length,
      initialIndex: start < 0 ? 0 : start,
      child: StaffTabScaffold(
        title: 'Money',
        bottom: TabBar(tabs: [for (final t in tabs) Tab(text: t.$2)]),
        body: TabBarView(children: [for (final t in tabs) t.$3]),
      ),
    );
  }
}

// ───────────────────────────────────────────── payments

class _PaymentsList extends ConsumerStatefulWidget {
  const _PaymentsList();
  @override
  ConsumerState<_PaymentsList> createState() => _PaymentsListState();
}

class _PaymentsListState extends ConsumerState<_PaymentsList> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final api = ref.watch(staffApiProvider);
    final version = ref.watch(listsVersionProvider);
    return Column(
      children: [
        SearchField(
          hint: 'Receipt no., reference or tenant',
          onChanged: (v) => setState(() => _q = v),
        ),
        Expanded(
          child: PagedList<Payment>(
            resetKey: (_q, version),
            load: (page) async {
              final p = await api.payments(page: page, q: _q);
              return (rows: p.rows, hasMore: p.hasMore);
            },
            empty: const EmptyState(
              icon: Icons.payments_outlined,
              title: 'No payments found',
            ),
            itemBuilder: (context, p) => ListTile(
              leading: Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: p.isReversal
                      ? const Color(0xFFFDECEC)
                      : const Color(0xFFE6F4EC),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  p.isReversal ? Icons.undo : Icons.check,
                  size: 18,
                  color: p.isReversal ? HodiColors.danger : HodiColors.success,
                ),
              ),
              title: Text(
                '${formatKes(p.amount)} · ${p.tenant.name}',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                '${p.number} · ${formatDay(p.receivedAt)} · ${channelKindLabel[p.method] ?? p.method}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: p.isReversal
                  ? const StatusChip('Reversal', tone: Tone.bad)
                  : p.reversedByNumber != null
                  ? const StatusChip('Reversed')
                  : null,
              onTap: () => context.push('/staff/money/payments/${p.id}'),
            ),
          ),
        ),
      ],
    );
  }
}

class PaymentDetailScreen extends ConsumerStatefulWidget {
  const PaymentDetailScreen({super.key, required this.paymentId});
  final String paymentId;

  @override
  ConsumerState<PaymentDetailScreen> createState() =>
      _PaymentDetailScreenState();
}

class _PaymentDetailScreenState extends ConsumerState<PaymentDetailScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final paymentId = widget.paymentId;
    final payment = ref.watch(paymentProvider(paymentId));
    final p = payment.valueOrNull;
    return Scaffold(
      appBar: KodiHubAppBar(
        title: Text(p?.number ?? 'Payment'),
        subtitle: p?.tenant.name,
        actions: [
          if (p != null)
            IconButton(
              tooltip: 'Receipt PDF',
              icon: const Icon(Icons.picture_as_pdf_outlined),
              onPressed: () =>
                  openApiPdf(
                    ref.read(apiClientProvider),
                    '/payments/${p.id}/receipt',
                    '${p.number}.pdf',
                  ).catchError((Object _) {
                    if (context.mounted) {
                      showMessage(context, 'Couldn’t open the receipt.');
                    }
                  }),
            ),
        ],
      ),
      body: AsyncBody(
        value: payment,
        onRetry: () => ref.invalidate(paymentProvider(paymentId)),
        data: (p) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            LedgerReceiptCard(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        formatKes(p.amount),
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ),
                    if (p.isReversal)
                      const StatusChip('Reversal', tone: Tone.bad)
                    else if (p.reversedByNumber != null)
                      const StatusChip('Reversed')
                    else
                      const StatusChip('Confirmed', tone: Tone.good),
                  ],
                ),
                const SizedBox(height: 10),
                FactRow('Received', formatDay(p.receivedAt)),
                FactRow(
                  'Method',
                  [
                    channelKindLabel[p.method] ?? p.method,
                    ?p.channelName,
                  ].join(' · '),
                ),
                if (p.reference != null) FactRow('Reference', p.reference!),
                if (p.unallocated > 0)
                  FactRow('Kept as credit', formatKes(p.unallocated)),
              ],
            ),
            const SizedBox(height: 12),
            KodiHubSegmentedTabs(
              tabs: const ['Allocated to', 'Details & Tenant'],
              index: _tab,
              onChanged: (i) => setState(() => _tab = i),
            ),
            const SizedBox(height: 12),
            if (_tab == 0)
              SectionCard(
                title: 'Allocated to',
                children: [
                  if (p.allocations.isEmpty)
                    const Text(
                      'No invoices — the amount is the tenant’s credit.',
                    ),
                  for (final a in p.allocations)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('${a.number} · ${formatPeriod(a.period)}'),
                      trailing: Text(
                        formatKes(a.amount),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      onTap: can(ref, 'invoices:view')
                          ? () => context.push(
                              '/staff/money/invoices/${a.invoiceId}',
                            )
                          : null,
                    ),
                ],
              )
            else
              SectionCard(
                title: 'Receipt & Tenant',
                children: [
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: InitialsBadge(name: p.tenant.name),
                    title: Text(
                      p.tenant.name,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text('${p.tenant.code} · ${p.tenant.phone}'),
                    trailing: can(ref, 'tenants:view')
                        ? const Icon(Icons.chevron_right)
                        : null,
                    onTap: can(ref, 'tenants:view')
                        ? () => context.push('/staff/tenants/${p.tenant.id}')
                        : null,
                  ),
                  const Divider(),
                  FactRow('Receipt no.', p.number),
                  if (p.paidBy != null) FactRow('Paid by', p.paidBy!),
                  if (p.note != null) FactRow('Note', p.note!),
                  if (p.recordedBy != null)
                    FactRow('Recorded by', p.recordedBy!),
                  if (p.reversedByNumber != null)
                    FactRow('Reversed by', p.reversedByNumber!),
                  if (p.reversalReason != null)
                    FactRow('Reason', p.reversalReason!),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

// ───────────────────────────────────────────── invoices

class _InvoicesList extends ConsumerStatefulWidget {
  const _InvoicesList();
  @override
  ConsumerState<_InvoicesList> createState() => _InvoicesListState();
}

class _InvoicesListState extends ConsumerState<_InvoicesList> {
  String _q = '';

  /// '', 'OVERDUE', or an invoice status.
  String _status = '';

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(staffApiProvider);
    final version = ref.watch(listsVersionProvider);
    final canCreate = can(ref, 'invoices:create');
    return Column(
      children: [
        SearchField(
          hint: 'Invoice no., tenant or unit',
          onChanged: (v) => setState(() => _q = v),
        ),
        if (canCreate)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Row(
              children: [
                OutlinedButton.icon(
                  icon: const Icon(Icons.playlist_add_check_outlined, size: 18),
                  label: const Text('Run monthly'),
                  onPressed: () => _InvoiceRunSheet.show(context),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Ad-hoc invoice'),
                  onPressed: () => _AdHocInvoiceSheet.show(context),
                ),
              ],
            ),
          ),
        SizedBox(
          height: 52,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Row(
              children: [
                for (final (value, label) in const [
                  ('', 'All'),
                  ('OVERDUE', 'Overdue'),
                  ('ISSUED', 'Issued'),
                  ('PARTIALLY_PAID', 'Part paid'),
                  ('PAID', 'Paid'),
                  ('VOID', 'Void'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(label),
                      selected: _status == value,
                      onSelected: (_) => setState(() => _status = value),
                    ),
                  ),
              ],
            ),
          ),
        ),
        Expanded(
          child: PagedList<Invoice>(
            resetKey: (_q, _status, version),
            load: (page) async {
              final p = await api.invoices(
                page: page,
                q: _q,
                status: _status == 'OVERDUE' || _status.isEmpty
                    ? null
                    : _status,
                overdue: _status == 'OVERDUE',
              );
              return (rows: p.rows, hasMore: p.hasMore);
            },
            empty: const EmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'No invoices found',
            ),
            itemBuilder: (context, i) => ListTile(
              leading: UnitBadge(i.unitNumber),
              title: Text(
                '${i.tenant.name} · ${formatKes(i.total)}',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                '${i.number} · ${formatPeriod(i.period)} · ${i.unitNumber}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: invoiceStatusChip(i),
              onTap: () => context.push('/staff/money/invoices/${i.id}'),
            ),
          ),
        ),
      ],
    );
  }
}

class InvoiceDetailScreen extends ConsumerStatefulWidget {
  const InvoiceDetailScreen({super.key, required this.invoiceId});
  final String invoiceId;

  @override
  ConsumerState<InvoiceDetailScreen> createState() =>
      _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends ConsumerState<InvoiceDetailScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final invoiceId = widget.invoiceId;
    final detail = ref.watch(invoiceProvider(invoiceId));
    final d = detail.valueOrNull;
    return Scaffold(
      appBar: KodiHubAppBar(
        title: Text(d?.invoice.number ?? 'Invoice'),
        subtitle: d == null
            ? null
            : '${d.invoice.unitNumber} · ${d.invoice.propertyName}',
        actions: [
          if (d != null)
            IconButton(
              tooltip: 'Invoice PDF',
              icon: const Icon(Icons.picture_as_pdf_outlined),
              onPressed: () =>
                  openApiPdf(
                    ref.read(apiClientProvider),
                    '/invoices/${d.invoice.id}/pdf',
                    '${d.invoice.number}.pdf',
                  ).catchError((Object _) {
                    if (context.mounted) {
                      showMessage(context, 'Couldn’t open the PDF.');
                    }
                  }),
            ),
        ],
      ),
      body: AsyncBody(
        value: detail,
        onRetry: () => ref.invalidate(invoiceProvider(invoiceId)),
        data: (d) {
          final i = d.invoice;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              LedgerReceiptCard(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Kicker(
                              '${i.number} · ${formatPeriod(i.period)}',
                              color: HodiColors.limeText,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              formatKes(i.balance > 0 ? i.balance : i.total),
                              style: Theme.of(context).textTheme.headlineSmall
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            Text(
                              i.balance > 0
                                  ? 'Balance due · Due ${formatDay(i.dueDate)}'
                                  : 'Total ${formatKes(i.total)} · Issued ${formatDay(i.issueDate)}',
                              style: TextStyle(
                                fontSize: 12.5,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                      invoiceStatusChip(i),
                    ],
                  ),
                  if (i.status != 'VOID' && can(ref, 'invoices:void')) ...[
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (i.balance > 0)
                          OutlinedButton.icon(
                            icon: const Icon(Icons.remove_circle_outline),
                            label: const Text('Issue credit note'),
                            onPressed: () => _InvoiceActions.creditNote(
                              context,
                              ref,
                              invoiceId: i.id,
                              tenantId: i.tenant.id,
                              maxBalance: i.balance,
                            ),
                          ),
                        if (i.amountPaid == 0)
                          OutlinedButton.icon(
                            icon: const Icon(Icons.cancel_outlined),
                            label: const Text('Void invoice'),
                            onPressed: () => _InvoiceActions.voidInvoice(
                              context,
                              ref,
                              invoiceId: i.id,
                              tenantId: i.tenant.id,
                            ),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 12),
              KodiHubSegmentedTabs(
                tabs: const ['Lines', 'Payments & Credits', 'Details'],
                index: _tab,
                onChanged: (idx) => setState(() => _tab = idx),
              ),
              const SizedBox(height: 12),
              if (_tab == 0)
                SectionCard(
                  title: 'Lines',
                  children: [
                    for (final l in d.lines)
                      FactRow(
                        l.quantity == '1' || l.quantity == '1.000'
                            ? l.description
                            : '${l.description} (${l.quantity} × ${formatKes(l.unitAmount)})',
                        formatKes(l.amount),
                      ),
                    const Divider(),
                    FactRow('Total', formatKes(i.total), bold: true),
                    if (i.creditedAmount > 0)
                      FactRow('Credited', '-${formatKes(i.creditedAmount)}'),
                    FactRow('Paid', formatKes(i.amountPaid)),
                    FactRow('Balance', formatKes(i.balance), bold: true),
                  ],
                )
              else if (_tab == 1) ...[
                SectionCard(
                  title: 'Payments',
                  children: [
                    if (d.payments.isEmpty)
                      const Text('No payments allocated to this invoice yet.'),
                    for (final p in d.payments)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('${p.number} · ${formatDay(p.receivedAt)}'),
                        trailing: Text(
                          formatKes(p.amount),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        onTap: can(ref, 'payments:view')
                            ? () =>
                                  context.push('/staff/money/payments/${p.id}')
                            : null,
                      ),
                  ],
                ),
                if (d.creditNotes.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  SectionCard(
                    title: 'Credit notes',
                    children: [
                      for (final c in d.creditNotes)
                        FactRow(
                          '${c.number} · ${c.reason}',
                          formatKes(c.amount),
                        ),
                    ],
                  ),
                ],
              ] else
                SectionCard(
                  title: 'Invoice & Tenant',
                  children: [
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: InitialsBadge(name: i.tenant.name),
                      title: Text(
                        i.tenant.name,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(i.tenant.code),
                      trailing: can(ref, 'tenants:view')
                          ? const Icon(Icons.chevron_right)
                          : null,
                      onTap: can(ref, 'tenants:view')
                          ? () => context.push('/staff/tenants/${i.tenant.id}')
                          : null,
                    ),
                    const Divider(),
                    FactRow('Invoice no.', i.number),
                    FactRow('Period', formatPeriod(i.period)),
                    FactRow('Unit', '${i.unitNumber}, ${i.propertyName}'),
                    FactRow('Issued', formatDay(i.issueDate)),
                    FactRow('Due', formatDay(i.dueDate)),
                    if (i.voidReason != null)
                      FactRow('Void because', i.voidReason!),
                  ],
                ),
            ],
          );
        },
      ),
    );
  }
}

// ───────────────────────────────────────────── unmatched M-Pesa

class _UnmatchedList extends ConsumerWidget {
  const _UnmatchedList();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(staffApiProvider);
    final version = ref.watch(listsVersionProvider);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final scheme = Theme.of(context).colorScheme;
    return PagedList<Inbound>(
      resetKey: version,
      header: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(
            color: dark
                ? HodiColors.info.withValues(alpha: 0.20)
                : const Color(0xFFEBF1FA),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: HodiColors.info.withValues(alpha: 0.22)),
          ),
          child: Text(
            'M-Pesa payments Hodi couldn’t match to a tenant. Assign each one, or ignore it if it isn’t rent.',
            style: TextStyle(
              fontSize: 12.5,
              height: 1.4,
              color: dark ? Colors.white : HodiColors.navy,
            ),
          ),
        ),
      ),
      load: (page) async {
        final p = await api.inbound(page: page);
        return (rows: p.rows, hasMore: p.hasMore);
      },
      empty: const EmptyState(
        icon: Icons.task_alt,
        title: 'All matched',
        body: 'Every M-Pesa payment has been matched to a tenant.',
      ),
      itemBuilder: (context, t) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
        child: Card(
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () => context.push('/staff/money/mpesa/${t.id}'),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Kicker(
                              '${t.providerRef} · ${formatTimestamp(t.occurredAt)}',
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${formatKes(t.amount)} · ${t.payerName ?? t.payerPhone ?? 'Unknown payer'}',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: dark ? Colors.white : HodiColors.navy,
                              ),
                            ),
                            if (t.payerPhone != null) ...[
                              const SizedBox(height: 2),
                              Text(
                                t.payerPhone!,
                                style: TextStyle(
                                  fontSize: 12.5,
                                  color: scheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const StatusChip('Review', tone: Tone.info),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: dark
                          ? scheme.surfaceContainerLowest
                          : HodiColors.canvas,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        Text(
                          'Account typed: ',
                          style: TextStyle(
                            fontSize: 12,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                        Expanded(
                          child: Text(
                            t.accountRef ?? '—',
                            style: TextStyle(
                              fontFamily: 'JetBrainsMono',
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: dark ? Colors.white : HodiColors.navy,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Text(
                          t.channelName,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (t.suggestions.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: dark
                            ? HodiColors.limeSoftDark
                            : HodiColors.limeSoft,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Kicker(
                            'Likely match',
                            color: dark ? HodiColors.lime : HodiColors.limeText,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${t.suggestions.first.tenant.name} · ${t.suggestions.first.reason}',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: dark ? Colors.white : HodiColors.navy,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// One inbound M-Pesa transaction: assign it to a tenant (records a payment, oldest
/// invoices first) or ignore it with a reason.
class InboundDetailScreen extends ConsumerStatefulWidget {
  const InboundDetailScreen({super.key, required this.inboundId});
  final String inboundId;
  @override
  ConsumerState<InboundDetailScreen> createState() =>
      _InboundDetailScreenState();
}

class _InboundDetailScreenState extends ConsumerState<InboundDetailScreen> {
  bool _busy = false;
  String? _error;

  Future<void> _assign(Inbound t, TenantRef tenant) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Assign this payment?'),
        content: Text(
          '${formatKes(t.amount)} (${t.providerRef}) will be recorded as a payment from '
          '${tenant.name}, paying their oldest invoices first.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Assign'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final done = await ref
          .read(staffApiProvider)
          .assignInbound(t.id, tenant.id);
      if (!mounted) return;
      invalidateAfterPayment(ref, tenantId: tenant.id);
      ref.invalidate(inboundProvider(t.id));
      showMessage(
        context,
        done.paymentNumber != null
            ? 'Recorded as ${done.paymentNumber} for ${tenant.name}.'
            : 'Assigned to ${tenant.name}.',
      );
    } on ApiError catch (e) {
      if (!mounted) return;
      if (e.code == 'ALREADY_RESOLVED') ref.invalidate(inboundProvider(t.id));
      setState(() => _error = staffErrorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _ignore(Inbound t) async {
    final reason = await showDialog<String>(
      context: context,
      builder: (_) => const _IgnoreDialog(),
    );
    if (reason == null || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(staffApiProvider).ignoreInbound(t.id, reason);
      if (!mounted) return;
      ref.invalidate(inboundProvider(t.id));
      ref.invalidate(dashboardProvider);
      ref.read(listsVersionProvider.notifier).state++;
      showMessage(context, 'Ignored. It won’t be counted as rent.');
    } on ApiError catch (e) {
      if (mounted) {
        setState(
          () => _error = e.fieldErrors['reason'] ?? staffErrorMessage(e),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickTenant(Inbound t) async {
    final tenant = await showModalBottomSheet<TenantRef>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => const TenantPicker(),
    );
    if (tenant != null && mounted) await _assign(t, tenant);
  }

  @override
  Widget build(BuildContext context) {
    final item = ref.watch(inboundProvider(widget.inboundId));
    final canUpdate = can(ref, 'reconciliation:update');
    return Scaffold(
      appBar: KodiHubAppBar(
        title: Text(item.valueOrNull?.providerRef ?? 'M-Pesa payment'),
        subtitle: item.valueOrNull?.channelName,
      ),
      body: AsyncBody(
        value: item,
        onRetry: () => ref.invalidate(inboundProvider(widget.inboundId)),
        data: (t) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SectionCard(
              title: formatKes(t.amount),
              trailing: StatusChip(
                switch (t.matchStatus) {
                  'MATCHED' => 'Matched',
                  'IGNORED' => 'Ignored',
                  _ => 'Unmatched',
                },
                tone: t.matchStatus == 'UNMATCHED'
                    ? Tone.warn
                    : (t.matchStatus == 'MATCHED' ? Tone.good : Tone.neutral),
              ),
              children: [
                FactRow('M-Pesa code', t.providerRef),
                FactRow('When', formatTimestamp(t.occurredAt)),
                if (t.payerName != null) FactRow('Payer', t.payerName!),
                if (t.payerPhone != null) FactRow('Phone', t.payerPhone!),
                if (t.accountRef != null)
                  FactRow('Account entered', t.accountRef!),
                FactRow('Into', t.channelName),
                if (t.tenant != null)
                  FactRow(
                    'Tenant',
                    t.tenant!.name,
                    onTap: can(ref, 'tenants:view')
                        ? () => context.push('/staff/tenants/${t.tenant!.id}')
                        : null,
                  ),
                if (t.paymentNumber != null)
                  FactRow(
                    'Payment',
                    t.paymentNumber!,
                    onTap: t.paymentId != null && can(ref, 'payments:view')
                        ? () => context.push(
                            '/staff/money/payments/${t.paymentId}',
                          )
                        : null,
                  ),
                if (t.ignoredReason != null)
                  FactRow('Ignored because', t.ignoredReason!),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              ErrorBox(_error!),
            ],
            if (t.matchStatus == 'UNMATCHED' && canUpdate) ...[
              if (t.suggestions.isNotEmpty) ...[
                const SizedBox(height: 12),
                SectionCard(
                  title: 'Suggested tenants',
                  children: [
                    for (final s in t.suggestions)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(s.tenant.name),
                        subtitle: Text('${s.tenant.code} · ${s.reason}'),
                        trailing: TextButton(
                          onPressed: _busy ? null : () => _assign(t, s.tenant),
                          child: const Text('Assign'),
                        ),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 16),
              FilledButton.icon(
                key: const Key('inbound-assign'),
                icon: const Icon(Icons.person_search_outlined),
                label: const Text('Assign to a tenant'),
                onPressed: _busy || !can(ref, 'tenants:view')
                    ? null
                    : () => _pickTenant(t),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                key: const Key('inbound-ignore'),
                onPressed: _busy ? null : () => _ignore(t),
                child: const Text('Ignore (not rent)'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _IgnoreDialog extends StatefulWidget {
  const _IgnoreDialog();
  @override
  State<_IgnoreDialog> createState() => _IgnoreDialogState();
}

class _IgnoreDialogState extends State<_IgnoreDialog> {
  final _c = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Ignore this payment'),
    content: TextField(
      controller: _c,
      autofocus: true,
      maxLength: 300,
      decoration: InputDecoration(
        labelText: 'Reason',
        hintText: 'e.g. Not rent: supplier refund',
        errorText: _error,
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('Cancel'),
      ),
      TextButton(
        onPressed: () {
          final r = _c.text.trim();
          if (r.length < 3) {
            setState(() => _error = 'Say why, in a few words.');
            return;
          }
          Navigator.of(context).pop(r);
        },
        child: const Text('Ignore'),
      ),
    ],
  );
}

/// Search tenants and pick one (returns a [TenantRef]).
class TenantPicker extends ConsumerStatefulWidget {
  const TenantPicker({super.key});
  @override
  ConsumerState<TenantPicker> createState() => _TenantPickerState();
}

class _TenantPickerState extends ConsumerState<TenantPicker> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final api = ref.watch(staffApiProvider);
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.75,
      child: Column(
        children: [
          SearchField(
            hint: 'Name, phone or tenant code',
            onChanged: (v) => setState(() => _q = v),
          ),
          Expanded(
            child: PagedList<Tenant>(
              resetKey: _q,
              load: (page) async {
                final p = await api.tenants(page: page, q: _q);
                return (rows: p.rows, hasMore: p.hasMore);
              },
              empty: const EmptyState(title: 'No tenants match'),
              itemBuilder: (context, t) => ListTile(
                title: Text(t.name),
                subtitle: Text('${t.ref.code} · ${t.ref.phone}'),
                onTap: () => Navigator.of(context).pop(t.ref),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InvoiceRunSheet extends ConsumerStatefulWidget {
  const _InvoiceRunSheet();

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => const _InvoiceRunSheet(),
  );

  @override
  ConsumerState<_InvoiceRunSheet> createState() => _InvoiceRunSheetState();
}

class _InvoiceRunSheetState extends ConsumerState<_InvoiceRunSheet> {
  late final _date = TextEditingController(text: toDay(nairobiToday()));
  bool _running = false;
  String? _error;

  @override
  void dispose() {
    _date.dispose();
    super.dispose();
  }

  Future<void> _run() async {
    setState(() {
      _running = true;
      _error = null;
    });
    try {
      final d = _date.text.trim();
      final res = await ref.read(staffApiProvider).runInvoices({
        if (d.isNotEmpty) 'date': d,
      });
      ref.read(listsVersionProvider.notifier).state++;
      ref.invalidate(dashboardProvider);
      if (mounted) {
        final created = res['created'] ?? 0;
        showMessage(context, 'Invoice run finished ($created created).');
        Navigator.of(context).pop();
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = staffErrorMessage(e));
    } finally {
      if (mounted) setState(() => _running = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        4,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Run monthly invoices',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _date,
            decoration: const InputDecoration(
              labelText: 'Billing date (YYYY-MM-DD)',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            ErrorBox(_error!),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _running ? null : _run,
            child: KodiHubButtonChild(
              loading: _running,
              label: 'Generate invoices',
              loadingLabel: 'Running…',
              tone: SpinnerTone.navy,
            ),
          ),
        ],
      ),
    );
  }
}

class _AdHocInvoiceSheet extends ConsumerStatefulWidget {
  const _AdHocInvoiceSheet();

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => const _AdHocInvoiceSheet(),
  );

  @override
  ConsumerState<_AdHocInvoiceSheet> createState() => _AdHocInvoiceSheetState();
}

class _AdHocInvoiceSheetState extends ConsumerState<_AdHocInvoiceSheet> {
  TenantRef? _tenant;
  final _desc = TextEditingController();
  final _amount = TextEditingController();
  late final DateTime _dueDate = nairobiToday().add(const Duration(days: 5));
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _desc.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final cents = parseKes(_amount.text);
    if (_tenant == null ||
        _desc.text.trim().isEmpty ||
        cents == null ||
        cents <= 0) {
      setState(
        () => _error = 'Choose a tenant, description and amount in KES.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final t = await ref.read(staffApiProvider).tenant(_tenant!.id);
      if (t.units.isEmpty) {
        setState(
          () => _error = 'This tenant does not have an active tenancy yet.',
        );
        return;
      }
      await ref.read(staffApiProvider).createInvoice({
        'tenancyId': t.units.first.tenancyId,
        'dueDate': toDay(_dueDate),
        'lines': [
          {'description': _desc.text.trim(), 'amount': cents},
        ],
      });
      invalidateAfterPayment(ref, tenantId: _tenant!.id);
      if (mounted) {
        showMessage(context, 'Invoice issued.');
        Navigator.of(context).pop();
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = staffErrorMessage(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        4,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'New ad-hoc invoice',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              icon: const Icon(Icons.person_search_outlined),
              label: Text(
                _tenant == null
                    ? 'Choose tenant'
                    : '${_tenant!.name} (${_tenant!.code})',
              ),
              onPressed: () async {
                final picked = await showModalBottomSheet<TenantRef>(
                  context: context,
                  isScrollControlled: true,
                  useSafeArea: true,
                  showDragHandle: true,
                  builder: (_) => const TenantPicker(),
                );
                if (picked != null) setState(() => _tenant = picked);
              },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _desc,
              decoration: const InputDecoration(
                labelText: 'Line description',
                hintText: 'e.g. Lock replacement fee',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(labelText: 'Amount (KES)'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              ErrorBox(_error!),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Issuing…' : 'Issue invoice'),
            ),
          ],
        ),
      ),
    );
  }
}

class _InvoiceActions {
  static Future<void> creditNote(
    BuildContext context,
    WidgetRef ref, {
    required String invoiceId,
    required String tenantId,
    required int maxBalance,
  }) async {
    final amountCtrl = TextEditingController(text: '${maxBalance ~/ 100}');
    final reasonCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Issue credit note'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: amountCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Amount (KES)'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: reasonCtrl,
              decoration: const InputDecoration(labelText: 'Reason'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Issue'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final cents = parseKes(amountCtrl.text);
    if (cents == null || cents <= 0 || reasonCtrl.text.trim().isEmpty) return;
    try {
      await ref.read(staffApiProvider).createCreditNote(invoiceId, {
        'amount': cents,
        'reason': reasonCtrl.text.trim(),
      });
      invalidateAfterPayment(ref, tenantId: tenantId);
      if (context.mounted) showMessage(context, 'Credit note issued.');
    } on ApiError catch (e) {
      if (context.mounted) showMessage(context, staffErrorMessage(e));
    }
  }

  static Future<void> voidInvoice(
    BuildContext context,
    WidgetRef ref, {
    required String invoiceId,
    required String tenantId,
  }) async {
    final reasonCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Void this invoice?'),
        content: TextField(
          controller: reasonCtrl,
          decoration: const InputDecoration(labelText: 'Reason for voiding'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Void'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted || reasonCtrl.text.trim().isEmpty) {
      return;
    }
    try {
      await ref
          .read(staffApiProvider)
          .voidInvoice(invoiceId, reasonCtrl.text.trim());
      invalidateAfterPayment(ref, tenantId: tenantId);
      if (context.mounted) showMessage(context, 'Invoice voided.');
    } on ApiError catch (e) {
      if (context.mounted) showMessage(context, staffErrorMessage(e));
    }
  }
}
