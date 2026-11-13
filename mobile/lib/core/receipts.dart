import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_error.dart';
import 'files.dart';
import 'providers.dart';
import 'widgets/common.dart';

/// One receipt the app can preview, share/download and send to the payer again.
class ReceiptRef {
  const ReceiptRef({
    required this.number,
    required this.pdfPath,
    required this.sendPath,
    required this.recipientName,
    this.phone,
    this.email,
    this.hasPhone,
    this.hasEmail,
  });

  /// A short-stay payment's receipt (`SRC-…`).
  factory ReceiptRef.stay({
    required String bookingId,
    required String paymentId,
    required String number,
    required String guestName,
    String? phone,
    String? email,
    bool? hasPhone,
    bool? hasEmail,
  }) {
    final base = '/host/bookings/$bookingId/payments/$paymentId/receipt';
    return ReceiptRef(
      number: number,
      pdfPath: base,
      sendPath: '$base/send',
      recipientName: guestName,
      phone: phone,
      email: email,
      hasPhone: hasPhone,
      hasEmail: hasEmail,
    );
  }

  /// A rent payment's receipt (`RCT-…`).
  factory ReceiptRef.rent({
    required String paymentId,
    required String number,
    required String tenantName,
    String? phone,
  }) => ReceiptRef(
    number: number,
    pdfPath: '/payments/$paymentId/receipt',
    sendPath: '/payments/$paymentId/receipt/send',
    recipientName: tenantName,
    phone: phone,
    hasPhone: phone != null && phone.isNotEmpty ? true : null,
  );

  final String number;
  final String pdfPath;
  final String sendPath;
  final String recipientName;
  final String? phone;
  final String? email;

  /// Null when the screen doesn't know (e.g. a rent payment doesn't carry the tenant's email).
  final bool? hasPhone;
  final bool? hasEmail;
}

/// What "Send" will do, in words, before it is pressed (same wording as the web app).
List<String> receiptSendPlan(ReceiptRef r) => [
  if (r.hasPhone == false)
    'No phone number on file, so no SMS.'
  else
    'SMS${r.phone != null && r.phone!.isNotEmpty ? ' to ${r.phone}' : ''} with a link to the receipt.',
  if (r.hasEmail == false)
    'No email on file, so no email.'
  else if (r.email != null && r.email!.isNotEmpty)
    'Email to ${r.email} with the receipt PDF attached.'
  else
    'Email with the receipt PDF attached, if there is an email on file.',
];

/// What actually went out.
({bool ok, String text}) receiptSentMessage(
  String number, {
  required bool sms,
  required bool email,
}) {
  if (sms && email) {
    return (ok: true, text: 'Receipt $number sent by SMS and email.');
  }
  if (sms) return (ok: true, text: 'Receipt $number sent by SMS.');
  if (email) return (ok: true, text: 'Receipt $number sent by email.');
  return (
    ok: false,
    text:
        'Receipt $number could not be sent: no phone or email reached. Check the contact details and SMS units.',
  );
}

/// Preview, Send and Download for one receipt, as a bottom sheet.
Future<void> showReceiptActions(
  BuildContext context,
  WidgetRef ref,
  ReceiptRef receipt, {
  required bool canSend,
}) async {
  final choice = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(
              'Receipt ${receipt.number}',
              style: Theme.of(ctx).textTheme.titleMedium,
            ),
          ),
          ListTile(
            leading: const Icon(Icons.visibility_outlined),
            title: const Text('Preview'),
            subtitle: const Text('Open the receipt PDF'),
            onTap: () => Navigator.of(ctx).pop('preview'),
          ),
          if (canSend)
            ListTile(
              leading: const Icon(Icons.send_outlined),
              title: Text(
                'Send to ${receipt.recipientName.split(RegExp(r'\s+')).first}',
              ),
              subtitle: const Text('SMS with a link, and email with the PDF'),
              onTap: () => Navigator.of(ctx).pop('send'),
            ),
          ListTile(
            leading: const Icon(Icons.download_outlined),
            title: const Text('Download or share'),
            subtitle: const Text('Save the PDF, or share it on'),
            onTap: () => Navigator.of(ctx).pop('download'),
          ),
        ],
      ),
    ),
  );
  if (choice == null || !context.mounted) return;
  final api = ref.read(apiClientProvider);
  final filename = '${receipt.number}.pdf';
  try {
    switch (choice) {
      case 'preview':
        await openApiPdf(api, receipt.pdfPath, filename);
      case 'download':
        await shareApiPdf(api, receipt.pdfPath, filename);
      case 'send':
        await _confirmAndSend(context, ref, receipt);
    }
  } catch (e) {
    if (context.mounted) showMessage(context, messageOf(e));
  }
}

Future<void> _confirmAndSend(
  BuildContext context,
  WidgetRef ref,
  ReceiptRef receipt,
) async {
  final ok = await showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Send receipt ${receipt.number} to ${receipt.recipientName}',
              style: Theme.of(ctx).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            for (final line in receiptSendPlan(receipt))
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('• $line'),
              ),
            const SizedBox(height: 4),
            Text(
              'The SMS uses one unit; the link works for 90 days.',
              style: Theme.of(ctx).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Send receipt'),
            ),
          ],
        ),
      ),
    ),
  );
  if (ok != true || !context.mounted) return;
  final res = await ref
      .read(apiClientProvider)
      .post(receipt.sendPath, body: {});
  final data = (res['data'] as Map<String, dynamic>?) ?? const {};
  final msg = receiptSentMessage(
    receipt.number,
    sms: data['sms'] == true,
    email: data['email'] == true,
  );
  if (context.mounted) showMessage(context, msg.text);
}
