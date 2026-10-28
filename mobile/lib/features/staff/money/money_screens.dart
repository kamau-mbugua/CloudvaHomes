import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_error.dart';
import '../../../core/dates.dart';
import '../../../core/files.dart';
import '../../../core/money.dart';
import '../../../core/providers.dart';
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
              title: Text('${formatKes(p.amount)} · ${p.tenant.name}'),
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

class PaymentDetailScreen extends ConsumerWidget {
  const PaymentDetailScreen({super.key, required this.paymentId});
  final String paymentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payment = ref.watch(paymentProvider(paymentId));
    final p = payment.valueOrNull;
    return Scaffold(
      appBar: AppBar(
        title: Text(p?.number ?? 'Payment'),
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
            SectionCard(
              title: formatKes(p.amount),
              trailing: p.isReversal
                  ? const StatusChip('Reversal', tone: Tone.bad)
                  : p.reversedByNumber != null
                  ? const StatusChip('Reversed')
                  : null,
              children: [
                FactRow('Received', formatDay(p.receivedAt)),
                FactRow(
                  'Method',
                  [
                    channelKindLabel[p.method] ?? p.method,
                    ?p.channelName,
                  ].join(' · '),
                ),
                if (p.reference != null) FactRow('Reference', p.reference!),
                if (p.paidBy != null) FactRow('Paid by', p.paidBy!),
                if (p.note != null) FactRow('Note', p.note!),
                if (p.unallocated > 0)
                  FactRow('Kept as credit', formatKes(p.unallocated)),
                if (p.recordedBy != null) FactRow('Recorded by', p.recordedBy!),
                if (p.reversedByNumber != null)
                  FactRow('Reversed by', p.reversedByNumber!),
                if (p.reversalReason != null)
                  FactRow('Reason', p.reversalReason!),
              ],
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: 'Tenant',
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(p.tenant.name),
                  subtitle: Text(p.tenant.code),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.go('/staff/tenants/${p.tenant.id}'),
                ),
              ],
            ),
            const SizedBox(height: 12),
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
                    trailing: Text(formatKes(a.amount)),
                    onTap: can(ref, 'invoices:view')
                        ? () => context.push(
                            '/staff/money/invoices/${a.invoiceId}',
                          )
                        : null,
                  ),
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
    return Column(
      children: [
        SearchField(
          hint: 'Invoice no., tenant or unit',
          onChanged: (v) => setState(() => _q = v),
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
              title: Text('${i.tenant.name} · ${formatKes(i.total)}'),
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

class InvoiceDetailScreen extends ConsumerWidget {
  const InvoiceDetailScreen({super.key, required this.invoiceId});
  final String invoiceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(invoiceProvider(invoiceId));
    final d = detail.valueOrNull;
    return Scaffold(
      appBar: AppBar(
        title: Text(d?.invoice.number ?? 'Invoice'),
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
              SectionCard(
                title: formatPeriod(i.period),
                trailing: invoiceStatusChip(i),
                children: [
                  FactRow('Unit', '${i.unitNumber}, ${i.propertyName}'),
                  FactRow('Issued', formatDay(i.issueDate)),
                  FactRow('Due', formatDay(i.dueDate)),
                  if (i.voidReason != null)
                    FactRow('Void because', i.voidReason!),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(i.tenant.name),
                    subtitle: Text(i.tenant.code),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.go('/staff/tenants/${i.tenant.id}'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
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
              ),
              if (d.creditNotes.isNotEmpty) ...[
                const SizedBox(height: 12),
                SectionCard(
                  title: 'Credit notes',
                  children: [
                    for (final c in d.creditNotes)
                      FactRow('${c.number} · ${c.reason}', formatKes(c.amount)),
                  ],
                ),
              ],
              if (d.payments.isNotEmpty) ...[
                const SizedBox(height: 12),
                SectionCard(
                  title: 'Payments',
                  children: [
                    for (final p in d.payments)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('${p.number} · ${formatDay(p.receivedAt)}'),
                        trailing: Text(formatKes(p.amount)),
                        onTap: can(ref, 'payments:view')
                            ? () =>
                                  context.push('/staff/money/payments/${p.id}')
                            : null,
                      ),
                  ],
                ),
              ],
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
    return PagedList<Inbound>(
      resetKey: version,
      header: const Padding(
        padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Text(
          'M-Pesa payments Hodi couldn’t match to a tenant. Assign each one, or ignore it if it isn’t rent.',
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
      itemBuilder: (context, t) => ListTile(
        title: Text(
          '${formatKes(t.amount)} · ${t.payerName ?? t.payerPhone ?? 'Unknown payer'}',
        ),
        subtitle: Text(
          '${t.providerRef} · ${formatTimestamp(t.occurredAt)}${t.accountRef != null ? ' · Acc ${t.accountRef}' : ''}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/staff/money/mpesa/${t.id}'),
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
      appBar: AppBar(
        title: Text(item.valueOrNull?.providerRef ?? 'M-Pesa payment'),
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
                if (t.tenant != null) FactRow('Tenant', t.tenant!.name),
                if (t.paymentNumber != null)
                  FactRow('Payment', t.paymentNumber!),
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
