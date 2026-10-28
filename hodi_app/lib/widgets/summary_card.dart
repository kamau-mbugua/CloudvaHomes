import 'package:flutter/material.dart';
import 'package:hodi_app/utils/dimensions.dart';
import 'package:hodi_app/utils/styles.dart';

class SummaryCard extends StatelessWidget {
  final String title;
  final String value;
  final Color color;
  final String icon;
  final Color textColor;
  final double height;


  const SummaryCard(
      {required this.title,
      required this.value,
      required this.color,
      required this.icon,
      required this.textColor,
        this.height = 150,
      });

  @override
  Widget build(BuildContext context) {
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(15),
      ),
      color: color,
      elevation: 1,
      child: SizedBox(
        height: height, // Set a fixed height for the card
        child: Padding(
          padding: const EdgeInsets.all(5.0), // Adjusted padding
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Center(
                child:Image.asset(
                  icon,
                  width: 30,
                  height: 32,
                ),
              ),
              const SizedBox(height: 4),
              Center(
                child: Text(
                  title,
                  style: poppinsRegular.copyWith(
                    fontSize: Dimensions.fontSizeLarge,
                    color: Colors.black,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              // Adjusted spacing
              Center(
                child: Text(
                  value,

                  style:poppinsBold.copyWith(
                    fontSize: Dimensions.fontSizeLarge,
                    color: textColor,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
