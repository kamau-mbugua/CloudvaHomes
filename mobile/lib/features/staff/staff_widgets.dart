import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/widgets/account_sheet.dart';
import '../../core/widgets/common.dart';
import '../billing/billing_banner.dart';
import 'staff_models.dart';

// ───────────────────────────────────────────── labels (same words as the web app)

const occupancyLabel = {
  'OCCUPIED': 'Occupied',
  'NOTICE': 'On notice',
  'VACANT': 'Vacant',
};

Tone occupancyTone(String o) => switch (o) {
  'OCCUPIED' => Tone.good,
  'NOTICE' => Tone.warn,
  _ => Tone.neutral,
};

const channelKindLabel = {
  'MPESA_PAYBILL': 'M-Pesa paybill',
  'MPESA_TILL': 'M-Pesa till',
  'BANK_ACCOUNT': 'Bank account',
  'CASH': 'Cash',
  'CHEQUE': 'Cheque',
  'DEPOSIT': 'From deposit',
};

const statementTypeLabel = {
  'INVOICE': 'Invoice',
  'CREDIT_NOTE': 'Credit note',
  'PAYMENT': 'Payment',
  'REVERSAL': 'Reversal',
  'DEPOSIT_APPLIED': 'Deposit applied',
};

const expenseCategoryLabel = {
  'REPAIRS': 'Repairs & maintenance',
  'UTILITIES': 'Utilities',
  'SECURITY': 'Security',
  'CLEANING': 'Cleaning',
  'SALARIES': 'Salaries & wages',
  'TAXES': 'Taxes & levies',
  'INSURANCE': 'Insurance',
  'MANAGEMENT': 'Management fees',
  'OTHER': 'Other',
};

/// "M-Pesa code", "Cheque no." … for the payment reference field.
String referenceLabel(String? kind) => switch (kind) {
  'MPESA_PAYBILL' || 'MPESA_TILL' => 'M-Pesa code',
  'CHEQUE' => 'Cheque no.',
  'BANK_ACCOUNT' => 'Bank slip no.',
  'CASH' => 'Cash slip no.',
  _ => 'Reference',
};

String referenceHint(String? kind) => switch (kind) {
  'MPESA_PAYBILL' ||
  'MPESA_TILL' => 'From the M-Pesa message, e.g. SJR4XK2L9P.',
  'CHEQUE' => 'The number printed on the cheque.',
  'BANK_ACCOUNT' => 'From the deposit slip or bank statement.',
  'CASH' => 'A slip or receipt book number, if there is one.',
  _ => 'The same reference can’t be entered twice on one channel.',
};

Widget invoiceStatusChip(Invoice i) {
  if (i.status == 'VOID') return const StatusChip('Void');
  if (i.overdue) return const StatusChip('Overdue', tone: Tone.bad);
  return switch (i.status) {
    'PAID' => const StatusChip('Paid', tone: Tone.good),
    'PARTIALLY_PAID' => const StatusChip('Part paid', tone: Tone.warn),
    _ => const StatusChip('Issued'),
  };
}

