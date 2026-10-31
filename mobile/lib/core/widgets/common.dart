import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_error.dart';
import '../theme.dart';

/// Returns true when loader animations should run continuously.
/// Stops motion under OS reduced-motion settings (§08) and inside widget tests
/// so `tester.pumpAndSettle()` never hangs on infinite animations.
bool shouldAnimateLoaders(BuildContext context) {
  if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) return false;
  final binding = WidgetsBinding.instance.runtimeType.toString();
  if (binding.contains('Test')) return false;
  return true;
}

/// C2.1 AppBar (`#002B4D` navy + `3dp` `#84BD00` bottom stripe) used across Staff, Tenant, and Owner shells (§06 Mobile).
class KodiHubAppBar extends StatelessWidget implements PreferredSizeWidget {
  const KodiHubAppBar({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.actions,
    this.bottom,
    this.loading = false,
  });

  final Widget title;
  final String? subtitle;
  final Widget? leading;
  final List<Widget>? actions;
  final PreferredSizeWidget? bottom;
  final bool loading;

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
            if (loading)
              const KodiHubTopBarProgress()
            else
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
    this.loading,
  });
  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final VoidCallback? onRetry;
  final Widget? loading;

  @override
  Widget build(BuildContext context) => value.when(
    skipLoadingOnRefresh: true,
    skipLoadingOnReload: true,
    data: data,
    loading: () => loading ?? const KodiHubPageLoader(),
    error: (e, _) => ErrorState(message: messageOf(e), onRetry: onRetry),
  );
}

// ───────────────────────────────────────────── §08 Loading and waiting elements

enum SpinnerTone { light, navy, money }

/// Pattern 2 — Inline ring spinner (§08 Loading and waiting).
/// - [SpinnerTone.light]: `#ECE9E0` track + `#4D6B10` arc (or `#84BD00` in dark mode)
/// - [SpinnerTone.navy]: `rgba(255,255,255,0.20)` track + `#84BD00` arc
/// - [SpinnerTone.money]: `rgba(0,43,77,0.25)` track + `#002B4D` arc (inside `#84BD00` buttons)
class KodiHubSpinner extends StatefulWidget {
  const KodiHubSpinner({
    super.key,
    this.size = 28,
    this.tone = SpinnerTone.light,
  });

  final double size;
  final SpinnerTone tone;

  @override
  State<KodiHubSpinner> createState() => _KodiHubSpinnerState();
}

class _KodiHubSpinnerState extends State<KodiHubSpinner>
    with SingleTickerProviderStateMixin {
  AnimationController? _ctrl;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncAnimation();
  }

  void _syncAnimation() {
    final animate = shouldAnimateLoaders(context);
    if (animate && _ctrl == null) {
      _ctrl = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 900),
      )..repeat();
    } else if (!animate && _ctrl != null) {
      _ctrl?.dispose();
      _ctrl = null;
    }
  }

  @override
  void dispose() {
    _ctrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final (track, arc) = switch (widget.tone) {
      SpinnerTone.navy => (
        Colors.white.withValues(alpha: 0.20),
        HodiColors.lime,
      ),
      SpinnerTone.money => (
        HodiColors.navy.withValues(alpha: 0.25),
        HodiColors.navy,
      ),
      SpinnerTone.light =>
        dark
            ? (Colors.white.withValues(alpha: 0.16), HodiColors.lime)
            : (HodiColors.muted, HodiColors.limeText),
    };
    final ctrl = _ctrl;
    if (ctrl == null) {
      return CustomPaint(
        size: Size.square(widget.size),
        painter: _SpinnerPainter(track: track, arc: arc, angle: 0),
      );
    }
    return AnimatedBuilder(
      animation: ctrl,
      builder: (_, _) => CustomPaint(
        size: Size.square(widget.size),
        painter: _SpinnerPainter(
          track: track,
          arc: arc,
          angle: ctrl.value * 2 * math.pi,
        ),
      ),
    );
  }
}

class _SpinnerPainter extends CustomPainter {
  const _SpinnerPainter({
    required this.track,
    required this.arc,
    required this.angle,
  });

