import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/api_client.dart';
import '../api/api_error.dart';
import '../money.dart';
import '../theme.dart';
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
  var _key = ApiClient.newIdempotencyKey();
  StkStatus? _status;
  String? _error;
  bool _sending = false;
  Timer? _timer;
  Timer? _clockTimer;
  int _polls = 0;
  int _elapsedSeconds = 0;

  @override
  void dispose() {
    _timer?.cancel();
    _clockTimer?.cancel();
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
      setState(() {
        _status = status;
        _elapsedSeconds = 0;
        _polls = 0;
      });
      _startClock();
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

  void _startClock() {
    _clockTimer?.cancel();
    if (_status == null || !_status!.pending) return;
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _status == null || !_status!.pending) {
        _clockTimer?.cancel();
        return;
      }
      setState(() => _elapsedSeconds++);
    });
  }

  void _retryPrompt() {
    _timer?.cancel();
    _clockTimer?.cancel();
    setState(() {
      _status = null;
      _error = null;
      _elapsedSeconds = 0;
      _polls = 0;
      _key = ApiClient.newIdempotencyKey();
    });
  }

  /// Every [StkPaySheet.pollEvery] (3 s: up to 3 minutes); the server's sweep settles anything slower.
  void _follow() {
    _timer?.cancel();
    if (_status == null || !_status!.pending) {
      _clockTimer?.cancel();
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
                style: KodiHubButtonStyles.money(),
                onPressed: _sending ? null : _send,
                child: Text(_sending ? 'Sending…' : 'Send M-Pesa prompt'),
              ),
            ] else
              _StatusView(
                status: status,
                elapsedSeconds: _elapsedSeconds,
                onRetry: _retryPrompt,
                onClose: () => Navigator.of(context).pop(),
              ),
          ],
        ),
      ),
    );
  }
}

String _formatElapsed(int seconds) {
  final s = seconds < 0 ? 0 : seconds;
  final mins = s ~/ 60;
  final rem = (s % 60).toString().padLeft(2, '0');
  return '$mins:$rem';
}

class _StatusView extends StatelessWidget {
  const _StatusView({
    required this.status,
    required this.elapsedSeconds,
    required this.onRetry,
    required this.onClose,
  });
  final StkStatus status;
  final int elapsedSeconds;
  final VoidCallback onRetry;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final timedOut60 = status.pending && elapsedSeconds >= 60;
    final (icon, tone, title, body) = switch (status.state) {
      'PENDING' => (
        Icons.phone_iphone,
        Tone.neutral,
        'Check the phone',
        timedOut60
            ? 'Didn’t get the prompt? Check that your phone is unlocked, then send the prompt again or pay manually via M-Pesa Paybill.'
            : 'An M-Pesa prompt for ${formatKes(status.amount)} was sent to ${status.phone}. '
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
              Container(
                width: 12,
                height: 12,
                margin: const EdgeInsets.symmetric(horizontal: 8),
                decoration: const BoxDecoration(
                  color: HodiColors.lime,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(color: HodiColors.limeSoft, spreadRadius: 5),
                  ],
                ),
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
            if (status.pending) ...[
              Text(
                _formatElapsed(elapsedSeconds),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(width: 8),
            ],
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
        if (timedOut60) ...[
          FilledButton(
            style: KodiHubButtonStyles.money(),
            onPressed: onRetry,
            child: const Text('Send prompt again'),
          ),
          const SizedBox(height: 8),
        ],
        OutlinedButton(onPressed: onClose, child: const Text('Close')),
      ],
    );
  }
}
