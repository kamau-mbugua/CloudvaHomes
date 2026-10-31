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
import '../../../core/widgets/stk_sheet.dart';
import '../staff_api.dart';
import '../staff_models.dart';
import '../staff_widgets.dart';
import 'record_payment_sheet.dart';

/// Tenants tab: search, paged.
class TenantsScreen extends ConsumerStatefulWidget {
  const TenantsScreen({super.key});
  @override
  ConsumerState<TenantsScreen> createState() => _TenantsScreenState();
}

class _TenantsScreenState extends ConsumerState<TenantsScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(staffApiProvider);
    final version = ref.watch(listsVersionProvider);
    return StaffTabScaffold(
      title: 'Tenants',
      floatingActionButton: can(ref, 'tenants:create')
          ? FloatingActionButton.extended(
              heroTag: 'fab-tenants',
              icon: const Icon(Icons.person_add_outlined),
              label: const Text('Add tenant'),
              onPressed: () => _TenantFormSheet.show(context),
            )
          : null,
      body: !can(ref, 'tenants:view')
          ? const NoPermission('tenants')
          : Column(
              children: [
                SearchField(
                  hint: 'Name, phone or tenant code',
                  onChanged: (v) => setState(() => _q = v),
                ),
                Expanded(
                  child: PagedList<Tenant>(
                    resetKey: (_q, version),
                    load: (page) async {
                      final p = await api.tenants(page: page, q: _q);
                      return (rows: p.rows, hasMore: p.hasMore);
                    },
                    empty: EmptyState(
                      icon: Icons.people_outline,
                      title: _q.isEmpty ? 'No tenants yet' : 'No tenants match',
                      body: _q.isEmpty
                          ? 'Tenants are added on the web app.'
                          : 'Try a different name, phone or code.',
                    ),
                    itemBuilder: (context, t) => _TenantTile(t),
                  ),
                ),
              ],
            ),
    );
  }
}