/// Plain-English messages for the payment and M-Pesa error codes (from the web app).
String staffErrorMessage(Object error) {
  if (error is! ApiError) return messageOf(error);
  switch (error.code) {
    case 'DUPLICATE_REFERENCE':
      final earlier = RegExp(r'\bRCT-\d{4}-\d+\b').firstMatch(error.message);
      return earlier != null
          ? 'This reference is already recorded on this channel, as ${earlier.group(0)}. The payment is probably already in.'
          : 'A payment with this reference is already recorded on this channel, so it may already be in. Check the payments list before entering it again.';
    case 'CHANNEL_INACTIVE':
      return 'This payment channel is inactive. Choose another.';
    case 'IDEMPOTENCY_MISMATCH':
      return 'This request was already sent with different details. Close the form and start again.';
    case 'ALREADY_RESOLVED':
      return 'Someone has already dealt with this transaction, so nothing was changed.';
    case 'DARAJA_NOT_CONFIGURED':
      return 'This channel isn’t connected to M-Pesa yet. Save its Daraja keys on the web app first.';
    case 'DARAJA_ERROR':
      final said = error.message.trim();
      return said.isEmpty
          ? 'M-Pesa (Safaricom) refused the request. Check the channel’s Daraja keys and try again.'
          : 'M-Pesa (Safaricom) refused the request: “$said”.';
    case 'NO_CONTACT':
      return 'This tenant has no phone number on file, so there’s nowhere to send it.';
    case 'NOTHING_DUE':
      return 'This tenant owes nothing right now, so there’s nothing to remind them about.';
    case 'UNSUPPORTED_FILE':
      return 'That file can’t be attached. Use a photo (JPEG, PNG or WebP) or a PDF.';
    case 'FILE_TOO_LARGE':
    case 'PAYLOAD_TOO_LARGE':
      return 'That file is over the 10 MB limit. Try a smaller photo.';
    case 'UPLOAD_INVALID':
      return 'That attachment can’t be used here. Attach the photo again.';
    case 'ALREADY_BILLED':
      return 'This month’s reading is already on an invoice, so it can’t be changed.';
    default:
      return error.message;
  }
}

// ───────────────────────────────────────────── layout

/// A tab's page: app bar with the account button, the Hodi bill banner, then the body.
class StaffTabScaffold extends StatelessWidget {
  const StaffTabScaffold({
    super.key,
    required this.title,
    required this.body,
    this.actions = const [],
    this.bottom,
    this.floatingActionButton,
  });
  final String title;
  final Widget body;
  final List<Widget> actions;
  final PreferredSizeWidget? bottom;
  final Widget? floatingActionButton;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(title),
      actions: [...actions, const AccountButton()],
      bottom: bottom,
    ),
    floatingActionButton: floatingActionButton,
    body: Column(
      children: [
        const BillingBanner(),
        Expanded(child: body),
      ],
    ),
  );
}

/// Shown instead of a screen the person's role can't see.
class NoPermission extends StatelessWidget {
  const NoPermission(this.what, {super.key});
  final String what;
  @override
  Widget build(BuildContext context) => ListView(
    children: [
      EmptyState(
        icon: Icons.lock_outline,
        title: 'Not available for your role',
        body:
            'Your role can’t see $what. Ask your organisation’s owner if you need it.',
      ),
    ],
  );
}

/// The session's permission check, for widgets.
bool can(WidgetRef ref, String permission) =>
    ref.watch(sessionProvider).valueOrNull?.can(permission) ?? false;

/// A search box that reports what was typed after a short pause.
class SearchField extends StatefulWidget {
  const SearchField({super.key, required this.hint, required this.onChanged});
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  State<SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<SearchField> {
  final _c = TextEditingController();
  DateTime _last = DateTime.now();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _changed(String v) {
    final at = _last = DateTime.now();
    Future<void>.delayed(const Duration(milliseconds: 350), () {
      if (mounted && at == _last) widget.onChanged(v.trim());
    });
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
    child: TextField(
      controller: _c,
      onChanged: _changed,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: widget.hint,
        prefixIcon: const Icon(Icons.search),
        isDense: true,
        suffixIcon: ListenableBuilder(
          listenable: _c,
          builder: (_, _) => _c.text.isEmpty
              ? const SizedBox.shrink()
              : IconButton(
                  tooltip: 'Clear search',
                  icon: const Icon(Icons.close),
                  onPressed: () {
                    _c.clear();
                    widget.onChanged('');
                  },
                ),
        ),
      ),
    ),
  );
}

/// Opens `tel:`, `sms:` or a web link; says so when nothing on the phone can.
Future<void> launchOrSay(BuildContext context, Uri uri) async {
  var ok = false;
  try {
    ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    ok = false;
  }
  if (!ok && context.mounted) {
    showMessage(
      context,
      'Couldn’t open ${uri.scheme == 'https' || uri.scheme == 'http' ? 'the link' : 'that app'}.',
    );
  }
}
