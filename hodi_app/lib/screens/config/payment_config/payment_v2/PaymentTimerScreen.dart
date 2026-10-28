import 'package:flutter/material.dart';
import 'dart:math';

class PaymentTimerScreen extends StatefulWidget {
  final String? message;


  const PaymentTimerScreen({
    Key? key,
    this.message = "Processing your payment...",
  }) : super(key: key);

  @override
  _PaymentTimerScreenState createState() => _PaymentTimerScreenState();
}

class _PaymentTimerScreenState extends State<PaymentTimerScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: Duration(seconds: 5), // Total time for one rotation
      vsync: this,
    )..repeat(); // Infinite rotation
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedBuilder(
              animation: _controller,
              builder: (context, child) {
                return Transform.rotate(
                  angle: _controller.value * 2 * pi,
                  child: child,
                );
              },
              child: Icon(
                Icons.timer,
                size: 100,
                color: Colors.blueAccent,
              ),
            ),
            SizedBox(height: 20),
            Text(
              widget.message ?? "Processing your payment...",
              style: TextStyle(
                fontSize: 18,
                color: Colors.grey[700],
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
