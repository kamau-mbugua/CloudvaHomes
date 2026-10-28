import 'package:flutter/material.dart';

class CircleView extends StatelessWidget {
  final double size;
  final Color color;
  final Widget? child;

  CircleView({required this.size, required this.color, this.child});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
        ),
        if (child != null) ...[
          SizedBox(width: 8.0), // Add some spacing between the circle and the child
          child!,
        ],
      ],
    );
  }
}