import 'package:flutter/material.dart';

import '../theme.dart';

enum BrandTone { light, navy }

/// C2.1 "Ledger roof, refined" mark (`48x48` coordinate grid).
/// When [animated] is true (and OS reduced-motion is off), the three ledger bars
/// draw in sequentially (`18 -> 13 -> 8`) per §08 Pattern 1.
class KodiHubMark extends StatefulWidget {
  const KodiHubMark({
    super.key,
    this.size = 36,
    this.tone = BrandTone.light,
    this.animated = false,
  });

  final double size;
  final BrandTone tone;
  final bool animated;

  @override
  State<KodiHubMark> createState() => _KodiHubMarkState();
}

class _KodiHubMarkState extends State<KodiHubMark>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;

  @override
  void initState() {
    super.initState();
    if (widget.animated) {
      _controller = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1400),
      )..repeat();
    }
  }

  @override
  void didUpdateWidget(covariant KodiHubMark oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.animated && _controller == null) {
      _controller = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1400),
      )..repeat();
    } else if (!widget.animated && _controller != null) {
      _controller?.dispose();
      _controller = null;
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final disableAnimations =
        MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final ctrl = (!disableAnimations && widget.animated) ? _controller : null;
    if (ctrl == null) {
      return CustomPaint(
        size: Size.square(widget.size),
        painter: _C21MarkPainter(tone: widget.tone, progress: null),
      );
    }
    return AnimatedBuilder(
      animation: ctrl,
      builder: (_, _) => CustomPaint(
        size: Size.square(widget.size),
        painter: _C21MarkPainter(tone: widget.tone, progress: ctrl.value),
      ),
    );
  }
}

class _C21MarkPainter extends CustomPainter {
  const _C21MarkPainter({required this.tone, required this.progress});

  final BrandTone tone;
  final double? progress;

  double _barScale(double t, double delay) {
    final shifted = (t - delay) % 1.0;
    final p = shifted < 0 ? shifted + 1.0 : shifted;
    if (p < 0.1) return 0.15;
    if (p < 0.45) return 0.15 + 0.85 * ((p - 0.1) / 0.35);
    if (p < 0.8) return 1.0;
    return 1.0 - 0.85 * ((p - 0.8) / 0.2);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 48.0;
    final isNavy = tone == BrandTone.navy;

    // Tile background (#002B4D on light, translucent white on navy)
    final tilePaint = Paint()
      ..color = isNavy
          ? Colors.white.withValues(alpha: 0.1)
          : HodiColors.navy
      ..style = PaintingStyle.fill;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 0, 48 * s, 48 * s),
        Radius.circular(11 * s),
      ),
      tilePaint,
    );

    // Roof chevron: M11 21 L24 11 L37 21
    final roofPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.6 * s
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final roof = Path()
      ..moveTo(11 * s, 21 * s)
      ..lineTo(24 * s, 11 * s)
      ..lineTo(37 * s, 21 * s);
    canvas.drawPath(roof, roofPaint);

    final s1 = progress == null ? 1.0 : _barScale(progress!, 0.0);
    final s2 = progress == null ? 1.0 : _barScale(progress!, 0.12);
    final s3 = progress == null ? 1.0 : _barScale(progress!, 0.24);

    final whiteBarPaint = Paint()..color = Colors.white;
    final limeBarPaint = Paint()..color = HodiColors.lime;

    // Bar 1: x=15, y=24, w=18, h=3.6, rx=1.8
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(15 * s, 24 * s, 18 * s * s1, 3.6 * s),
        Radius.circular(1.8 * s),
      ),
      whiteBarPaint,
    );
    // Bar 2: x=15, y=30, w=13, h=3.6, rx=1.8
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(15 * s, 30 * s, 13 * s * s2, 3.6 * s),
        Radius.circular(1.8 * s),
      ),
      whiteBarPaint,
    );
    // Bar 3 (Lime): x=15, y=36, w=8, h=3.6, rx=1.8
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(15 * s, 36 * s, 8 * s * s3, 3.6 * s),
        Radius.circular(1.8 * s),
      ),
      limeBarPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _C21MarkPainter oldDelegate) =>
      oldDelegate.tone != tone || oldDelegate.progress != progress;
}

/// Lowercase `kodihub` two-tone wordmark (`Lufga` SemiBold, `-0.04em` tracking).
class KodiHubWordmark extends StatelessWidget {
  const KodiHubWordmark({
    super.key,
    this.fontSize = 22,
    this.tone = BrandTone.light,
  });

  final double fontSize;
  final BrandTone tone;

  @override
  Widget build(BuildContext context) {
    final isDarkTheme = Theme.of(context).brightness == Brightness.dark;
    final useNavyColors = tone == BrandTone.navy || isDarkTheme;
    final kodiColor = useNavyColors ? Colors.white : HodiColors.navy;
    final hubColor = useNavyColors ? HodiColors.lime : HodiColors.limeText;

    return Text.rich(
      TextSpan(
        style: TextStyle(
          fontFamily: 'Lufga',
          fontSize: fontSize,
          fontWeight: FontWeight.w600,
          letterSpacing: fontSize * -0.04,
          height: 1.0,
        ),
        children: [
          TextSpan(
            text: 'kodi',
            style: TextStyle(color: kodiColor),
          ),
          TextSpan(
            text: 'hub',
            style: TextStyle(color: hubColor),
          ),
        ],
      ),
    );
  }
}

/// Full C2.1 lockup (`KodiHubMark` + `KodiHubWordmark`).
class KodiHubLockup extends StatelessWidget {
  const KodiHubLockup({
    super.key,
    this.iconSize = 32,
    this.fontSize = 21,
    this.tone = BrandTone.light,
    this.animated = false,
  });

  final double iconSize;
  final double fontSize;
  final BrandTone tone;
  final bool animated;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      KodiHubMark(size: iconSize, tone: tone, animated: animated),
      SizedBox(width: iconSize * 0.32),
      KodiHubWordmark(fontSize: fontSize, tone: tone),
    ],
  );
}