class _TenantTile extends StatelessWidget {
  const _TenantTile(this.t);
  final Tenant t;
  @override
  Widget build(BuildContext context) {
    final units = t.units.map((u) => '${u.unitNumber}, ${u.propertyName}');
    final balance = t.balance;
    return ListTile(
      title: Text(t.name),
      subtitle: Text(
        [t.ref.code, if (units.isNotEmpty) units.join(' · ')].join(' · '),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: balance == null
          ? null
          : balance > 0
          ? StatusChip(formatKes(balance), tone: Tone.bad)
          : balance < 0
          ? StatusChip('${formatKes(-balance)} credit', tone: Tone.good)
          : const StatusChip('Paid up', tone: Tone.good),
      onTap: () => context.push('/staff/tenants/${t.id}'),
    );
  }
}

/// One tenant: contacts, balance, deposit, open invoices, statement, recent payments and
/// the money actions (each shown only with its permission).
class TenantDetailScreen extends ConsumerWidget {
  const TenantDetailScreen({super.key, required this.tenantId});
  final String tenantId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenant = ref.watch(tenantProvider(tenantId));
    final canPayments = can(ref, 'payments:view');
    return Scaffold(
      appBar: AppBar(
        title: Text(tenant.valueOrNull?.name ?? 'Tenant'),
        actions: [
          if (tenant.valueOrNull != null && can(ref, 'tenants:update'))
            IconButton(
              tooltip: 'Edit tenant',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () =>
                  _TenantFormSheet.show(context, existing: tenant.valueOrNull),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(tenantProvider(tenantId));
          ref.invalidate(openInvoicesProvider(tenantId));
          ref.invalidate(statementProvider(tenantId));
          ref.invalidate(tenantPaymentsProvider(tenantId));
          try {
            await ref.read(tenantProvider(tenantId).future);
          } catch (_) {
            // The screen shows the error with a retry.
          }
        },
        child: AsyncBody(
          value: tenant,
          onRetry: () => ref.invalidate(tenantProvider(tenantId)),
          data: (t) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _Contacts(t),
              const SizedBox(height: 12),
              _Balance(t, canPayments: canPayments),
              const SizedBox(height: 12),
              TenantActions(tenant: t),
              if (canPayments) ...[
                const SizedBox(height: 12),
                _OpenInvoices(t.id),
                const SizedBox(height: 12),
                _RecentPayments(t.id),
                const SizedBox(height: 12),
                _StatementCard(t),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Contacts extends ConsumerWidget {
  const _Contacts(this.t);
  final Tenant t;

  // Label above the number, so a full +254 number never wraps beside the two buttons.
  Widget _phone(BuildContext context, String label, String phone) => Row(
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontSize: 13,
              ),
            ),
            Text(phone, style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
      IconButton(
        tooltip: 'Call $phone',
        icon: const Icon(Icons.call_outlined),
        onPressed: () => launchOrSay(context, Uri(scheme: 'tel', path: phone)),
      ),
      IconButton(
        tooltip: 'Text $phone',
        icon: const Icon(Icons.sms_outlined),
        onPressed: () => launchOrSay(context, Uri(scheme: 'sms', path: phone)),
      ),
    ],
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canUnits = can(ref, 'units:view');
    return SectionCard(
      title: t.name,
      trailing: StatusChip(switch (t.status) {
        'CURRENT' => 'Current',
        'PAST' => 'Moved out',
        _ => 'Prospect',
      }, tone: t.status == 'CURRENT' ? Tone.good : Tone.neutral),
      children: [
        FactRow('Tenant code', t.ref.code),
        if (t.ref.phone.isNotEmpty) _phone(context, 'Phone', t.ref.phone),
        if (t.email != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Email',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                          fontSize: 13,
                        ),
                      ),
                      Text(
                        t.email!,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Email ${t.email}',
                  icon: const Icon(Icons.mail_outline),
                  onPressed: () => launchOrSay(
                    context,
                    Uri(scheme: 'mailto', path: t.email),
                  ),
                ),
              ],
            ),
          ),
        for (final u in t.units)
          FactRow(
            'Unit',
            '${u.unitNumber}, ${u.propertyName}',
            onTap: canUnits
                ? () => context.push('/staff/units/${u.unitId}')
                : null,
          ),
        if (t.emergencyPhone != null)
          _phone(
            context,
            'Emergency${t.emergencyName != null ? ' (${t.emergencyName})' : ''}',
            t.emergencyPhone!,
          ),
      ],
    );
  }
}

class _Balance extends ConsumerWidget {
  const _Balance(this.t, {required this.canPayments});
  final Tenant t;
  final bool canPayments;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final balance = t.balance ?? 0;
    final statement = canPayments ? ref.watch(statementProvider(t.id)) : null;
    final hasFooter = t.creditBalance > 0 || statement?.valueOrNull != null;
    return CurvedHeroCard(
      label: balance > 0 ? 'Owes' : (balance < 0 ? 'In credit' : 'Balance'),
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          t.ref.code,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      children: [
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            formatKes(balance.abs()),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),
        ),
        if (hasFooter) ...[
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Divider(color: Color(0x2EFFFFFF), height: 1),
          ),
          if (t.creditBalance > 0)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Unused credit',
                      style: TextStyle(color: Color(0xCCFFFFFF), fontSize: 13),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      formatKes(t.creditBalance),
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          if (statement?.valueOrNull != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Deposit held',
                      style: TextStyle(color: Color(0xCCFFFFFF), fontSize: 13),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      formatKes(statement!.value!.depositHeld),
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ],
    );
  }
}

/// Record payment · Send M-Pesa prompt · Send reminder, by permission.
class TenantActions extends ConsumerStatefulWidget {
  const TenantActions({super.key, required this.tenant});
  final Tenant tenant;
  @override
  ConsumerState<TenantActions> createState() => _TenantActionsState();
}

class _TenantActionsState extends ConsumerState<TenantActions> {
  bool _reminding = false;

  Future<void> _remind() async {
    setState(() => _reminding = true);
    try {
      final m = await ref.read(staffApiProvider).remind(widget.tenant.id);
      if (!mounted) return;
      showMessage(
        context,
        m.failed
            ? 'The reminder to ${m.to} failed${m.error != null ? ': ${m.error}' : ''}.'
            : (m.to.isEmpty ? 'Reminder sent.' : 'Reminder sent to ${m.to}.'),
      );
    } on ApiError catch (e) {
      if (mounted) showMessage(context, staffErrorMessage(e));
    } finally {
      if (mounted) setState(() => _reminding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.tenant;
    final canRecord = can(ref, 'payments:create');
    final canStk = canRecord && can(ref, 'channels:view');
    final canRemind = can(ref, 'tenants:update');
    if (!canRecord && !canRemind) return const SizedBox.shrink();
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        if (canRecord)
          FilledButton.icon(
            key: const Key('action-record-payment'),
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            icon: const Icon(Icons.payments_outlined),
            label: const Text('Record payment'),
            onPressed: () => RecordPaymentSheet.show(context, tenant: t.ref),
          ),
        if (canStk)
          OutlinedButton.icon(
            key: const Key('action-stk'),
            icon: const Icon(Icons.phone_iphone),
            label: const Text('Send M-Pesa prompt'),
            onPressed: () => sendMpesaPrompt(context, ref, t),
          ),
        if (canRemind)
          OutlinedButton.icon(
            key: const Key('action-remind'),
            icon: const Icon(Icons.sms_outlined),
            label: Text(_reminding ? 'Sending…' : 'Send reminder'),
            onPressed: _reminding ? null : _remind,
          ),
      ],
    );
  }
}

