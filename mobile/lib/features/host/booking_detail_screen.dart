import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/dates.dart';
import '../../core/money.dart';
import '../../core/widgets/common.dart';
import 'calendar_rules.dart';
import 'host_api.dart';
import 'host_models.dart';
import 'payment_sheet.dart';

final hostBookingDetailProvider = FutureProvider.autoDispose
    .family<HostBooking, String>(
      (ref, id) => ref.watch(hostApiProvider).booking(id),
    );

class BookingDetailScreen extends ConsumerStatefulWidget {
  const BookingDetailScreen({super.key, required this.bookingId});

  final String bookingId;

  @override
  ConsumerState<BookingDetailScreen> createState() =>
      _BookingDetailScreenState();
}

class _BookingDetailScreenState extends ConsumerState<BookingDetailScreen> {
  bool _busy = false;

  Future<void> _runAction(String action, {Map<String, Object?>? body}) async {
    setState(() => _busy = true);
    try {
      await ref
          .read(hostApiProvider)
          .bookingAction(widget.bookingId, action, body: body);
      ref.invalidate(hostBookingDetailProvider(widget.bookingId));
      if (mounted) showMessage(context, 'Booking updated.');
    } catch (e) {
      if (mounted) showMessage(context, messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Gives up on what a checked-in guest still owes (e.g. they left without paying).
  Future<void> _showWriteOffSheet(HostBooking b) async {
    final reasonCtrl = TextEditingController();
    final reason = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        final bottom = MediaQuery.of(ctx).viewInsets.bottom;
        return Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, bottom + 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Write off balance on ${b.code}',
                style: Theme.of(ctx).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text(
                '${b.guestName} still owes ${formatKes(b.owedCents ?? 0)}. Writing it off clears the balance so you can check the guest out. If the guest pays later, it comes off the write-off.',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: reasonCtrl,
                maxLength: 300,
                decoration: const InputDecoration(
                  labelText: 'Reason',
                  hintText: 'e.g. Guest left without paying',
                ),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () {
                  final text = reasonCtrl.text.trim();
                  if (text.length < 3) return;
                  Navigator.of(ctx).pop(text);
                },
                child: Text('Write off ${formatKes(b.owedCents ?? 0)}'),
              ),
            ],
          ),
        );
      },
    );
    if (reason != null && mounted) {
      await _runAction('write-off', body: {'reason': reason});
    }
  }

  Future<void> _showCancelSheet(HostBooking b) async {
    int suggested = 0;
    try {
      final dry = await ref
          .read(hostApiProvider)
          .cancelBooking(b.id, dryRun: true);
      suggested = dry.suggestedRefundCents;
    } catch (_) {}
    if (!mounted) return;
    final refundCtrl = TextEditingController(
      text: (suggested ~/ 100).toString(),
    );
    final reasonCtrl = TextEditingController();
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        final bottom = MediaQuery.of(ctx).viewInsets.bottom;
        return Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, bottom + 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Cancel booking ${b.code}',
                style: Theme.of(ctx).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              if (b.hasMoney) ...[
                Text('Suggested refund: ${formatKes(suggested)}'),
                const SizedBox(height: 8),
                TextField(
                  controller: refundCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Refund amount (KES)',
                  ),
                ),
                const SizedBox(height: 12),
              ],
              TextField(
                controller: reasonCtrl,
                decoration: const InputDecoration(
                  labelText: 'Reason (optional)',
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('Confirm cancel'),
              ),
            ],
          ),
        );
      },
    );
    if (confirmed == true && mounted) {
      final minor = b.hasMoney
          ? toHostMinorString(refundCtrl.text, allowZero: true)
          : null;
      setState(() => _busy = true);
      try {
        await ref
            .read(hostApiProvider)
            .cancelBooking(
              b.id,
              dryRun: false,
              refundAmountMinor: minor,
              reason: reasonCtrl.text,
            );
        ref.invalidate(hostBookingDetailProvider(widget.bookingId));
      } catch (e) {
        if (mounted) showMessage(context, messageOf(e));
      } finally {
        if (mounted) setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final canUpdate = session?.can('bookings:update') ?? false;
    final canCancel = session?.can('bookings:cancel') ?? false;
    final canPayCreate = session?.can('stay-payments:create') ?? false;
    final canRefund = session?.can('stay-payments:refund') ?? false;
    final bookingAsync = ref.watch(hostBookingDetailProvider(widget.bookingId));

    return Scaffold(
      appBar: AppBar(title: const Text('Booking details')),
      body: bookingAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(
          message: messageOf(e),
          onRetry: () =>
              ref.invalidate(hostBookingDetailProvider(widget.bookingId)),
        ),
        data: (b) {
          final netPaid =
              (b.amountPaidCents ?? 0) - (b.amountRefundedCents ?? 0);
          final balance = balanceRow(b.status, b.owedCents ?? 0);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              SectionCard(
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        b.code,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Chip(
                        label: Text(b.status),
                        visualDensity: VisualDensity.compact,
                      ),
                      if (b.hasMoney)
                        Text(
                          formatKes(b.totalCents ?? 0),
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text('${b.listingTitle} (${b.unitNumber})'),
                  const SizedBox(height: 4),
                  Text(
                    '${b.checkIn} → ${b.checkOut} (${b.nights} night${b.nights == 1 ? '' : 's'}) · ${b.guests} guest${b.guests == 1 ? '' : 's'}',
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SectionCard(
                title: 'Guest',
                children: [
                  Text(
                    b.guestName,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 4),
                  Text(b.guestPhone),
                  if (b.guestEmail != null && b.guestEmail!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(b.guestEmail!),
                  ],
                ],
              ),
              const SizedBox(height: 12),
              if ((b.writtenOffCents ?? 0) > 0) ...[
                Text(
                  '${formatKes(b.writtenOffCents ?? 0)} written off${b.writeOffReason != null ? ': ${b.writeOffReason}' : '.'}',
                ),
                const SizedBox(height: 8),
              ],
              // Check-in with a balance is allowed with a warning; check-out waits for payment.
              if (canUpdate &&
                  b.hasMoney &&
                  (b.owedCents ?? 0) > 0 &&
                  (b.status == 'CHECKED_IN' ||
                      canCheckIn(
                        b.status,
                        b.checkIn,
                        b.checkOut,
                        todayIso(),
                      ))) ...[
                Text(
                  b.status == 'CHECKED_IN'
                      ? 'Collect the remaining ${formatKes(b.owedCents ?? 0)} before checking the guest out.'
                      : 'The guest still owes ${formatKes(b.owedCents ?? 0)}. You can check them in, but the stay must be paid in full before check-out.',
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
                const SizedBox(height: 8),
              ],
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (canUpdate && b.status == 'REQUESTED') ...[
                    FilledButton(
                      onPressed: _busy ? null : () => _runAction('accept'),
                      child: const Text('Accept'),
                    ),
                    OutlinedButton(
                      onPressed: _busy ? null : () => _runAction('decline'),
                      child: const Text('Decline'),
                    ),
                  ],
                  if (canUpdate && b.status == 'CONFIRMED') ...[
                    if (canCheckIn(b.status, b.checkIn, b.checkOut, todayIso()))
                      FilledButton(
                        onPressed: _busy ? null : () => _runAction('check-in'),
                        child: const Text('Check in'),
                      ),
                    if (canMarkNoShow(b.status, b.checkIn, todayIso()))
                      OutlinedButton(
                        onPressed: _busy ? null : () => _runAction('no-show'),
                        child: const Text('No-show'),
                      ),
                  ],
                  if (canUpdate && b.status == 'CHECKED_IN')
                    FilledButton(
                      // Check-out waits until the stay is paid in full.
                      onPressed: _busy || (b.owedCents ?? 0) > 0
                          ? null
                          : () => _runAction('check-out'),
                      child: const Text('Check out'),
                    ),
                  if (b.hasMoney &&
                      canPayCreate &&
                      (b.owedCents ?? 0) > 0 &&
                      !isClosedBooking(b.status)) ...[
                    OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () => showHostMpesaPromptSheet(
                              context,
                              ref,
                              booking: b,
                              onPaid: () => ref.invalidate(
                                hostBookingDetailProvider(widget.bookingId),
                              ),
                            ),
                      child: const Text('M-Pesa prompt'),
                    ),
                    OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () async {
                              final ok = await showHostPaymentSheet(
                                context,
                                bookingId: b.id,
                                isRefund: false,
                                initialAmountCents: b.owedCents ?? 0,
                              );
                              if (ok) {
                                ref.invalidate(
                                  hostBookingDetailProvider(widget.bookingId),
                                );
                              }
                            },
                      child: const Text('Record payment'),
                    ),
                  ],
                  if (b.hasMoney &&
                      canRefund &&
                      b.status == 'CHECKED_IN' &&
                      (b.owedCents ?? 0) > 0)
                    OutlinedButton(
                      onPressed: _busy ? null : () => _showWriteOffSheet(b),
                      child: const Text('Write off balance'),
                    ),
                  if (b.hasMoney && canRefund && netPaid > 0)
                    OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () async {
                              final ok = await showHostPaymentSheet(
                                context,
                                bookingId: b.id,
                                isRefund: true,
                                initialAmountCents: netPaid,
                              );
                              if (ok) {
                                ref.invalidate(
                                  hostBookingDetailProvider(widget.bookingId),
                                );
                              }
                            },
                      child: const Text('Refund'),
                    ),
                  if (canCancel &&
                      (b.status == 'REQUESTED' ||
                          b.status == 'HELD' ||
                          b.status == 'CONFIRMED' ||
                          b.status == 'CHECKED_IN'))
                    TextButton(
                      onPressed: _busy ? null : () => _showCancelSheet(b),
                      child: const Text('Cancel booking'),
                    ),
                ],
              ),
              if (b.hasMoney) ...[
                const SizedBox(height: 16),
                SectionCard(
                  title: 'Price breakdown',
                  children: [
                    for (final line in b.lines)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                line.date != null
                                    ? '${line.label} (${line.date})'
                                    : line.label,
                              ),
                            ),
                            Text(formatKes(line.amountCents)),
                          ],
                        ),
                      ),
                    const Divider(),
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Total',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                        Text(
                          formatKes(b.totalCents ?? 0),
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Expanded(child: Text('Paid')),
                        Text(formatKes(b.amountPaidCents ?? 0)),
                      ],
                    ),
                    if ((b.amountRefundedCents ?? 0) > 0)
                      Row(
                        children: [
                          const Expanded(child: Text('Refunded')),
                          Text(formatKes(b.amountRefundedCents ?? 0)),
                        ],
                      ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            balance.label,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                        Text(
                          formatKes(balance.cents),
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SectionCard(
                  title: 'Payments & refunds',
                  children: [
                    if (b.payments.isEmpty)
                      const Text('No payments recorded yet.')
                    else
                      for (final p in b.payments)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text('${p.kind} · ${p.method}'),
                          subtitle: Text(
                            p.reference ??
                                (p.paidAt.length >= 10
                                    ? p.paidAt.substring(0, 10)
                                    : p.paidAt),
                          ),
                          trailing: Text(
                            '${p.kind == 'REFUND' ? '-' : ''}${formatKes(p.amountCents)}',
                          ),
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
