import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/api_client.dart';
import '../api/api_error.dart';
import '../money.dart';
import 'common.dart';

/// One M-Pesa prompt as the API reports it (rent STK, tenant portal pay, Hodi bill pay).
class StkStatus {
  StkStatus({
    required this.id,
    required this.state,
    required this.amount,
    required this.phone,
    this.resultDesc,
    this.mpesaReceipt,
  });

  final String id;

  /// PENDING, SUCCESS, CANCELLED, TIMEOUT or FAILED.
  final String state;
  final int amount;
  final String phone;
  final String? resultDesc;
  final String? mpesaReceipt;

  bool get pending => state == 'PENDING';

  factory StkStatus.fromJson(Map<String, dynamic> j) => StkStatus(
    id: j['id'] as String,
    state: j['state'] as String,
    amount: centsFrom(j['amount']),
    phone: j['phone'] as String? ?? '',
    resultDesc: j['resultDesc'] as String?,
    mpesaReceipt: j['mpesaReceipt'] as String?,
  );
}

/// Amount + phone → prompt → live status. The Idempotency-Key is made once per sheet, so a
/// double tap or a retry after a dropped connection can't send two prompts.
class StkPaySheet extends StatefulWidget {
  const StkPaySheet({
    super.key,
    required this.title,
    required this.intro,
    required this.defaultAmount,
    required this.defaultPhone,
    required this.submit,
    required this.poll,
    this.amountHint,
    this.onFinished,
    this.pollEvery = const Duration(seconds: 3),
  });

  final String title;
  final String intro;
  final int defaultAmount;
  final String? defaultPhone;
  final String? amountHint;
  final Future<StkStatus> Function(
    int amount,
    String? phone,
    String idempotencyKey,
  )
  submit;
  final Future<StkStatus> Function(String id) poll;

  /// Called once with the final status (e.g. to refresh balances).
  final void Function(StkStatus status)? onFinished;

  /// How often to ask for the status (60 times at most).
  final Duration pollEvery;

  static Future<void> show(BuildContext context, StkPaySheet sheet) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => sheet,
      );

  @override
  State<StkPaySheet> createState() => _StkPaySheetState();
}

class _StkPaySheetState extends State<StkPaySheet> {
  late final _amount = TextEditingController(
    text: widget.defaultAmount > 0
        ? (widget.defaultAmount ~/ 100).toString()
        : '',
  );
  late final _phone = TextEditingController(text: widget.defaultPhone ?? '');
  final _key = ApiClient.newIdempotencyKey();
  StkStatus? _status;
  String? _error;
  bool _sending = false;
  Timer? _timer;
  int _polls = 0;

  @override
  void dispose() {
    _timer?.cancel();
    _amount.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final shillings = int.tryParse(_amount.text.trim().replaceAll(',', ''));
    if (shillings == null || shillings <= 0) {
      setState(() => _error = 'Enter an amount in whole shillings.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final phone = _phone.text.trim();
      final status = await widget.submit(
        shillings * 100,
        phone.isEmpty ? null : phone,
        _key,
      );
      if (!mounted) return;
      setState(() => _status = status);
      _follow();
    } on ApiError catch (e) {
      if (mounted) {
        setState(
          () => _error =
              e.fieldErrors['phone'] ?? e.fieldErrors['amount'] ?? e.message,
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// Every [StkPaySheet.pollEvery] (3 s: up to 3 minutes); the server's sweep settles anything slower.
  void _follow() {
    _timer?.cancel();
    if (_status == null || !_status!.pending) {
      if (_status != null) widget.onFinished?.call(_status!);
      return;
    }
    _timer = Timer(widget.pollEvery, () async {
      if (!mounted || ++_polls > 60) return;
      try {
        final next = await widget.poll(_status!.id);
        if (!mounted) return;
        setState(() => _status = next);
      } on ApiError {
        // Keep polling: a dropped connection mid-wait is common on mobile data.
      }
      _follow();
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final status = _status;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.title, style: text.titleLarge),
            const SizedBox(height: 8),
            if (status == null) ...[
              Text(widget.intro),
              const SizedBox(height: 16),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: InputDecoration(
                  labelText: 'Amount (KES)',
                  helperText: widget.amountHint ?? 'Whole shillings only.',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'M-Pesa phone number',
                  helperText: 'The prompt goes to this phone.',
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                ErrorBox(_error!),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _sending ? null : _send,
                child: Text(_sending ? 'Sending…' : 'Send M-Pesa prompt'),
              ),
            ] else
              _StatusView(
                status: status,
                onClose: () => Navigator.of(context).pop(),
              ),
          ],
        ),
      ),
    );
  }
}

class _StatusView extends StatelessWidget {
  const _StatusView({required this.status, required this.onClose});
  final StkStatus status;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final (icon, tone, title, body) = switch (status.state) {
      'PENDING' => (
        Icons.phone_iphone,
        Tone.neutral,
        'Check the phone',
        'An M-Pesa prompt for ${formatKes(status.amount)} was sent to ${status.phone}. '
            'Enter the M-Pesa PIN to pay.',
      ),
      'SUCCESS' => (
        Icons.check_circle,
        Tone.good,
        'Paid',
        '${formatKes(status.amount)} received${status.mpesaReceipt != null ? ' (M-Pesa ${status.mpesaReceipt})' : ''}.',
      ),
      'CANCELLED' => (
        Icons.cancel_outlined,
        Tone.warn,
        'Cancelled',
        'The prompt was cancelled on the phone. Nothing was paid.',
      ),
      'TIMEOUT' => (
        Icons.timer_off_outlined,
        Tone.warn,
        'No answer',
        status.resultDesc ??
            'The phone didn’t answer in time. Nothing was paid.',
      ),
      _ => (
        Icons.error_outline,
        Tone.bad,
        'Not paid',
        status.resultDesc ?? 'M-Pesa couldn’t complete the payment.',
      ),
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        Row(
          children: [
            if (status.pending)
              const SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 3),
              )
            else
              Icon(icon, size: 28, color: toneColor(context, tone)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            StatusChip(
              status.state == 'PENDING' ? 'Waiting' : title,
              tone: tone,
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(body),
        if (status.pending) ...[
          const SizedBox(height: 8),
          Text(
            'You can close this. The payment is recorded automatically when it’s made.',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
        const SizedBox(height: 16),
        OutlinedButton(onPressed: onClose, child: const Text('Close')),
      ],
    );
  }
}
