import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_error.dart';
import '../../../core/dates.dart';
import '../../../core/files.dart';
import '../../../core/money.dart';
import '../../../core/providers.dart';
import '../../../core/widgets/common.dart';
import '../staff_api.dart';
import '../staff_models.dart';
import '../staff_widgets.dart';

/// Pure checks for the record-payment form, after the web app's `payments/rules.ts`.
abstract final class PaymentRules {
  static bool isMpesa(String? kind) =>
      kind == 'MPESA_PAYBILL' || kind == 'MPESA_TILL';

  /// M-Pesa codes upper case without spaces; anything else trimmed.
  static String normaliseReference(String? kind, String input) {
    final t = input.trim();
    return isMpesa(kind) ? t.replaceAll(RegExp(r'\s+'), '').toUpperCase() : t;
  }

  static String? checkReference(String? kind, String input) {
    final t = normaliseReference(kind, input);
    if (isMpesa(kind) && t.isEmpty) {
      return 'Enter the M-Pesa code from the message.';
    }
    if (isMpesa(kind) && !RegExp(r'^[A-Z0-9]{6,20}$').hasMatch(t)) {
      return 'An M-Pesa code is letters and digits only, e.g. SJR4XK2L9P.';
    }
    if (kind == 'CHEQUE' && t.isEmpty) return 'Enter the cheque number.';
    return null;
  }

  static String? checkAmount(String input) {
    final cents = parseKes(input);
    if (cents == null) return 'Enter the amount in KES, e.g. 25,000.';
    if (cents <= 0) return 'Enter an amount above zero.';
    return null;
  }

  /// [amount] cents shared over the open invoices: [preferId] first, then oldest due
  /// first. What is left over stays with the tenant as credit (no line for it).
  static List<({String invoiceId, int amount})> allocate(
    int amount,
    List<OpenInvoice> invoices,
    String preferId,
  ) {
    final ordered = [...invoices]
      ..sort((a, b) => a.dueDate.compareTo(b.dueDate));
    final preferred = ordered.where((i) => i.id == preferId).toList();
    ordered.removeWhere((i) => i.id == preferId);
    var left = amount;
    final out = <({String invoiceId, int amount})>[];
    for (final i in [...preferred, ...ordered]) {
      if (left <= 0) break;
      final share = left < i.balance ? left : i.balance;
      if (share > 0) out.add((invoiceId: i.id, amount: share));
      left -= share;
    }
    return out;
  }
}

/// Record money received by cash, cheque, bank slip or an M-Pesa code typed in
/// (`POST /payments`). One Idempotency-Key per attempt at this payment: a resubmit of the
/// same details (after a dropped connection) reuses it, so the server answers with the
/// payment it already made. Changing a detail starts a new attempt (a new key), as on the
/// web — the server refuses a reused key with different details.
class RecordPaymentSheet extends ConsumerStatefulWidget {
  const RecordPaymentSheet({super.key, this.tenant, this.newKey});

  /// Fixes the tenant (opened from their page). Null = search for one.
  final TenantRef? tenant;

  /// Tests inject the key factory; the app uses [ApiClient.newIdempotencyKey].
  final String Function()? newKey;

  static Future<void> show(BuildContext context, {TenantRef? tenant}) =>
      showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => RecordPaymentSheet(tenant: tenant),
      );

  @override
  ConsumerState<RecordPaymentSheet> createState() => _RecordPaymentSheetState();
}

class _RecordPaymentSheetState extends ConsumerState<RecordPaymentSheet> {
  late TenantRef? _tenant = widget.tenant;
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  final _paidBy = TextEditingController();
  final _note = TextEditingController();
  late DateTime _receivedOn = nairobiToday();
  String? _channelId;
  String _invoiceId = '';
  bool _notify = true;

  late String _key = _makeKey();
  Map<String, String> _errors = {};
  String? _general;
  bool _saving = false;
  Payment? _result;

  // Tenant search (when the tenant isn't fixed).
  String _query = '';
  Future<List<Tenant>>? _matches;

  String _makeKey() => (widget.newKey ?? ApiClient.newIdempotencyKey)();

