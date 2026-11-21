import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../staff/staff_widgets.dart' show launchOrSay;

/// Building blocks for host detail pages in the KodiHQ "Booking details · mobile" style:
/// a navy header that scrolls with the page, white cards, pills, contact buttons, a timeline
/// and a sticky action bar.

/// (background, text) per tone.
const detailTones = <String, (Color, Color)>{
  'ok': (Color(0xFFEEF6DA), Color(0xFF3F5A0C)),
  'due': (Color(0xFFFFF1E6), Color(0xFF9A3412)),
  'warn': (Color(0xFFFFF4E0), Color(0xFF8A4B00)),
  'bad': (Color(0xFFFDECEA), Color(0xFFB42318)),
  'info': (Color(0xFFEFF5FC), Color(0xFF1D4F8C)),
  'plain': (Color(0xFFEEF2F7), HodiColors.navy),
};

(Color, Color) detailTone(String tone) =>
    detailTones[tone] ?? detailTones['plain']!;

const _headerSoft = Color(0xFFC9D6E5);

/// A page whose navy header scrolls away with the content, with an optional sticky bar.
class DetailScaffold extends StatelessWidget {
  const DetailScaffold({
    super.key,
    required this.title,
    this.subtitle,
    this.actions = const [],
    this.header,
    required this.children,
    this.bottomBar,
    this.loading = false,
    this.onRefresh,
  });

  final Widget title;
  final String? subtitle;
  final List<Widget> actions;

  /// Extra navy content under the title (dates, chips…).
  final Widget? header;
  final List<Widget> children;
  final Widget? bottomBar;
  final bool loading;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    final scroll = CustomScrollView(
      slivers: [
        SliverAppBar(
          pinned: true,
          backgroundColor: HodiColors.navy,
          foregroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          titleSpacing: 0,
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              title,
              if (subtitle != null)
                Text(
                  subtitle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, color: _headerSoft),
                ),
            ],
          ),
          actions: actions,
          bottom: loading
              ? const PreferredSize(
                  preferredSize: Size.fromHeight(3),
                  child: LinearProgressIndicator(
                    minHeight: 3,
                    color: HodiColors.lime,
                    backgroundColor: Colors.transparent,
                  ),
                )
              : null,
        ),
        SliverToBoxAdapter(
          child: Container(
            padding: EdgeInsets.fromLTRB(12, header == null ? 0 : 4, 12, 18),
            decoration: const BoxDecoration(
              color: HodiColors.navy,
              border: Border(
                bottom: BorderSide(color: HodiColors.lime, width: 4),
              ),
            ),
            child: header ?? const SizedBox.shrink(),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(12, 16, 12, 24),
          sliver: SliverList.separated(
            itemCount: children.length,
            separatorBuilder: (_, _) => const SizedBox(height: 14),
            itemBuilder: (_, i) => children[i],
          ),
        ),
      ],
    );
    return Scaffold(
      body: onRefresh == null
          ? scroll
          : RefreshIndicator(onRefresh: onRefresh!, child: scroll),
      bottomNavigationBar: bottomBar,
    );
  }
}

/// A small rounded label.
class DetailPill extends StatelessWidget {
  const DetailPill(this.label, {super.key, this.tone = 'plain'});

  /// On the navy header: translucent white.
  const DetailPill.onNavy(this.label, {super.key}) : tone = 'navy';

  final String label;
  final String tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = tone == 'navy'
        ? (Colors.white.withValues(alpha: 0.14), Colors.white)
        : detailTone(tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// A soft chip on the navy header ("5 nights", "2 guests").
class HeaderChip extends StatelessWidget {
  const HeaderChip(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(
      label,
      style: const TextStyle(fontSize: 12, color: Color(0xFFE6EDF5)),
    ),
  );
}

/// A white card with a heading and optional trailing widget.
class DetailCard extends StatelessWidget {
  const DetailCard({
    super.key,
    this.title,
    this.trailing,
    required this.children,
    this.gap = 14,
  });

  final String? title;
  final Widget? trailing;
  final List<Widget> children;
  final double gap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        border: Border.all(color: cs.outlineVariant),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Row(
              children: [
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(
                      title!,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
                ?trailing,
              ],
            ),
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0 || title != null) SizedBox(height: gap),
            children[i],
          ],
        ],
      ),
    );
  }
}

/// A label over a figure, e.g. "Paid / 26,000".
class Figure extends StatelessWidget {
  const Figure(this.label, this.value, {super.key, this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) => Column(
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
      FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Text(
          value,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ),
    ],
  );
}

/// A round avatar with initials.
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar(this.initials, {super.key, this.size = 48});

  final String initials;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    alignment: Alignment.center,
    decoration: const BoxDecoration(
      color: Color(0xFFEEF2F7),
      shape: BoxShape.circle,
    ),
    child: Text(
      initials,
      style: const TextStyle(
        color: HodiColors.navy,
        fontWeight: FontWeight.w600,
      ),
    ),
  );
}

/// Kenyan numbers for links: "0712 345 678" / "+254712345678" → "254712345678".
String internationalDigits(String phone) {
  final d = phone.replaceAll(RegExp(r'[^0-9]'), '');
  if (d.startsWith('0') && d.length == 10) return '254${d.substring(1)}';
  return d;
}

