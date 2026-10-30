import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/dates.dart';
import '../../core/money.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/stk_sheet.dart';
import 'tenant_api.dart';

class TenantHomeScreen extends ConsumerWidget {
  const TenantHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(tenantOverviewProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(tenantOverviewProvider.future),
      child: AsyncBody(
        value: overview,
        onRetry: () => ref.invalidate(tenantOverviewProvider),
        data: (o) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Hello, ${o.firstName}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 12),
            _OwedCard(o: o),
            if (o.openInvoices.isNotEmpty) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'Open invoices',
                children: [
                  for (final i in o.openInvoices)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        '${formatPeriod(i.period)} · ${formatKes(i.balance)}',
                      ),
                      subtitle: Text(
                        '${i.number} · due ${formatDay(i.dueDate)}',
                      ),
                      trailing: i.overdue
                          ? const StatusChip('Overdue', tone: Tone.bad)
                          : const Icon(Icons.chevron_right),
                      onTap: () => context.push('/tenant/invoices/${i.id}'),
                    ),
                ],
              ),
            ],
            if (o.howToPay.isNotEmpty) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: 'How to pay',
                children: [
                  for (final (index, w) in o.howToPay.indexed) ...[
                    if (index > 0) const Divider(height: 24),
                    _PayWayView(w),
                  ],
                ],
              ),
            ],
            for (final h in o.homes) ...[
              const SizedBox(height: 12),
              SectionCard(
                title: o.homes.length > 1
                    ? 'Your home · ${h.unit}'
                    : 'Your home',
                children: [
                  Text(
                    '${h.unit}, ${h.property}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 6),
                  FactRow('Rent a month', formatKes(h.rent)),
                  FactRow(
                    'Billed on',
                    'the ${_ordinal(h.billingDay)} of each month',
                  ),
                  FactRow('Since', formatDay(h.startDate)),
                  if (h.endDate != null) FactRow('Until', formatDay(h.endDate)),
                ],
              ),
            ],
            if (o.depositHeld > 0) ...[
              const SizedBox(height: 12),
              SectionCard(
                children: [
                  FactRow('Deposit held', formatKes(o.depositHeld), bold: true),
                ],
              ),
            ],
            const SizedBox(height: 12),
            SectionCard(
              title: 'Contact ${o.orgName}',
              children: [
                if (o.orgPhone != null)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.call_outlined),
                    title: Text(o.orgPhone!),
                    onTap: () =>
                        launchUrl(Uri(scheme: 'tel', path: o.orgPhone)),
                  ),
                if (o.orgEmail != null)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.mail_outline),
                    title: Text(o.orgEmail!),
                    onTap: () =>
                        launchUrl(Uri(scheme: 'mailto', path: o.orgEmail)),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _OwedCard extends ConsumerWidget {
  const _OwedCard({required this.o});
  final TenantOverview o;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final owes = o.owed > 0;
    return CurvedHeroCard(
      label: owes ? 'You owe' : 'Nothing to pay',
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          o.orgName,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      children: [
        const SizedBox(height: 2),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            formatKes(o.owed),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 30,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.6,
            ),
          ),
        ),
        if (o.credit > 0) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              '${formatKes(o.credit)} in credit — used on your next invoice',
              style: const TextStyle(
                color: Color(0xE6FFFFFF),
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
        if (o.canPayInApp) ...[
          const SizedBox(height: 16),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: HodiColors.navy,
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            icon: const Icon(Icons.phone_iphone, color: HodiColors.navy),
            label: Text(owes ? 'Pay now' : 'Pay in advance'),
            onPressed: () => showTenantPaySheet(context, ref, o),
          ),
        ],
      ],
    );
  }
}

void showTenantPaySheet(
  BuildContext context,
  WidgetRef ref,
  TenantOverview o, {
  int? amountCents,
  VoidCallback? onSuccess,
}) {
  final targetCents = amountCents ?? o.owed;
  final api = ref.read(tenantApiProvider);
  StkPaySheet.show(
    context,
    StkPaySheet(
      title: 'Pay rent by M-Pesa',
      intro:
          'An M-Pesa prompt goes to the phone below. Enter your M-Pesa PIN to pay ${o.orgName}.',
      defaultAmount: wholeShillingsUp(targetCents),
      defaultPhone: o.phone,
      amountHint: targetCents > 0
          ? 'You owe ${formatKes(targetCents)}. Whole shillings only.'
          : null,
      submit: (amount, phone, key) => api.pay(o.tenantId, amount, phone, key),
      poll: (id) => api.payStatus(o.tenantId, id),
      pollEvery: ref.read(stkPollIntervalProvider),
      onFinished: (s) {
        if (s.state == 'SUCCESS') {
          ref.invalidate(tenantOverviewProvider);
          onSuccess?.call();
        }
      },
    ),
  );
}

class _PayWayView extends StatelessWidget {
  const _PayWayView(this.w);
  final PayWay w;

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(
      color: Theme.of(context).colorScheme.onSurfaceVariant,
      fontSize: 13,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          w.kind == 'BANK_ACCOUNT' && w.bankName != null
              ? '${w.name} · ${w.bankName}'
              : w.name,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        switch (w.kind) {
          'MPESA_PAYBILL' => Column(
            children: [
              CopyRow(label: 'Paybill', value: w.shortcode ?? ''),
              if (w.accountRef != null)
                CopyRow(label: 'Account number', value: w.accountRef!),
              Text('M-Pesa → Lipa na M-Pesa → Pay Bill', style: muted),
            ],
          ),
          'MPESA_TILL' => Column(
            children: [
              CopyRow(label: 'Till number', value: w.shortcode ?? ''),
              Text(
                'M-Pesa → Lipa na M-Pesa → Buy Goods and Services',
                style: muted,
              ),
            ],
          ),
          _ => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (w.accountNumber != null)
                CopyRow(label: 'Account number', value: w.accountNumber!),
              if (w.accountRef != null)
                CopyRow(label: 'Reference', value: w.accountRef!),
              if (w.accountName != null)
                Text('In the name of ${w.accountName}', style: muted),
            ],
          ),
        },
      ],
    );
  }
}

String _ordinal(int n) {
  if (n >= 11 && n <= 13) return '${n}th';
  return switch (n % 10) {
    1 => '${n}st',
    2 => '${n}nd',
    3 => '${n}rd',
    _ => '${n}th',
  };
}