  /// Something changed: this is now a different payment from any earlier attempt.
  void _touch() => _key = _makeKey();

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
    _paidBy.dispose();
    _note.dispose();
    super.dispose();
  }

  Channel? _channel(List<Channel> channels) {
    for (final c in channels) {
      if (c.id == _channelId) return c;
    }
    return null;
  }

  Future<void> _submit(List<Channel> channels, List<OpenInvoice> open) async {
    if (_saving) return;
    final channel = _channel(channels);
    final found = <String, String>{};
    if (_tenant == null) {
      found['tenantId'] = 'Find and choose the tenant who paid.';
    }
    final amountError = PaymentRules.checkAmount(_amount.text);
    if (amountError != null) found['amount'] = amountError;
    if (channel == null) found['channelId'] = 'Choose how the money came in.';
    if (_receivedOn.isAfter(nairobiToday())) {
      found['receivedAt'] = 'The money can’t have been received in the future.';
    }
    final refError = PaymentRules.checkReference(
      channel?.kind,
      _reference.text,
    );
    if (refError != null) found['reference'] = refError;
    setState(() {
      _errors = found;
      _general = null;
    });
    if (found.isNotEmpty) return;

    final cents = parseKes(_amount.text)!;
    final body = <String, Object?>{
      'tenantId': _tenant!.id,
      'channelId': channel!.id,
      'amount': cents,
      'receivedAt': toDay(_receivedOn),
      'notifyTenant': _notify,
    };
    final reference = PaymentRules.normaliseReference(
      channel.kind,
      _reference.text,
    );
    if (reference.isNotEmpty) body['reference'] = reference;
    if (_paidBy.text.trim().isNotEmpty) body['paidBy'] = _paidBy.text.trim();
    if (_note.text.trim().isNotEmpty) body['note'] = _note.text.trim();
    if (_invoiceId.isNotEmpty) {
      body['allocations'] = [
        for (final a in PaymentRules.allocate(cents, open, _invoiceId))
          {'invoiceId': a.invoiceId, 'amount': a.amount},
      ];
    }

    setState(() => _saving = true);
    try {
      final payment = await ref
          .read(staffApiProvider)
          .recordPayment(body, _key);
      if (!mounted) return;
      invalidateAfterPayment(ref, tenantId: _tenant!.id);
      setState(() => _result = payment);
    } on ApiError catch (e) {
      if (!mounted) return;
      final fields = Map.of(e.fieldErrors)..remove('Idempotency-Key');
      if (e.code == 'DUPLICATE_REFERENCE') {
        fields['reference'] = staffErrorMessage(e);
      } else if (e.code == 'CHANNEL_INACTIVE') {
        fields['channelId'] = staffErrorMessage(e);
      }
      const known = {
        'tenantId',
        'amount',
        'channelId',
        'receivedAt',
        'reference',
        'paidBy',
        'note',
      };
      final shown = {
        for (final f in fields.entries)
          if (known.contains(f.key)) f.key: f.value,
      };
      setState(() {
        _errors = shown;
        _general = shown.isEmpty || fields.length > shown.length
            ? staffErrorMessage(e)
            : null;
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: result != null ? _done(result) : _form(),
    );
  }

  Widget _done(Payment p) {
    final text = Theme.of(context).textTheme;
    return _Scroll(
      children: [
        Text('Payment recorded — ${p.number}', style: text.titleLarge),
        const SizedBox(height: 8),
        Text(
          '${formatKes(p.amount)} from ${p.tenant.name}, received ${formatDay(p.receivedAt)}.',
        ),
        const SizedBox(height: 12),
        FactRow('Held as credit', formatKes(p.unallocated)),
        FactRow(
          'Receipt notification',
          p.receiptSent == true
              ? 'Sent'
              : _notify
              ? 'Not sent'
              : 'Not requested',
        ),
        if (p.receiptSent != true && _notify)
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text(
              'The receipt notification could not be sent. The payment is saved; give the tenant the PDF receipt instead.',
            ),
          ),
        const SizedBox(height: 8),
        Text('Allocated to', style: text.titleSmall),
        if (p.allocations.isEmpty)
          const Text(
            'No invoices — the whole amount is the tenant’s credit and will be used on their next invoice.',
          )
        else
          for (final a in p.allocations)
            FactRow(
              '${a.number} · ${formatPeriod(a.period)}',
              formatKes(a.amount),
            ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          icon: const Icon(Icons.picture_as_pdf_outlined),
          label: const Text('Open receipt'),
          onPressed: () =>
              openApiPdf(
                ref.read(apiClientProvider),
                '/payments/${p.id}/receipt',
                '${p.number}.pdf',
              ).catchError((Object _) {
                if (mounted) showMessage(context, 'Couldn’t open the receipt.');
              }),
        ),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Done'),
        ),
      ],
    );
  }

  Widget _form() {
    final canChannels = can(ref, 'channels:view');
    final channels = canChannels
        ? ref.watch(channelsProvider)
        : const AsyncValue<List<Channel>>.data([]);
    final tenant = _tenant;
    final open = tenant == null || !can(ref, 'payments:view')
        ? const AsyncValue<List<OpenInvoice>>.data([])
        : ref.watch(openInvoicesProvider(tenant.id));
    final channelRows = [...(channels.valueOrNull ?? const <Channel>[])]
      ..sort((a, b) => a.name.compareTo(b.name));
    final channel = _channel(channelRows);
    final openRows = open.valueOrNull ?? const <OpenInvoice>[];
    final owed = openRows.fold<int>(0, (s, i) => s + i.balance);
    final cents = parseKes(_amount.text) ?? 0;

    return _Scroll(
      children: [
        Text('Record a payment', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        _tenantField(tenant),
        const SizedBox(height: 12),
        TextField(
          key: const Key('pay-amount'),
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => setState(_touch),
          decoration: InputDecoration(
            labelText: 'Amount received (KES)',
            helperText: owed > 0
                ? 'Open invoices come to ${formatKes(owed)}.'
                : 'In KES, e.g. 25,000.',
            errorText: _errors['amount'],
          ),
        ),
        const SizedBox(height: 12),
        if (!canChannels)
          const Text(
            'Your role cannot list payment channels, so it can’t record payments here.',
          )
        else if (channels.hasError)
          ErrorBox(staffErrorMessage(channels.error!))
        else
          DropdownButtonFormField<String>(
            key: const Key('pay-channel'),
            initialValue: _channelId,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: 'Channel',
              errorText: _errors['channelId'],
              helperText: channels.isLoading
                  ? 'Loading…'
                  : channelRows.isEmpty
                  ? 'There are no active payment channels. Add one on the web app first.'
                  : null,
            ),
            items: [
              for (final c in channelRows)
                DropdownMenuItem(
                  value: c.id,
                  child: Text(
                    '${c.name} (${channelKindLabel[c.kind] ?? c.kind})',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (v) => setState(() {
              _channelId = v;
              _touch();
            }),
          ),
        const SizedBox(height: 12),
        InkWell(
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: _receivedOn,
              firstDate: DateTime(2000),
              lastDate: nairobiToday(),
              helpText: 'Received on',
            );
            if (picked != null) {
              setState(() {
                _receivedOn = picked;
                _touch();
              });
            }
          },
          child: InputDecorator(
            decoration: InputDecoration(
              labelText: 'Received on',
              helperText: 'The day the money came in, not today’s entry date.',
              errorText: _errors['receivedAt'],
              suffixIcon: const Icon(Icons.calendar_today_outlined),
            ),
            child: Text(formatDay(toDay(_receivedOn))),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('pay-reference'),
          controller: _reference,
          textCapitalization: PaymentRules.isMpesa(channel?.kind)
              ? TextCapitalization.characters
              : TextCapitalization.none,
          maxLength: 60,
          onChanged: (_) => setState(_touch),
          decoration: InputDecoration(
            labelText: referenceLabel(channel?.kind),
            helperText: referenceHint(channel?.kind),
            errorText: _errors['reference'],
            counterText: '',
          ),
        ),
        if (openRows.isNotEmpty) ...[
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            key: const Key('pay-invoice'),
            initialValue: _invoiceId,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Pay towards',
              helperText: 'Anything left over is kept as the tenant’s credit.',
            ),
            items: [
              const DropdownMenuItem(
                value: '',
                child: Text('Oldest invoices first (automatic)'),
              ),
              for (final i in openRows)
                DropdownMenuItem(
                  value: i.id,
                  child: Text(
                    '${i.number} · ${formatPeriod(i.period)} · ${formatKes(i.balance)}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (v) => setState(() {
              _invoiceId = v ?? '';
              _touch();
            }),
          ),
        ],
        const SizedBox(height: 12),
        TextField(
          controller: _paidBy,
          maxLength: 120,
          onChanged: (_) => _touch(),
          decoration: InputDecoration(
            labelText: 'Paid by (optional)',
            helperText: 'If someone else paid, e.g. a parent or employer.',
            errorText: _errors['paidBy'],
            counterText: '',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _note,
          maxLength: 300,
          onChanged: (_) => _touch(),
          decoration: InputDecoration(
            labelText: 'Note (optional)',
            errorText: _errors['note'],
            counterText: '',
          ),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Send receipt to the tenant (SMS & email)'),
          value: _notify,
          onChanged: (v) => setState(() {
            _notify = v;
            _touch();
          }),
        ),
        if (_general != null) ...[
          ErrorBox(_general!),
          const SizedBox(height: 12),
        ],
        FilledButton(
          key: const Key('pay-submit'),
          onPressed: _saving || !canChannels
              ? null
              : () => _submit(channelRows, openRows),
          child: Text(
            _saving
                ? 'Recording…'
                : cents > 0
                ? 'Record ${formatKes(cents)}'
                : 'Record payment',
          ),
        ),
      ],
    );
  }

  Widget _tenantField(TenantRef? tenant) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    if (tenant != null) {
      return InputDecorator(
        decoration: InputDecoration(
          labelText: 'Tenant',
          errorText: _errors['tenantId'],
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                '${tenant.name} · ${tenant.code}',
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (widget.tenant == null)
              TextButton(
                onPressed: () => setState(() {
                  _tenant = null;
                  _invoiceId = '';
                  _touch();
                }),
                child: const Text('Change'),
              ),
          ],
        ),
      );
    }
    if (!can(ref, 'tenants:view')) {
      return Text(
        'Your role cannot look up tenants. Record the payment from the tenant’s page instead.',
        style: TextStyle(color: muted),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          key: const Key('pay-tenant-search'),
          decoration: InputDecoration(
            labelText: 'Tenant',
            hintText: 'Search by name, phone or tenant code',
            prefixIcon: const Icon(Icons.search),
            errorText: _errors['tenantId'],
          ),
          onChanged: (v) {
            final q = v.trim();
            setState(() {
              _query = q;
              _matches = q.isEmpty
                  ? null
                  : ref
                        .read(staffApiProvider)
                        .tenants(page: 1, q: q)
                        .then((p) => p.rows);
            });
          },
        ),
        if (_matches != null)
          FutureBuilder<List<Tenant>>(
            key: ValueKey(_query),
            future: _matches,
            builder: (context, snap) {
              if (snap.hasError) {
                return ErrorBox(staffErrorMessage(snap.error!));
              }
              if (!snap.hasData) {
                return const Padding(
                  padding: EdgeInsets.all(8),
                  child: LinearProgressIndicator(),
                );
              }
              final rows = snap.data!.take(8).toList();
              if (rows.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.all(8),
                  child: Text(
                    'No tenants match.',
                    style: TextStyle(color: muted),
                  ),
                );
              }
              return Column(
                children: [
                  for (final t in rows)
                    ListTile(
                      dense: true,
                      title: Text(t.name),
                      subtitle: Text('${t.ref.code} · ${t.ref.phone}'),
                      onTap: () => setState(() {
                        _tenant = t.ref;
                        _matches = null;
                        _touch();
                      }),
                    ),
                ],
              );
            },
          ),
      ],
    );
  }
}

/// The form's scrolling column (not lazy, so every field exists for focus and tests).
class _Scroll extends StatelessWidget {
  const _Scroll({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: children,
    ),
  );
}
