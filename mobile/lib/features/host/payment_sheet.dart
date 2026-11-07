import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/money.dart';
import '../../core/widgets/stk_sheet.dart';
import 'host_api.dart';
import 'host_models.dart';

Future<void> showHostMpesaPromptSheet(
  BuildContext context,
  WidgetRef ref, {
  required HostBooking booking,
  VoidCallback? onPaid,
}) async {
  final api = ref.read(hostApiProvider);
  final owed = booking.owedCents ?? 0;
  await StkPaySheet.show(
    context,
    StkPaySheet(
      title: 'Send M-Pesa prompt',
      intro:
          'A payment prompt goes to ${booking.guestName}’s phone for booking ${booking.code}. '
          'When they enter their PIN, the payment is recorded automatically.',
      defaultAmount: wholeShillingsUp(owed),
      defaultPhone: booking.guestPhone,
      amountHint: owed > 0
          ? '${booking.guestName} owes ${formatKes(owed)}. Whole shillings only.'
          : null,
      submit: (amount, phone, key) => api.sendMpesaPrompt(
        booking.id,
        amountCents: amount,
        phone: phone,
        key: key,
      ),
      poll: api.stkStatus,
      onFinished: (s) {
        if (s.state == 'SUCCESS' && context.mounted) {
          onPaid?.call();
        }
      },
    ),
  );
}

Future<bool> showHostPaymentSheet(
  BuildContext context, {
  required String bookingId,
  required bool isRefund,
  int initialAmountCents = 0,
}) async {
  final res = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _HostPaymentSheet(
      bookingId: bookingId,
      isRefund: isRefund,
      initialAmountCents: initialAmountCents,
    ),
  );
  return res == true;
}

class _HostPaymentSheet extends ConsumerStatefulWidget {
  const _HostPaymentSheet({
    required this.bookingId,
    required this.isRefund,
    required this.initialAmountCents,
  });

  final String bookingId;
  final bool isRefund;
  final int initialAmountCents;

  @override
  ConsumerState<_HostPaymentSheet> createState() => _HostPaymentSheetState();
}

class _HostPaymentSheetState extends ConsumerState<_HostPaymentSheet> {
  late final TextEditingController _amountCtrl;
  final _refCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  String _method = 'CASH';
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _amountCtrl = TextEditingController(
      text: widget.initialAmountCents > 0
          ? (widget.initialAmountCents ~/ 100).toString()
          : '',
    );
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _refCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final minor = toHostMinorString(_amountCtrl.text);
    if (minor == null) {
      setState(() => _error = 'Use whole shillings (e.g. 2000).');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(hostApiProvider).recordStayPayment(widget.bookingId, {
        'kind': widget.isRefund ? 'REFUND' : 'PAYMENT',
        'method': _method,
        'amount': minor,
        if (_refCtrl.text.trim().isNotEmpty) 'reference': _refCtrl.text.trim(),
        if (_noteCtrl.text.trim().isNotEmpty) 'note': _noteCtrl.text.trim(),
      });
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = messageOf(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 8, 16, bottom + 16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.isRefund ? 'Record refund' : 'Record payment',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            if (_error != null) ...[
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              const SizedBox(height: 8),
            ],
            DropdownButtonFormField<String>(
              initialValue: _method,
              decoration: const InputDecoration(labelText: 'Method'),
              items: const [
                DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                DropdownMenuItem(value: 'MPESA', child: Text('M-Pesa')),
                DropdownMenuItem(value: 'BANK', child: Text('Bank transfer')),
                DropdownMenuItem(value: 'CARD', child: Text('Card')),
                DropdownMenuItem(value: 'OTHER', child: Text('Other')),
              ],
              onChanged: (v) {
                if (v != null) setState(() => _method = v);
              },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _amountCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Amount (KES)',
                helperText: 'Use whole shillings',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _refCtrl,
              decoration: const InputDecoration(
                labelText: 'Reference (optional)',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _noteCtrl,
              decoration: const InputDecoration(labelText: 'Note (optional)'),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _submit,
              child: Text(widget.isRefund ? 'Record refund' : 'Record payment'),
            ),
          ],
        ),
      ),
    );
  }
}
