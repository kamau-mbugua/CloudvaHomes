import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/dates.dart';
import '../../core/money.dart';
import '../../core/receipts.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import '../staff/staff_widgets.dart';
import 'host_api.dart';
import 'host_models.dart';

/// Money → Receipts for short stays: every guest receipt, newest first. Tap one to preview,
/// send it to the guest again (SMS link + email PDF) or download it. Refunds are listed for the
/// record; they have no receipt.
class HostReceiptsScreen extends ConsumerStatefulWidget {
  const HostReceiptsScreen({super.key});

  @override
  ConsumerState<HostReceiptsScreen> createState() => _HostReceiptsScreenState();
}

class _HostReceiptsScreenState extends ConsumerState<HostReceiptsScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(hostApiProvider);
    final canSend = can(ref, 'stay-payments:create');
    return Scaffold(
      appBar: const KodiHubAppBar(title: Text('Receipts')),
      body: Column(
        children: [
          SearchField(
            hint: 'Receipt, booking, guest or reference',
            onChanged: (v) => setState(() => _q = v),
          ),
          Expanded(
            child: PagedList<HostStayReceipt>(
              resetKey: _q,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              load: (page) => api.stayReceipts(page: page, q: _q),
              empty: const EmptyState(
                icon: Icons.receipt_long_outlined,
                title: 'No receipts found',
              ),
              itemBuilder: (context, r) {
                final p = r.payment;
                final status = p.voidedAt != null
                    ? 'Voided'
                    : p.kind == 'REFUND'
                    ? 'Refund'
                    : null;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Card(
                    child: ListTile(
                      title: Text(
                        '${p.kind == 'REFUND' ? '-' : ''}${formatKes(p.amountCents)} · ${r.guestName ?? 'Guest'}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        [
                          p.number,
                          r.bookingCode,
                          if (p.paidAt.length >= 10)
                            formatDay(p.paidAt.substring(0, 10)),
                          channelKindLabel[p.method] ?? p.method,
                        ].join(' · '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: status != null
                          ? StatusChip(status)
                          : const Icon(Icons.more_vert, size: 20),
                      onTap: p.hasReceipt
                          ? () => showReceiptActions(
                              context,
                              ref,
                              ReceiptRef.stay(
                                bookingId: r.bookingId,
                                paymentId: p.id,
                                number: p.number,
                                guestName: r.guestName ?? 'Guest',
                                phone: r.guestPhone,
                                email: r.guestEmail,
                                hasPhone: r.guestHasPhone,
                                hasEmail: r.guestHasEmail,
                              ),
                              canSend: canSend,
                            )
                          : null,
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