Future<void> callPhone(BuildContext context, String phone) =>
    launchOrSay(context, Uri(scheme: 'tel', path: phone.replaceAll(' ', '')));

Future<void> textPhone(BuildContext context, String phone) =>
    launchOrSay(context, Uri(scheme: 'sms', path: phone.replaceAll(' ', '')));

Future<void> whatsAppPhone(BuildContext context, String phone) => launchOrSay(
  context,
  Uri.parse('https://wa.me/${internationalDigits(phone)}'),
);

/// Call / WhatsApp / SMS tiles.
class ContactButtons extends StatelessWidget {
  const ContactButtons({super.key, required this.phone});

  final String phone;

  @override
  Widget build(BuildContext context) {
    Widget tile(IconData icon, String label, VoidCallback onTap) => Expanded(
      child: Material(
        color: const Color(0xFFF1F4F8),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: SizedBox(
            height: 48,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 18, color: HodiColors.navy),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: HodiColors.navy,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    return Row(
      children: [
        tile(Icons.call_outlined, 'Call', () => callPhone(context, phone)),
        const SizedBox(width: 8),
        tile(
          Icons.chat_outlined,
          'WhatsApp',
          () => whatsAppPhone(context, phone),
        ),
        const SizedBox(width: 8),
        tile(Icons.sms_outlined, 'SMS', () => textPhone(context, phone)),
      ],
    );
  }
}

/// Asks how to reach the guest: call, WhatsApp or SMS.
Future<void> showMessageGuestSheet(
  BuildContext context, {
  required String name,
  required String phone,
}) async {
  final pick = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(
              'Message $name',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.chat_outlined),
            title: const Text('WhatsApp'),
            onTap: () => Navigator.of(ctx).pop('wa'),
          ),
          ListTile(
            leading: const Icon(Icons.sms_outlined),
            title: const Text('SMS'),
            onTap: () => Navigator.of(ctx).pop('sms'),
          ),
          ListTile(
            leading: const Icon(Icons.call_outlined),
            title: Text('Call $phone'),
            onTap: () => Navigator.of(ctx).pop('call'),
          ),
        ],
      ),
    ),
  );
  if (!context.mounted) return;
  switch (pick) {
    case 'wa':
      await whatsAppPhone(context, phone);
    case 'sms':
      await textPhone(context, phone);
    case 'call':
      await callPhone(context, phone);
  }
}

/// One step on a timeline. kind: neutral | pay | stay | refund | bad.
class TimelineStep {
  const TimelineStep({
    required this.kind,
    required this.title,
    required this.meta,
    this.trailing,
  });

  final String kind;
  final String title;
  final String meta;
  final Widget? trailing;
}

class DetailTimeline extends StatelessWidget {
  const DetailTimeline({super.key, required this.steps});

  final List<TimelineStep> steps;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 20,
                  child: Column(
                    children: [
                      const SizedBox(height: 4),
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: _dot(steps[i].kind),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                          boxShadow: [
                            BoxShadow(
                              color: _dot(steps[i].kind),
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Container(
                          width: 2,
                          color: i == steps.length - 1
                              ? Colors.transparent
                              : const Color(0xFFE3E8EF),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          steps[i].title,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: switch (steps[i].kind) {
                              'refund' => const Color(0xFF9A3412),
                              'bad' => const Color(0xFFB42318),
                              _ => null,
                            },
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          steps[i].meta,
                          style: TextStyle(fontSize: 12, color: muted),
                        ),
                      ],
                    ),
                  ),
                ),
                if (steps[i].trailing != null) ...[
                  const SizedBox(width: 8),
                  Align(
                    alignment: Alignment.topCenter,
                    child: steps[i].trailing!,
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }

  static Color _dot(String kind) => switch (kind) {
    'pay' => HodiColors.lime,
    'stay' => HodiColors.navy,
    'refund' => const Color(0xFFE8A33D),
    'bad' => const Color(0xFFB42318),
    _ => const Color(0xFF9AA8B8),
  };
}

/// A small outlined pill button (e.g. "Receipt" on a timeline step).
class SmallPillButton extends StatelessWidget {
  const SmallPillButton({
    super.key,
    required this.label,
    required this.icon,
    required this.onPressed,
    this.semanticLabel,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: semanticLabel ?? label,
    child: OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 14),
      label: Text(label, style: const TextStyle(fontSize: 12)),
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 34),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        shape: const StadiumBorder(),
        side: const BorderSide(color: Color(0xFFCBD5E1)),
        foregroundColor: HodiColors.navy,
      ),
    ),
  );
}

/// One button of the sticky bar.
class BarAction {
  const BarAction({
    required this.label,
    required this.onPressed,
    this.primary = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool primary;
}

/// The sticky bar at the bottom of a detail page (one or two buttons).
class DetailActionBar extends StatelessWidget {
  const DetailActionBar({super.key, required this.actions});

  final List<BarAction> actions;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        border: Border(top: BorderSide(color: cs.outlineVariant)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          child: Row(
            children: [
              for (var i = 0; i < actions.length; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: actions[i].primary
                        ? FilledButton(
                            onPressed: actions[i].onPressed,
                            child: Text(actions[i].label),
                          )
                        : OutlinedButton(
                            onPressed: actions[i].onPressed,
                            child: Text(actions[i].label),
                          ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