  final Color track;
  final Color arc;
  final double angle;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = (size.width * (5.0 / 44.0)).clamp(2.2, 5.5);
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - stroke) / 2;

    final trackPaint = Paint()
      ..color = track
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    canvas.drawCircle(center, radius, trackPaint);

    final arcPaint = Paint()
      ..color = arc
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2 + angle,
      math.pi / 2,
      false,
      arcPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _SpinnerPainter oldDelegate) =>
      oldDelegate.angle != angle ||
      oldDelegate.track != track ||
      oldDelegate.arc != arc;
}

/// Inline button label that locks with a 16dp [KodiHubSpinner] when [loading] is true (§08).
class KodiHubButtonChild extends StatelessWidget {
  const KodiHubButtonChild({
    super.key,
    required this.loading,
    required this.label,
    required this.loadingLabel,
    this.tone = SpinnerTone.navy,
  });

  final bool loading;
  final String label;
  final String loadingLabel;
  final SpinnerTone tone;

  @override
  Widget build(BuildContext context) {
    if (!loading) return Text(label);
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        KodiHubSpinner(size: 16, tone: tone),
        const SizedBox(width: 10),
        Text(loadingLabel),
      ],
    );
  }
}

/// Pattern 3 — Warm muted skeleton block with soft shimmer (`#ECE9E0` → `#F6F4EF` → `#ECE9E0`).
class KodiHubSkeletonBox extends StatefulWidget {
  const KodiHubSkeletonBox({
    super.key,
    this.width,
    required this.height,
    this.radius = 999,
  });

  final double? width;
  final double height;
  final double radius;

  @override
  State<KodiHubSkeletonBox> createState() => _KodiHubSkeletonBoxState();
}

class _KodiHubSkeletonBoxState extends State<KodiHubSkeletonBox>
    with SingleTickerProviderStateMixin {
  AnimationController? _ctrl;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final animate = shouldAnimateLoaders(context);
    if (animate && _ctrl == null) {
      _ctrl = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1400),
      )..repeat();
    } else if (!animate && _ctrl != null) {
      _ctrl?.dispose();
      _ctrl = null;
    }
  }

  @override
  void dispose() {
    _ctrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final base = dark ? const Color(0xFF13263B) : HodiColors.muted;
    final hi = dark ? const Color(0xFF1D3652) : const Color(0xFFF6F4EF);
    final ctrl = _ctrl;
    if (ctrl == null) {
      return Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: base,
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      );
    }
    return AnimatedBuilder(
      animation: ctrl,
      builder: (_, _) {
        final shift = (ctrl.value * 2) - 1;
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.radius),
            gradient: LinearGradient(
              begin: Alignment(shift - 1, 0),
              end: Alignment(shift + 1, 0),
              colors: [base, hi, base],
            ),
          ),
        );
      },
    );
  }
}

/// Pattern 3 — Single list row skeleton (`36×36` rounded-`10dp` badge + two pill lines + right pill).
class KodiHubSkeletonRow extends StatelessWidget {
  const KodiHubSkeletonRow({super.key, this.even = true});
  final bool even;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      children: [
        const KodiHubSkeletonBox(width: 36, height: 36, radius: 10),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              FractionallySizedBox(
                widthFactor: even ? 0.70 : 0.60,
                child: const KodiHubSkeletonBox(height: 10),
              ),
              const SizedBox(height: 6),
              FractionallySizedBox(
                widthFactor: even ? 0.45 : 0.35,
                child: const KodiHubSkeletonBox(height: 8),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        const KodiHubSkeletonBox(width: 60, height: 18, radius: 999),
      ],
    ),
  );
}

/// Pattern 3 — List skeleton card/section used while paged or section lists load.
class KodiHubSkeletonList extends StatelessWidget {
  const KodiHubSkeletonList({
    super.key,
    this.rows = 4,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
  });

  final int rows;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => Padding(
    padding: padding,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < rows; i++) KodiHubSkeletonRow(even: i.isEven),
      ],
    ),
  );
}

/// Pattern 3 — Summary/KPI card skeleton.
class KodiHubSkeletonCard extends StatelessWidget {
  const KodiHubSkeletonCard({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FractionallySizedBox(
            widthFactor: 0.42,
            child: KodiHubSkeletonBox(height: 10),
          ),
          SizedBox(height: 12),
          FractionallySizedBox(
            widthFactor: 0.68,
            child: KodiHubSkeletonBox(height: 24, radius: 8),
          ),
          SizedBox(height: 10),
          FractionallySizedBox(
            widthFactor: 0.52,
            child: KodiHubSkeletonBox(height: 10),
          ),
        ],
      ),
    );
  }
}

