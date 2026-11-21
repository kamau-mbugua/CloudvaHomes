import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/dates.dart';
import '../../core/money.dart';
import '../../core/receipts.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import 'booking_view.dart';
import 'detail_ui.dart';
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
  bool _priceOpen = true;

  void _reload() => ref.invalidate(hostBookingDetailProvider(widget.bookingId));

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

  Future<void> _payment(HostBooking b, {required bool refund}) async {
    final netPaid = (b.amountPaidCents ?? 0) - (b.amountRefundedCents ?? 0);
    final ok = await showHostPaymentSheet(
      context,
      bookingId: b.id,
      isRefund: refund,
      initialAmountCents: refund ? netPaid : (b.owedCents ?? 0),
    );
    if (ok) _reload();
  }

  ReceiptRef _receiptRef(HostBooking b, HostPayment p) => ReceiptRef.stay(
    bookingId: b.id,
    paymentId: p.id,
    number: p.number,
    guestName: b.guestName,
    phone: b.guestPhone,
    email: b.guestEmail,
    hasPhone: b.guestPhone.isNotEmpty ? true : null,
    hasEmail: b.guestEmail != null && b.guestEmail!.isNotEmpty ? true : null,
  );

  Future<void> _do(BookingAct a, HostBooking b, bool canSend) async {
    switch (a) {
      case BookingAct.accept:
        await _runAction('accept');
      case BookingAct.decline:
        await _runAction('decline');
      case BookingAct.checkIn:
        await _runAction('check-in');
      case BookingAct.checkOut:
        await _runAction('check-out');
      case BookingAct.noShow:
        await _runAction('no-show');
      case BookingAct.mpesa:
        await showHostMpesaPromptSheet(
          context,
          ref,
          booking: b,
          onPaid: _reload,
        );
      case BookingAct.recordPayment:
        await _payment(b, refund: false);
      case BookingAct.refund:
        await _payment(b, refund: true);
      case BookingAct.writeOff:
        await _showWriteOffSheet(b);
      case BookingAct.cancel:
        await _showCancelSheet(b);
      case BookingAct.message:
        await showMessageGuestSheet(
          context,
          name: b.guestName,
          phone: b.guestPhone,
        );
      case BookingAct.sendReceipt:
        final last = b.payments.lastWhere((p) => p.hasReceipt);
        await showReceiptActions(
          context,
          ref,
          _receiptRef(b, last),
          canSend: canSend,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    bool can(String p) => session?.can(p) ?? false;
    final bookingAsync = ref.watch(hostBookingDetailProvider(widget.bookingId));

    return bookingAsync.when(
      loading: () => const Scaffold(
        appBar: KodiHubAppBar(title: Text('Booking')),
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        appBar: const KodiHubAppBar(title: Text('Booking')),
        body: ErrorState(message: messageOf(e), onRetry: _reload),
      ),
      data: (b) => _page(context, b, can),
    );
  }

  Widget _page(BuildContext context, HostBooking b, bool Function(String) can) {
    final today = todayIso();
    final acts = bookingActs(b, can, today);
    final split = splitActs(acts);
    final canSend = can('stay-payments:create');
    void run(BookingAct a) => _do(a, b, canSend);

    return DetailScaffold(
      loading: _busy,
      onRefresh: () async => _reload(),
      title: Row(
        children: [
          Text(
            b.code,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 18,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(width: 8),
          Flexible(child: DetailPill.onNavy(bookingStatusLabel(b.status))),
        ],
      ),
      subtitle: '${b.listingTitle} · ${b.propertyName} ${b.unitNumber}',
      actions: [
        if (split.menu.isNotEmpty)
          PopupMenuButton<BookingAct>(
            tooltip: 'More actions',
            icon: const Icon(Icons.more_vert),
            enabled: !_busy,
            onSelected: run,
            itemBuilder: (_) => [
              for (final a in split.menu)
                PopupMenuItem(value: a, child: Text(bookingActLabel(a, b))),
            ],
          ),
      ],
      header: _header(b),
      bottomBar: split.bar.isEmpty
          ? null
          : DetailActionBar(
              actions: [
                for (var i = 0; i < split.bar.length; i++)
                  BarAction(
                    label: bookingActLabel(split.bar[i], b),
                    primary: i == split.bar.length - 1,
                    onPressed: _busy ? null : () => run(split.bar[i]),
                  ),
              ],
            ),
      children: [
        if (b.hasMoney) _moneyCard(b, acts, run),
        _guestCard(b, can),
        if ((b.guestNote?.trim().isNotEmpty ?? false) ||
            (b.hostNote?.trim().isNotEmpty ?? false))
          DetailCard(
            title: 'Notes',
            gap: 10,
            children: [
              if (b.guestNote?.trim().isNotEmpty ?? false)
                _note('From the guest', b.guestNote!.trim()),
              if (b.hostNote?.trim().isNotEmpty ?? false)
                _note('Your note', b.hostNote!.trim()),
            ],
          ),
        if (b.hasMoney && b.lines.isNotEmpty) _priceCard(b),
        _historyCard(b, canSend),
      ],
    );
  }

  Widget _header(HostBooking b) {
    const soft = Color(0xFFC9D6E5);
    Widget end(String label, String day, String? at, {bool right = false}) =>
        Column(
          crossAxisAlignment: right
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            Text(
              label.toUpperCase(),
              style: const TextStyle(
                fontSize: 11,
                color: soft,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              dayLabel(day),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (at != null)
              Text(
                clockLabel(at),
                style: const TextStyle(fontSize: 12, color: soft),
              ),
          ],
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.07),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Expanded(child: end('Check-in', b.checkIn, b.checkedInAt)),
              const Icon(Icons.arrow_forward, color: HodiColors.lime, size: 20),
              Expanded(
                child: end(
                  'Check-out',
                  b.checkOut,
                  b.checkedOutAt,
                  right: true,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            HeaderChip('${b.nights} night${b.nights == 1 ? '' : 's'}'),
            HeaderChip('${b.guests} guest${b.guests == 1 ? '' : 's'}'),
            HeaderChip(sourceLabel(b)),
          ],
        ),
      ],
    );
  }

  Widget _moneyCard(
    HostBooking b,
    List<BookingAct> acts,
    void Function(BookingAct) run,
  ) {
    final m = moneySummary(b);
    final warning = m.owed > 0 && b.status == 'CHECKED_IN'
        ? 'Collect the rest, or write it off, before checking the guest out.'
        : m.owed > 0 && acts.contains(BookingAct.checkIn)
        ? 'You can check the guest in, but the stay must be paid in full before check-out.'
        : null;
    final total = m.paid == 0 ? 1 : m.paid;
    return DetailCard(
      title: 'Money',
      trailing: DetailPill(m.pill, tone: m.tone),
      children: [
        Row(
          children: [
            Expanded(child: Figure('Paid', shillings(m.paid))),
            Expanded(
              child: Figure(
                'Refunded',
                shillings(m.refunded),
                color: m.refunded > 0 ? const Color(0xFF9A3412) : null,
              ),
            ),
            Expanded(
              child: m.owed > 0
                  ? Figure(
                      'Still owed',
                      shillings(m.owed),
                      color: const Color(0xFF9A3412),
                    )
                  : Figure(
                      'You kept',
                      shillings(m.kept),
                      color: const Color(0xFF3F5A0C),
                    ),
            ),
          ],
        ),
        if (m.paid > 0)
          Semantics(
            label:
                'Of KES ${shillings(m.paid)} paid, ${shillings(m.refunded)} was refunded and ${shillings(m.kept)} kept',
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: SizedBox(
                height: 10,
                child: Row(
                  children: [
                    if (m.kept > 0)
                      Expanded(
                        flex: (m.kept * 1000 ~/ total).clamp(1, 1000),
                        child: const ColoredBox(color: HodiColors.lime),
                      ),
                    if (m.kept > 0 && m.refunded > 0) const SizedBox(width: 2),
                    if (m.refunded > 0)
                      Expanded(
                        flex: (m.refunded * 1000 ~/ total).clamp(1, 1000),
                        child: const ColoredBox(color: Color(0xFFF2C9A8)),
                      ),
                  ],
                ),
              ),
            ),
          ),
        Text(m.text, style: const TextStyle(fontSize: 13, height: 1.45)),
        if (warning != null)
          Text(
            warning,
            style: TextStyle(
              fontSize: 13,
              color: Theme.of(context).colorScheme.error,
            ),
          ),
        if (acts.contains(BookingAct.recordPayment) ||
            acts.contains(BookingAct.refund))
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (acts.contains(BookingAct.recordPayment))
                OutlinedButton(
                  onPressed: _busy ? null : () => run(BookingAct.recordPayment),
                  child: const Text('Record payment'),
                ),
              if (acts.contains(BookingAct.refund))
                OutlinedButton(
                  onPressed: _busy ? null : () => run(BookingAct.refund),
                  child: Text(
                    m.refunded > 0
                        ? 'Refund more (up to KES ${shillings(m.kept)})'
                        : 'Refund (up to KES ${shillings(m.kept)})',
                  ),
                ),
            ],
          ),
      ],
    );
  }

  Widget _guestCard(HostBooking b, bool Function(String) can) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final ordinal = stayOrdinal(b.guestStayNumber);
    final openGuest = can('guests:view') && b.guestId.isNotEmpty
        ? () => context.push('/host/guests/${b.guestId}')
        : null;
    return DetailCard(
      title: 'Guest',
      children: [
        InkWell(
          onTap: openGuest,
          borderRadius: BorderRadius.circular(12),
          child: Row(
            children: [
              InitialsAvatar(initials(b.guestName)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      b.guestName,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (b.guestPhone.isNotEmpty)
                      Text(
                        b.guestPhone,
                        style: TextStyle(fontSize: 13, color: muted),
                      ),
                    if (b.guestEmail?.isNotEmpty ?? false)
                      Text(
                        b.guestEmail!,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13, color: muted),
                      ),
                  ],
                ),
              ),
              if (ordinal != null) DetailPill(ordinal, tone: 'info'),
              if (openGuest != null) Icon(Icons.chevron_right, color: muted),
            ],
          ),
        ),
        if (b.guestPhone.isNotEmpty)
          ContactButtons(phone: b.guestPhone)
        else
          Text(
            'Contact details show from the check-in day.',
            style: TextStyle(fontSize: 13, color: muted),
          ),
      ],
    );
  }

  Widget _note(String label, String text) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: TextStyle(
          fontSize: 12,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
      const SizedBox(height: 2),
      Text(text, style: const TextStyle(fontSize: 14, height: 1.4)),
    ],
  );

  Widget _priceCard(HostBooking b) {
    final rows = priceRows(b.lines);
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return DetailCard(
      gap: 10,
      children: [
        Semantics(
          button: true,
          expanded: _priceOpen,
          child: InkWell(
            onTap: () => setState(() => _priceOpen = !_priceOpen),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 32),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Price',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Text(
                    formatKes(b.totalCents ?? 0),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 8),
                  AnimatedRotation(
                    turns: _priceOpen ? 0.5 : 0,
                    duration: const Duration(milliseconds: 150),
                    child: Icon(Icons.expand_more, color: muted),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (_priceOpen) ...[
          const Divider(height: 1),
          for (final r in rows)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(r.title, style: const TextStyle(fontSize: 14)),
                      if (r.detail != null)
                        Text(
                          r.detail!,
                          style: TextStyle(fontSize: 12, color: muted),
                        ),
                    ],
                  ),
                ),
                Text(shillings(r.cents), style: const TextStyle(fontSize: 14)),
              ],
            ),
          const Divider(height: 1),
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
        ],
      ],
    );
  }

  Widget _historyCard(HostBooking b, bool canSend) {
    final events = timeline(b);
    return DetailCard(
      title: 'What happened',
      children: [
        if (events.isEmpty)
          const Text('Nothing yet.')
        else
          DetailTimeline(
            steps: [
              for (final e in events)
                TimelineStep(
                  kind: e.kind,
                  title: e.title,
                  meta: e.meta,
                  trailing: e.receipt == null
                      ? null
                      : SmallPillButton(
                          label: 'Receipt',
                          icon: Icons.receipt_long_outlined,
                          semanticLabel: 'Receipt ${e.receipt!.number}',
                          onPressed: () => showReceiptActions(
                            context,
                            ref,
                            _receiptRef(b, e.receipt!),
                            canSend: canSend,
                          ),
                        ),
                ),
            ],
          ),
      ],
    );
  }
}
