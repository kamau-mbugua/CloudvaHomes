import 'dart:math';

import 'package:flutter/material.dart';

class GaugePainter extends CustomPainter {
  GaugePainter({
    required this.totalUnits,
    required this.percent,
    required this.color,
    required this.backgroundColor,
    this.strokeWidth = 10.0,
    this.unitText,
    required this.centerTextStyle,
  });

  /// percent is between 0 and 100
  final double percent;

  /// percentile arc color
  final Color color;

  /// background arc color
  final Color backgroundColor;

  /// arc stroke width
  final double strokeWidth;

  /// text shown after the text in center
  final String? unitText;

  /// text style of the text in center
  final TextStyle centerTextStyle;

  /// total units
  final int totalUnits;

  @override
  void paint(Canvas canvas, Size size) {
    // calculate center and radius of circle
    final center = Offset(size.width / 2, size.height);
    final radius = size.width / 2 - strokeWidth / 2;

    final fullArcPainter = Paint()
      ..color = backgroundColor
      ..strokeWidth = strokeWidth
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.square;

    // when painter stroke cap is StrokeCap.round, it will add half of the
    // stroke width to the start and end of arc. Therefore the angle is bigger
    // then 2 * pi (=180) degree.
    // This formula calculates the angle of the arc so the arc will be 180
    // degree including the stroke width.
    final angleWithRoundStroke = pi - strokeWidth / radius;

    // This formula calculates the offset angle of the arc so the arc will be
    // 180 degree including the stroke width.
    final offsetAngle = pi + (strokeWidth / (2 * radius));

    // Draw background arc
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      offsetAngle,
      angleWithRoundStroke,
      false,
      fullArcPainter,
    );

    final percentPainter = Paint()
      ..color = color
      ..strokeWidth = strokeWidth
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.square;

    double percentAngle;
    if (percent >= 100) {
      // catch case when percent is bigger than 100
      percentAngle = angleWithRoundStroke;
    } else {
      // calculate angle of percent arc
      percentAngle = percent * angleWithRoundStroke / 100;
    }

    // Draw percent arc
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      offsetAngle,
      percentAngle,
      false,
      percentPainter,
    );

    // paint text
    TextSpan textSpan = TextSpan(
      text: 'Total Units\n$totalUnits',
      style: centerTextStyle,
    );
    final textPainter = TextPainter(
      text: textSpan,
      textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
    );
    textPainter.layout(
      minWidth: 0,
      maxWidth: size.width,
    );

    final xTextPosition = (size.width - textPainter.width) / 2;
    final yTextPosition = (size.height - textPainter.height) * 3 / 4;
    final textOffset = Offset(xTextPosition, yTextPosition);
    textPainter.paint(canvas, textOffset);
  }

  @override
  bool shouldRepaint(covariant GaugePainter oldDelegate) {
    return oldDelegate.percent != percent;
  }
}