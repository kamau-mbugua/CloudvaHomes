import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/dates.dart';
import '../../core/money.dart';
import '../../core/widgets/common.dart';
import '../staff/staff_widgets.dart';
import 'buy_sms_sheet.dart';
import 'sms_api.dart';
import 'sms_models.dart';

/// Settings → SMS: how messages to tenants and guests are sent, KodiHub SMS units (balance,
/// Buy SMS), the warning level and — on an own SMS account — the KodiHub fallback switch,
/// plus recent messages and top-ups. Sign-in codes are sent by KodiHub and never use units.
class SmsScreen extends ConsumerWidget {
  const SmsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final account = ref.watch(smsAccountProvider);
    return Scaffold(
      appBar: const KodiHubAppBar(title: Text('SMS')),
      body: AsyncBody(
        value: account,
        onRetry: () => ref.invalidate(smsAccountProvider),
        data: (a) => _SmsBody(account: a),
      ),
    );
  }
}

class _SmsBody extends ConsumerWidget {
  const _SmsBody({required this.account});
  final SmsAccount account;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canManage = can(ref, 'sms:manage');
    final phone = ref.watch(sessionProvider).value?.user.phone;
    final banner = smsBanner(account);
    final usage = ref.watch(smsUsageProvider);
    final topUps = ref.watch(smsTopUpsProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(smsAccountProvider);
        ref.invalidate(smsUsageProvider);
        ref.invalidate(smsTopUpsProvider);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
        children: [
          if (banner != null) ...[
            ErrorBox(banner.text),
            const SizedBox(height: 12),
          ],
          SectionCard(
            title: account.own ? 'SMS' : 'SMS units',
            children: [
              Text(smsModeLabel(account)),
              if (!account.own || account.balance > 0) ...[
                const SizedBox(height: 8),
                Text(
                  '${account.balance}',
                  style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Text('units left'),
              ],
              const SizedBox(height: 12),
              FactRow('Price per unit', formatKes(account.unitPrice)),
              FactRow('Units bought', '${account.unitsBought}'),
              FactRow('Units used', '${account.unitsUsed}'),
              const SizedBox(height: 12),
              if (canManage && account.canBuyInApp)
                FilledButton(
                  key: const Key('sms-buy'),
                  onPressed: () => BuySmsSheet.show(context, phone: phone),
                  child: const Text('Buy SMS'),
                )
              else if (!canManage)
                const Text(
                  'Your role can see SMS but not buy units. Ask your organisation’s owner.',
                ),
              const SizedBox(height: 8),
              const Text(
                'One unit is one SMS of up to 160 characters (70 with emoji). Sign-in and security codes are '
                'sent by KodiHub and never use your units.',
              ),
            ],
          ),
          if (canManage) ...[
            const SizedBox(height: 12),
            _WarningsCard(
              key: ValueKey(account.lowBalanceLevel),
              account: account,
            ),
          ],
          const SizedBox(height: 12),
          SectionCard(
            title: 'Messages sent',
            children: [
              ...switch (usage) {
                AsyncData(:final value) when value.isEmpty => [
                  const Text('No messages yet.'),
                ],
                AsyncData(:final value) => [
                  for (final r in value)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${r.type} · ${r.to}',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${formatTimestamp(r.at)} · ${r.units} ${r.units == 1 ? 'unit' : 'units'}'
                            '${r.reason != null && r.status == 'FAILED' ? ' · ${r.reason}' : ''}',
                          ),
                          const SizedBox(height: 4),
                          StatusChip(
                            smsStatusLabel(r.status),
                            tone: switch (r.status) {
                              'SENT' => Tone.good,
                              'FAILED' => Tone.bad,
                              _ => Tone.warn,
                            },
                          ),
                        ],
                      ),
                    ),
                ],
                AsyncError() => [const Text('Couldn’t load messages.')],
                _ => [const LinearProgressIndicator()],
              },
            ],
          ),
          const SizedBox(height: 12),
          SectionCard(
            title: 'Top-ups',
            children: [
              ...switch (topUps) {
                AsyncData(:final value) when value.isEmpty => [
                  const Text('No top-ups yet.'),
                ],
                AsyncData(:final value) => [
                  for (final t in value)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        '${t.units > 0 ? '+' : ''}${t.units} units'
                        '${t.amount != null ? ' · ${formatKes(t.amount!)}' : ''}',
                      ),
                      subtitle: Text(
                        '${formatTimestamp(t.at)} · '
                        '${t.kind == 'PURCHASE' ? 'M-Pesa${t.mpesaReceipt != null ? ' ${t.mpesaReceipt}' : ''}' : t.reason ?? 'Added by KodiHub'}',
                      ),
                      trailing: Text('${t.balanceAfter}'),
                    ),
                ],
                AsyncError() => [const Text('Couldn’t load top-ups.')],
                _ => [const LinearProgressIndicator()],
              },
            ],
          ),
        ],
      ),
    );
  }
}

class _WarningsCard extends ConsumerStatefulWidget {
  const _WarningsCard({super.key, required this.account});
  final SmsAccount account;
  @override
  ConsumerState<_WarningsCard> createState() => _WarningsCardState();
}

class _WarningsCardState extends ConsumerState<_WarningsCard> {
  late final _level = TextEditingController(
    text: '${widget.account.lowBalanceLevel}',
  );
  late bool _fallback = widget.account.fallbackToPlatform;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _level.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final level = int.tryParse(_level.text.trim());
    if (level == null || level < 0) {
      setState(() => _error = 'Enter a whole number of units, 0 or more.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(smsApiProvider).update({
        'lowBalanceLevel': level,
        if (widget.account.own) 'fallbackToPlatform': _fallback,
      });
      ref.invalidate(smsAccountProvider);
      if (mounted) showMessage(context, 'SMS settings saved.');
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => SectionCard(
    title: 'Warnings',
    children: [
      TextField(
        key: const Key('sms-low'),
        controller: _level,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(
          labelText: 'Warn me below (units)',
          helperText: 'Owners get a notice and an email, at most once a day.',
        ),
      ),
      if (widget.account.own)
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text(
            'If my SMS account fails, send through KodiHub using my units',
          ),
          value: _fallback,
          onChanged: (v) => setState(() => _fallback = v),
        ),
      if (_error != null) ...[const SizedBox(height: 8), ErrorBox(_error!)],
      const SizedBox(height: 12),
      OutlinedButton(
        key: const Key('sms-save'),
        onPressed: _saving ? null : _save,
        child: Text(_saving ? 'Saving…' : 'Save'),
      ),
    ],
  );
}