/// Chooses an M-Pesa channel (active, Daraja keys saved), then the STK sheet against
/// `POST /stk-requests`.
Future<void> sendMpesaPrompt(
  BuildContext context,
  WidgetRef ref,
  Tenant t,
) async {
  final api = ref.read(staffApiProvider);
  List<Channel> channels;
  try {
    channels = await ref.read(channelsProvider.future);
  } catch (e) {
    if (context.mounted) showMessage(context, staffErrorMessage(e));
    return;
  }
  final usable =
      channels
          .where((c) => c.status == 'ACTIVE' && c.isMpesa && c.darajaConfigured)
          .toList()
        ..sort((a, b) => a.name.compareTo(b.name));
  if (!context.mounted) return;
  if (usable.isEmpty) {
    showMessage(
      context,
      'No M-Pesa channel is connected yet. Add the Daraja keys to a paybill or till on the web app first.',
    );
    return;
  }
  final channel = usable.length == 1
      ? usable.first
      : await showDialog<Channel>(
          context: context,
          builder: (ctx) => SimpleDialog(
            title: const Text('Pay into'),
            children: [
              for (final c in usable)
                SimpleDialogOption(
                  onPressed: () => Navigator.of(ctx).pop(c),
                  child: Text(
                    '${c.name}${c.shortcode != null ? ' · ${c.shortcode}' : ''}',
                  ),
                ),
            ],
          ),
        );
  if (channel == null || !context.mounted) return;
  final owed = t.balance ?? 0;
  await StkPaySheet.show(
    context,
    StkPaySheet(
      title: 'Send M-Pesa prompt',
      intro:
          'A payment prompt goes to ${t.name}’s phone, paying into ${channel.name}. '
          'When they enter their PIN, the payment is recorded automatically.',
      defaultAmount: wholeShillingsUp(owed),
      defaultPhone: t.ref.phone,
      amountHint: owed > 0
          ? '${t.ref.firstName} owes ${formatKes(owed)}. Whole shillings only.'
          : null,
      submit: (amount, phone, key) => api.stkPush(
        tenantId: t.id,
        channelId: channel.id,
        amount: amount,
        phone: phone,
        key: key,
      ),
      poll: api.stkStatus,
      onFinished: (s) {
        if (s.state == 'SUCCESS' && context.mounted) {
          invalidateAfterPayment(ref, tenantId: t.id);
        }
      },
    ),
  );
}