/// Default page-level loader used by [AsyncBody] (§08 Pattern 3).
class KodiHubPageLoader extends StatelessWidget {
  const KodiHubPageLoader({super.key});

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    physics: const NeverScrollableScrollPhysics(),
    padding: const EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const KodiHubSkeletonCard(),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: KodiHubSkeletonList(rows: 4, padding: EdgeInsets.zero),
          ),
        ),
      ],
    ),
  );
}

/// Pattern 4 — Determinate progress bar for batch operations (§08).
class KodiHubBatchProgress extends StatelessWidget {
  const KodiHubBatchProgress({
    super.key,
    required this.title,
    required this.completed,
    required this.total,
    this.subtitle,
  });

  final String title;
  final int completed;
  final int total;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final ratio = total > 0 ? (completed / total).clamp(0.0, 1.0) : 0.0;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  '$completed of $total',
                  style: TextStyle(
                    fontFamily: 'JetBrainsMono',
                    fontSize: 12,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: ratio,
                minHeight: 8,
                backgroundColor: HodiColors.muted,
                valueColor: const AlwaysStoppedAnimation<Color>(
                  HodiColors.lime,
                ),
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Pattern 5 — 3dp lime indeterminate top-bar route progress (§08).
class KodiHubTopBarProgress extends StatefulWidget {
  const KodiHubTopBarProgress({super.key});

  @override
  State<KodiHubTopBarProgress> createState() => _KodiHubTopBarProgressState();
}

class _KodiHubTopBarProgressState extends State<KodiHubTopBarProgress>
    with SingleTickerProviderStateMixin {
  AnimationController? _ctrl;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final animate = shouldAnimateLoaders(context);
    if (animate && _ctrl == null) {
      _ctrl = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1300),
      )..repeat();
    } else if (!animate && _ctrl != null) {
      _ctrl?.dispose();
      _ctrl = null;
    }
  }

  @override
  void dispose() {
    _ctrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = _ctrl;
    return SizedBox(
      height: 3,
      width: double.infinity,
      child: ColoredBox(
        color: HodiColors.limeSoft,
        child: ctrl == null
            ? Align(
                alignment: Alignment.centerLeft,
                child: FractionallySizedBox(
                  widthFactor: 0.4,
                  child: Container(color: HodiColors.lime),
                ),
              )
            : AnimatedBuilder(
                animation: ctrl,
                builder: (_, _) => FractionalTranslation(
                  translation: Offset(-1.0 + (ctrl.value * 2.4), 0),
                  child: FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: 0.4,
                    child: Container(color: HodiColors.lime),
                  ),
                ),
              ),
      ),
    );
  }
}

/// Pattern 6 — Pulsing 10dp `#84BD00` dot with 5dp `#EEF6DB` halo for pending M-Pesa STK waits (§08).
class KodiHubPulseDot extends StatefulWidget {
  const KodiHubPulseDot({super.key});

  @override
  State<KodiHubPulseDot> createState() => _KodiHubPulseDotState();
}

class _KodiHubPulseDotState extends State<KodiHubPulseDot>
    with SingleTickerProviderStateMixin {
  AnimationController? _ctrl;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final animate = shouldAnimateLoaders(context);
    if (animate && _ctrl == null) {
      _ctrl = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1400),
      )..repeat(reverse: true);
    } else if (!animate && _ctrl != null) {
      _ctrl?.dispose();
      _ctrl = null;
    }
  }

  @override
  void dispose() {
    _ctrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dot = Container(
      width: 10,
      height: 10,
      decoration: const BoxDecoration(
        color: HodiColors.lime,
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: HodiColors.limeSoft, spreadRadius: 5)],
      ),
    );
    final ctrl = _ctrl;
    if (ctrl == null) return dot;
    return AnimatedBuilder(
      animation: ctrl,
      builder: (_, _) =>
          Opacity(opacity: 0.35 + (0.65 * (1.0 - ctrl.value)), child: dot),
    );
  }
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
