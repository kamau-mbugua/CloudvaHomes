import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/dates.dart';
import '../../core/money.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/phone_field.dart';
import 'home_scope.dart';
import 'tenant_api.dart';

/// "I'm moving out" (phase 14): pick a date, see what it means (the notice period and, on
/// short notice, the rent still due), then give notice. The landlord or agent is told.
class MoveOutSheet extends ConsumerStatefulWidget {
  const MoveOutSheet({super.key, required this.home});
  final Home home;

  static Future<void> show(BuildContext context, Home home) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => MoveOutSheet(home: home),
      );

  @override
  ConsumerState<MoveOutSheet> createState() => _MoveOutSheetState();
}

class _MoveOutSheetState extends ConsumerState<MoveOutSheet> {
  late DateTime _date;
  final _phone = TextEditingController();
  final _reason = TextEditingController();
  NoticePreview? _preview;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _date = DateTime.parse(todayIso()).add(const Duration(days: 30));
    _load();
  }

  @override
  void dispose() {
    _phone.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final day = toDay(_date);
    try {
      final p = await ref
          .read(tenantApiProvider)
          .noticePreview(widget.home.tenantId, widget.home.id, day);
      if (mounted && toDay(_date) == day) setState(() => _preview = p);
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _pick() async {
    final today = DateTime.parse(todayIso());
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: today,
      lastDate: today.add(const Duration(days: 730)),
      helpText: 'Moving out on',
    );
    if (picked == null) return;
    setState(() {
      _date = picked;
      _preview = null;
    });
    await _load();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(tenantApiProvider)
          .giveNotice(
            widget.home.tenantId,
            widget.home.id,
            moveOutDate: toDay(_date),
            reason: _reason.text,
            forwardingPhone: _phone.text,
          );
      ref.invalidate(allHomesProvider);
      if (!mounted) return;
      showMessage(
        context,
        'Notice given. ${widget.home.orgName} has been told you’re moving out on ${formatDay(toDay(_date))}.',
      );
      Navigator.of(context).pop();
    } on ApiError catch (e) {
      if (mounted) {
        setState(
          () => _error = e.details.isNotEmpty
              ? e.details.first.message
              : e.message,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final p = _preview;
    final org = widget.home.orgName;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'I’m moving out',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              'Give notice to $org that you’re leaving ${homeLabel(widget.home)}.',
              style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              key: const Key('move-out-date'),
              onPressed: _busy ? null : _pick,
              icon: const Icon(Icons.event_outlined, size: 18),
              label: Text('Moving out on ${formatDay(toDay(_date))}'),
            ),
            const SizedBox(height: 12),
            if (p != null)
              Container(
                key: const Key('move-out-terms'),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: p.shortNotice
                      ? const Color(0xFFFFF4E5)
                      : cs.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  p.shortNotice
                      ? 'Your notice period is ${p.noticeDays} days, so it ends on ${formatDay(p.earliestMoveOut)}. '
                            '${p.rentInLieu > 0 ? 'Moving out sooner, ${formatKes(p.rentInLieu)} in rent is still due for the rest of the notice period, unless $org agrees to waive it.' : 'No further rent falls due before then.'}'
                      : 'That gives the ${p.noticeDays} days’ notice $org asks for. Rent is billed up to your move-out date.',
                  style: const TextStyle(fontSize: 13.5),
                ),
              ),
            const SizedBox(height: 12),
            PhoneField(
              controller: _phone,
              labelText: 'Phone to reach you after you leave (optional)',
              helperText:
                  'For your deposit refund, if it’s a different number.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _reason,
              maxLength: 300,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Why you’re leaving (optional)',
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: cs.error)),
            ],
            const SizedBox(height: 12),
            FilledButton(
              key: const Key('move-out-submit'),
              onPressed: _busy || p == null ? null : _submit,
              child: Text(_busy ? 'Sending…' : 'Give notice'),
            ),
          ],
        ),
      ),
    );
  }
}
