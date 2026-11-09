import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/money.dart';
import '../../core/providers.dart';
import '../../core/widgets/common.dart';
import 'sms_api.dart';
import 'sms_models.dart';

/// "Buy SMS": pick a bundle, then an M-Pesa prompt to KodiHub's paybill, followed until paid.
/// The same Idempotency-Key is reused while the choice is unchanged, so a retry never prompts twice.
class BuySmsSheet extends ConsumerStatefulWidget {
  const BuySmsSheet({super.key, this.phone});
  final String? phone;

  static Future<void> show(BuildContext context, {String? phone}) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => BuySmsSheet(phone: phone),
      );

  @override
  ConsumerState<BuySmsSheet> createState() => _BuySmsSheetState();
}

class _BuySmsSheetState extends ConsumerState<BuySmsSheet> {
  late final _phone = TextEditingController(text: widget.phone ?? '');
  SmsQuote? _quote;
  int? _units;
  String? _key;
  String? _keyFor;
  bool _busy = false;
  String? _error;
  SmsPurchase? _purchase;
  Timer? _timer;
  int _polls = 0;

  @override
  void initState() {
    super.initState();
    ref
        .read(smsApiProvider)
        .quote()
        .then(
          (q) {
            if (mounted) {
              setState(() {
                _quote = q;
                _units = q.bundles.isEmpty ? null : q.bundles.first.units;
              });
            }
          },
          onError: (Object e) {
            if (mounted) {
              setState(
                () => _error = e is ApiError
                    ? e.message
                    : 'Could not load prices',
              );
            }
          },
        );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _pay() async {
    final units = _units;
    if (units == null) return;
    final phone = _phone.text.trim().isEmpty ? null : _phone.text.trim();
    final signature = '$units|$phone';
    if (_keyFor != signature) {
      _key = ApiClient.newIdempotencyKey();
      _keyFor = signature;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final p = await ref.read(smsApiProvider).buy(units, phone, _key!);
      if (!mounted) return;
      setState(() => _purchase = p);
      _follow();
    } on ApiError catch (e) {
      if (mounted) {
        setState(
          () => _error =
              e.fieldErrors['units'] ?? e.fieldErrors['phone'] ?? e.message,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _follow() {
    final every = ref.read(stkPollIntervalProvider);
    _timer?.cancel();
    _timer = Timer(every, () async {
      final current = _purchase;
      if (!mounted ||
          current == null ||
          current.state != 'PENDING' ||
          _polls >= 60) {
        return;
      }
      _polls++;
      try {
        final next = await ref.read(smsApiProvider).purchase(current.id);
        if (!mounted) return;
        setState(() => _purchase = next);
        if (next.state == 'PAID') {
          ref.invalidate(smsAccountProvider);
          ref.invalidate(smsTopUpsProvider);
        }
        if (next.state == 'PENDING') _follow();
      } on ApiError {
        if (mounted) _follow();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final p = _purchase;
    final q = _quote;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        0,
        16,
        16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Buy SMS units',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            if (p != null) ...[
              Text(switch (p.state) {
                'PAID' => 'Done — ${p.units} SMS units added.',
                'FAILED' =>
                  'The payment didn’t go through, so no units were added.',
                _ =>
                  _polls >= 60
                      ? 'Still waiting for M-Pesa. If you paid, the units will show shortly.'
                      : 'Check your phone and enter your M-Pesa PIN.',
              }, style: const TextStyle(fontWeight: FontWeight.w600)),
              if (p.mpesaReceipt != null) ...[
                const SizedBox(height: 4),
                Text('M-Pesa receipt ${p.mpesaReceipt}'),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(p.state == 'PENDING' ? 'Close' : 'Done'),
              ),
            ] else ...[
              Text(
                q == null
                    ? 'Loading prices…'
                    : 'One unit is one SMS of up to 160 characters, at ${formatKes(q.unitPrice)} per unit. '
                          'An M-Pesa prompt goes to the phone below; the units are added as soon as you pay.',
              ),
              const SizedBox(height: 12),
              if (q != null)
                RadioGroup<int>(
                  groupValue: _units,
                  onChanged: (v) => setState(() => _units = v),
                  child: Column(
                    children: [
                      for (final b in q.bundles)
                        RadioListTile<int>(
                          contentPadding: EdgeInsets.zero,
                          value: b.units,
                          title: Text('${b.units} units'),
                          secondary: Text(formatKes(b.amount)),
                        ),
                    ],
                  ),
                ),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'M-Pesa phone number',
                  helperText:
                      'Your number is filled in. Change it to pay from another phone.',
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                ErrorBox(_error!),
              ],
              const SizedBox(height: 16),
              FilledButton(
                key: const Key('sms-buy-pay'),
                onPressed: _busy || _units == null || q == null ? null : _pay,
                child: Text(
                  _busy
                      ? 'Sending…'
                      : _units != null && q != null
                      ? 'Pay ${formatKes(smsBundleAmount(_units!, q.unitPrice))} with M-Pesa'
                      : 'Pay with M-Pesa',
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