class _OpenInvoices extends ConsumerWidget {
  const _OpenInvoices(this.tenantId);
  final String tenantId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final open = ref.watch(openInvoicesProvider(tenantId));
    return SectionCard(
      title: 'Open invoices',
      children: [
        AsyncBody(
          value: open,
          onRetry: () => ref.invalidate(openInvoicesProvider(tenantId)),
          data: (rows) => rows.isEmpty
              ? const Text('Nothing owing.')
              : Column(
                  children: [
                    for (final i in rows)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('${i.number} · ${formatPeriod(i.period)}'),
                        subtitle: Text('Due ${formatDay(i.dueDate)}'),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(formatKes(i.balance)),
                            if (i.overdue)
                              const StatusChip('Overdue', tone: Tone.bad),
                          ],
                        ),
                        onTap: can(ref, 'invoices:view')
                            ? () =>
                                  context.push('/staff/money/invoices/${i.id}')
                            : null,
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _RecentPayments extends ConsumerWidget {
  const _RecentPayments(this.tenantId);
  final String tenantId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(tenantPaymentsProvider(tenantId));
    return SectionCard(
      title: 'Recent payments',
      children: [
        AsyncBody(
          value: list,
          onRetry: () => ref.invalidate(tenantPaymentsProvider(tenantId)),
          data: (rows) => rows.isEmpty
              ? const Text('No payments yet.')
              : Column(
                  children: [
                    for (final p in rows)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(formatKes(p.amount)),
                        subtitle: Text(
                          '${p.number} · ${formatDay(p.receivedAt)} · ${channelKindLabel[p.method] ?? p.method}',
                        ),
                        onTap: () =>
                            context.push('/staff/money/payments/${p.id}'),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _StatementCard extends ConsumerWidget {
  const _StatementCard(this.t);
  final Tenant t;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final st = ref.watch(statementProvider(t.id));
    return SectionCard(
      title: 'Statement',
      trailing: IconButton(
        tooltip: 'Statement PDF',
        icon: const Icon(Icons.picture_as_pdf_outlined),
        onPressed: () =>
            openApiPdf(
              ref.read(apiClientProvider),
              '/tenants/${t.id}/statement/pdf',
              'Statement-${t.ref.code}.pdf',
            ).catchError((Object _) {
              if (context.mounted) {
                showMessage(context, 'Couldn’t open the PDF.');
              }
            }),
      ),
      children: [
        AsyncBody(
          value: st,
          onRetry: () => ref.invalidate(statementProvider(t.id)),
          data: (s) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              FactRow(
                'Opening balance (${formatDay(s.from)})',
                formatKes(s.openingBalance),
              ),
              const Divider(),
              if (s.entries.isEmpty) const Text('No entries in this period.'),
              for (final e in s.entries.reversed.take(12))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${statementTypeLabel[e.type] ?? e.type}${e.reference != null ? ' · ${e.reference}' : ''}',
                            ),
                            Text(
                              formatDay(e.date),
                              style: TextStyle(
                                fontSize: 12,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            e.debit != null
                                ? formatKes(e.debit!)
                                : '-${formatKes(e.credit ?? 0)}',
                          ),
                          Text(
                            formatKes(e.balance),
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              const Divider(),
              FactRow(
                'Closing balance (${formatDay(s.to)})',
                formatKes(s.closingBalance),
                bold: true,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TenantFormSheet extends ConsumerStatefulWidget {
  const _TenantFormSheet({this.existing});
  final Tenant? existing;

  static Future<void> show(BuildContext context, {Tenant? existing}) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => _TenantFormSheet(existing: existing),
      );

  @override
  ConsumerState<_TenantFormSheet> createState() => _TenantFormSheetState();
}

class _TenantFormSheetState extends ConsumerState<_TenantFormSheet> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _emName = TextEditingController();
  final _emPhone = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _first.text = e.ref.firstName;
      _last.text = e.ref.lastName;
      _phone.text = e.ref.phone;
      _email.text = e.email ?? '';
      _emName.text = e.emergencyName ?? '';
      _emPhone.text = e.emergencyPhone ?? '';
    }
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _phone.dispose();
    _email.dispose();
    _emName.dispose();
    _emPhone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_first.text.trim().isEmpty ||
        _last.text.trim().isEmpty ||
        _phone.text.trim().isEmpty) {
      setState(() => _error = 'Enter first name, last name and phone number.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final api = ref.read(staffApiProvider);
    final body = {
      'firstName': _first.text.trim(),
      'lastName': _last.text.trim(),
      'phone': _phone.text.trim(),
      if (_email.text.trim().isNotEmpty) 'email': _email.text.trim(),
      if (_emName.text.trim().isNotEmpty)
        'emergencyContactName': _emName.text.trim(),
      if (_emPhone.text.trim().isNotEmpty)
        'emergencyContactPhone': _emPhone.text.trim(),
    };
    try {
      if (widget.existing == null) {
        await api.createTenant(body);
      } else {
        await api.updateTenant(widget.existing!.id, body);
        ref.invalidate(tenantProvider(widget.existing!.id));
      }
      ref.read(listsVersionProvider.notifier).state++;
      if (mounted) {
        showMessage(
          context,
          widget.existing == null ? 'Tenant added.' : 'Tenant updated.',
        );
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
              widget.existing == null ? 'Add tenant' : 'Edit tenant',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _first,
                    decoration: const InputDecoration(labelText: 'First name'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _last,
                    decoration: const InputDecoration(labelText: 'Last name'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone number'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'Email address (optional)',
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _emName,
                    decoration: const InputDecoration(
                      labelText: 'Emergency contact (optional)',
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _emPhone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Emergency phone',
                    ),
                  ),
                ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              ErrorBox(_error!),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Saving…' : 'Save tenant'),
            ),
          ],
        ),
      ),
    );
  }
}
