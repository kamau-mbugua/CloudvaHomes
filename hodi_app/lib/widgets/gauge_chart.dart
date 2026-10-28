import 'package:flutter/material.dart';
import 'package:hodi_app/models/data/table_data/unit_comparison.dart';
import 'package:hodi_app/utils/color_resources.dart';
import 'package:hodi_app/widgets/gauge_painter.dart';

class GaugeChart extends StatelessWidget {
  UnitComparisonDashboardContent? unitComparisonDashboardContent;
  GaugeChart( {
    this.unitComparisonDashboardContent,
    super.key,
    this.totalUnits = 8000,
    this.percent = 80,
    this.color = ColorResources.graphPink,
    this.backgroundColor = Colors.grey,
    this.strokeWidth = 50,
    this.unitText,
    this.centerTextStyle = const TextStyle(
      fontSize: 18,
      color: Colors.black,
      fontWeight: FontWeight.bold,
      fontFamily: 'Poppins',
    ),
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

  final int totalUnits;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 2,
      child: CustomPaint(
        painter: GaugePainter(
          totalUnits: unitComparisonDashboardContent?.totalUnits ?? 0,
          percent: calculateOccupiedUnitsPercentage(
              unitComparisonDashboardContent?.occupiedUnits ?? 0,
              unitComparisonDashboardContent?.totalUnits ?? 0),
          color: color,
          backgroundColor: backgroundColor,
          strokeWidth: strokeWidth,
          unitText: unitText,
          centerTextStyle: centerTextStyle,
        ),
      ),
    );
  }
}

double calculateOccupiedUnitsPercentage(int occupiedUnits, int totalUnits) {
  if (totalUnits == 0) {
    return 0.0; // Avoid division by zero
  }
  return (occupiedUnits / totalUnits) * 100;
}
