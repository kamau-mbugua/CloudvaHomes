import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_error.dart';
import '../theme.dart';

/// C2.1 AppBar (`#002B4D` navy + `3dp` `#84BD00` bottom stripe) used across Staff, Tenant, and Owner shells (§06 Mobile).
class KodiHubAppBar extends StatelessWidget implements PreferredSizeWidget {
  const KodiHubAppBar({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.actions,
    this.bottom,
  });

  final Widget title;
  final String? subtitle;
  final Widget? leading;
  final List<Widget>? actions;
  final PreferredSizeWidget? bottom;

  @override
  Size get preferredSize =>
      Size.fromHeight(kToolbarHeight + 3 + (bottom?.preferredSize.height ?? 0));

  @override
  Widget build(BuildContext context) {
    final bottomHeight = 3.0 + (bottom?.preferredSize.height ?? 0);
    return AppBar(
      backgroundColor: HodiColors.navy,
      foregroundColor: Colors.white,
      shape: const Border(),
      leading: leading,
      title: subtitle == null
          ? title
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                title,
                const SizedBox(height: 1),
                Text(
                  subtitle!,
                  style: const TextStyle(
                    fontFamily: 'Lufga',
                    fontSize: 12,
                    fontWeight: FontWeight.w400,
                    color: Color(0xFF9EAEC4),
                  ),
                ),
              ],
            ),
      actions: actions,
      bottom: PreferredSize(
        preferredSize: Size.fromHeight(bottomHeight),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ?bottom,
            SizedBox(
              height: 3,
              width: double.infinity,
              child: ColoredBox(
                color: bottom == null
                    ? HodiColors.lime
                    : HodiColors.lime.withValues(alpha: 0.35),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// JetBrains Mono uppercase kicker label (`.k` in KodiHub Mobile Redesign).
class Kicker extends StatelessWidget {
  const Kicker(
    this.text, {
    super.key,
    this.color = HodiColors.limeText,
    this.padding = EdgeInsets.zero,
  });
  final String text;
  final Color color;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => Padding(
    padding: padding,
    child: Text(
      text.toUpperCase(),
      style: TextStyle(
        fontFamily: 'JetBrainsMono',
        fontSize: 10.5,
        fontWeight: FontWeight.w600,
        letterSpacing: 1.4,
        color: color,
      ),
    ),
  );
}

/// Monospace unit / reference code badge (`.code` in KodiHub Mobile Redesign).
class UnitBadge extends StatelessWidget {
  const UnitBadge(
    this.code, {
    super.key,
    this.width = 44,
    this.height = 40,
    this.fontSize = 13,
  });
  final String code;
  final double width;
  final double height;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: width,
      height: height,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: dark ? const Color(0xFF162A42) : HodiColors.paper2,
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(
          code,
          style: TextStyle(
            fontFamily: 'JetBrainsMono',
            fontSize: fontSize,
            fontWeight: FontWeight.w600,
            color: dark ? Colors.white : HodiColors.navy,
          ),
        ),
      ),
    );
  }
}

/// Rounded square or circular initials badge (`#84BD00` lime with `#002B4D` bold text).
class InitialsBadge extends StatelessWidget {
  const InitialsBadge({
    super.key,
    required this.name,
    this.size = 40,
    this.radius = 12,
    this.fontSize = 13,
    this.lime = true,
    this.backgroundColor,
    this.foregroundColor,
  });

  final String name;
  final double size;
  final double radius;
  final double fontSize;
  final bool lime;
  final Color? backgroundColor;
  final Color? foregroundColor;

  String get _text {
    final n = name.trim();
    if (n.isEmpty) return '?';
    final parts = n.split(RegExp(r'\s+'));
    if (parts.length == 1) {
      return parts[0].substring(0, parts[0].length >= 2 ? 2 : 1).toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: backgroundColor ?? (lime ? HodiColors.lime : HodiColors.navy),
      borderRadius: BorderRadius.circular(radius),
    ),
    child: Text(
      _text,
      style: TextStyle(
        fontFamily: 'Lufga',
        fontSize: fontSize,
        fontWeight: FontWeight.w700,
        color: foregroundColor ?? (lime ? HodiColors.navy : Colors.white),
      ),
    ),
  );
}

/// Receipt card with the signature 4dp `#002B4D` + 2dp `#84BD00` top ledger stripe (Screen 08).
class LedgerReceiptCard extends StatelessWidget {
  const LedgerReceiptCard({
    super.key,
    required this.children,
    this.padding = const EdgeInsets.all(18),
  });
  final List<Widget> children;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(
            height: 4,
            width: double.infinity,
            child: ColoredBox(color: HodiColors.navy),
          ),
          const SizedBox(
            height: 2,
            width: double.infinity,
            child: ColoredBox(color: HodiColors.lime),
          ),
          Padding(
            padding: padding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          ),
        ],
      ),
    );
  }
}

