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
    this.kicker,
    this.amountHint,
    this.onFinished,
    this.pollEvery = const Duration(seconds: 3),
  });

  final String title;
  final String intro;
  final int defaultAmount;
  final String? defaultPhone;
  final String? kicker;
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
    final dark = Theme.of(context).brightness == Brightness.dark;
    final status = _status;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        24 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
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
                        widget.kicker ?? 'M-Pesa Express',
                        color: dark
                            ? const Color(0xFF9EAEC4)
                            : HodiColors.inkSubtle,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        widget.title,
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          letterSpacing: -0.4,
                          color: dark ? Colors.white : HodiColors.navy,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Close',
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (status == null) ...[
              Text(
                widget.intro,
                style: TextStyle(
                  fontSize: 13.5,
                  height: 1.45,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: dark ? Colors.white : HodiColors.navy,
                ),
                decoration: InputDecoration(
                  labelText: 'Amount (KES)',
                  prefixText: 'KES ',
                  helperText: widget.amountHint ?? 'Whole shillings only.',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'M-Pesa phone number',
                  prefixIcon: Icon(Icons.phone_iphone_outlined, size: 20),
                  helperText: 'The prompt goes to this phone.',
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: dark ? const Color(0xFF122438) : HodiColors.paper2,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(
                  'We’ll send an M-Pesa prompt to this phone. Enter your PIN to finish — your receipt arrives right away.',
                  style: TextStyle(
                    fontSize: 12.5,
                    height: 1.45,
                    color: dark ? const Color(0xFFD7E0EC) : HodiColors.inkMuted,
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                ErrorBox(_error!),
              ],
              const SizedBox(height: 16),
              FilledButton(
                style: KodiHubButtonStyles.money(height: 54),
                onPressed: _sending ? null : _send,
                child: KodiHubButtonChild(
                  loading: _sending,
                  label: 'Send M-Pesa prompt',
                  loadingLabel: 'Sending STK…',
                  tone: SpinnerTone.money,
                ),
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
    final dark = Theme.of(context).brightness == Brightness.dark;
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

    if (status.state == 'SUCCESS') {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          Center(
            child: Container(
              width: 76,
              height: 76,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: HodiColors.limeSoft,
                shape: BoxShape.circle,
              ),
              child: Container(
                width: 54,
                height: 54,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: HodiColors.lime,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_rounded,
                  size: 30,
                  color: HodiColors.navy,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          const Center(child: Kicker('Payment received')),
          const SizedBox(height: 4),
          Center(
            child: Text(
              formatKes(status.amount),
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.8,
                color: dark ? Colors.white : HodiColors.navy,
              ),
            ),
          ),
          const SizedBox(height: 6),
          Center(child: StatusChip(title, tone: tone)),
          const SizedBox(height: 14),
          LedgerReceiptCard(
            children: [
              Text(
                body,
                style: TextStyle(
                  fontSize: 13.5,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              if (status.phone.isNotEmpty) ...[
                const SizedBox(height: 8),
                FactRow('Paid from', status.phone),
              ],
            ],
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: onClose, child: const Text('Done')),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        Row(
          children: [
            if (status.pending)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 4),
                child: KodiHubPulseDot(),
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
                  fontFamily: 'JetBrainsMono',
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