/// Signature dark-blue curved hero card used at the top of home, tenant, and billing screens.
class CurvedHeroCard extends StatelessWidget {
  const CurvedHeroCard({
    super.key,
    this.label,
    this.kicker,
    this.trailing,
    required this.children,
    this.padding = const EdgeInsets.all(20),
  });
  final String? label;
  final String? kicker;
  final Widget? trailing;
  final List<Widget> children;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        color: HodiColors.navy,
        boxShadow: const [
          BoxShadow(
            color: Color(0x33002B4D),
            blurRadius: 28,
            offset: Offset(0, 12),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned(
            right: -36,
            top: -36,
            child: IgnorePointer(
              child: Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.05),
                ),
              ),
            ),
          ),
          Padding(
            padding: padding,
            child: DefaultTextStyle.merge(
              style: const TextStyle(color: Colors.white),
              child: IconTheme.merge(
                data: const IconThemeData(color: Colors.white),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (kicker != null || label != null || trailing != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          children: [
                            if (kicker != null)
                              Expanded(
                                child: Text(
                                  kicker!.toUpperCase(),
                                  style: const TextStyle(
                                    fontFamily: 'JetBrainsMono',
                                    color: HodiColors.lime,
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: 1.4,
                                  ),
                                ),
                              )
                            else if (label != null)
                              Expanded(
                                child: Text(
                                  label!,
                                  style: const TextStyle(
                                    color: Color(0xFFD7E0EC),
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              )
                            else
                              const Spacer(),
                            ?trailing,
                          ],
                        ),
                      ),
                    ...children,
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Loading / error-with-retry / data for an AsyncValue, the same way on every screen.
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({
    super.key,
    required this.value,
    required this.data,
    this.onRetry,
  });
  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => value.when(
    skipLoadingOnRefresh: true,
    skipLoadingOnReload: true,
    data: data,
    loading: () => const Center(child: CircularProgressIndicator()),
    error: (e, _) => ErrorState(message: messageOf(e), onRetry: onRetry),
  );
}

class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.cloud_off_outlined,
            size: 40,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          if (onRetry != null) ...[
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ],
      ),
    ),
  );
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    this.body,
    this.icon = Icons.inbox_outlined,
  });
  final String title;
  final String? body;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
      child: Column(
        children: [
          Icon(icon, size: 40, color: muted),
          const SizedBox(height: 12),
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          if (body != null) ...[
            const SizedBox(height: 6),
            Text(
              body!,
              style: TextStyle(color: muted),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}

/// A card with an optional heading, for grouping facts on detail screens.
class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    this.title,
    required this.children,
    this.trailing,
  });
  final String? title;
  final Widget? trailing;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title!,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  ?trailing,
                ],
              ),
            ),
          ...children,
        ],
      ),
    ),
  );
}

/// "Label ........ value" on one line; the value is right-aligned and wraps if long.
class FactRow extends StatelessWidget {
  const FactRow(
    this.label,
    this.value, {
    super.key,
    this.bold = false,
    this.onTap,
  });
  final String label;
  final String value;
  final bool bold;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final row = Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 5,
            child: Text(
              label,
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 4,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Flexible(
                  child: Text(
                    value,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      fontWeight: bold || onTap != null
                          ? FontWeight.w600
                          : FontWeight.w400,
                      color: onTap != null ? scheme.secondary : null,
                    ),
                  ),
                ),
                if (onTap != null) ...[
                  const SizedBox(width: 4),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 16,
                    color: scheme.secondary,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
    if (onTap == null) return row;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: row,
    );
  }
}

/// A value with a Copy button (paybill, account number).
class CopyRow extends StatelessWidget {
  const CopyRow({super.key, required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
        ),
        IconButton(
          tooltip: 'Copy $label',
          icon: const Icon(Icons.copy_rounded, size: 18),
          onPressed: () {
            Clipboard.setData(ClipboardData(text: value));
            showMessage(context, '$label copied');
          },
        ),
      ],
    ),
  );
}

/// A small coloured label (status pill, `.pill` in KodiHub Mobile Redesign).
class StatusChip extends StatelessWidget {
  const StatusChip(this.label, {super.key, this.tone = Tone.neutral});
  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = _pillPalette(context, tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: fg,
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

enum Tone { good, warn, bad, info, neutral }

(Color, Color) _pillPalette(BuildContext context, Tone tone) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  if (dark) {
    final fg = toneColor(context, tone);
    return (fg.withValues(alpha: 0.16), fg);
  }
  return switch (tone) {
    Tone.good => (HodiColors.successSoft, HodiColors.success),
    Tone.warn => (HodiColors.warningSoft, HodiColors.warning),
    Tone.bad => (HodiColors.dangerSoft, HodiColors.danger),
    Tone.info => (HodiColors.infoSoft, HodiColors.info),
    Tone.neutral => (HodiColors.muted, HodiColors.inkMuted),
  };
}

/// The colour of a [Tone] in the current theme.
Color toneColor(BuildContext context, Tone tone) {
  final scheme = Theme.of(context).colorScheme;
  final dark = Theme.of(context).brightness == Brightness.dark;
  return switch (tone) {
    Tone.good => dark ? const Color(0xFF34D399) : HodiColors.success,
    Tone.warn => dark ? const Color(0xFFFBBF24) : HodiColors.warning,
    Tone.bad => scheme.error,
    Tone.info => dark ? const Color(0xFF60A5FA) : HodiColors.info,
    Tone.neutral => scheme.onSurfaceVariant,
  };
}

void showMessage(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(content: Text(text), behavior: SnackBarBehavior.floating),
    );
}

/// An inline error box for forms and sheets.
class ErrorBox extends StatelessWidget {
  const ErrorBox(this.message, {super.key});
  final String message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: scheme.error.withValues(alpha: 0.4)),
      ),
      child: Text(message, style: TextStyle(color: scheme.error)),
    );
  }
}
