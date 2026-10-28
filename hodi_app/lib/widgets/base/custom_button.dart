import 'package:flutter/material.dart';

import '../../utils/dimensions.dart';

class CustomButton extends StatelessWidget {
  final Function? onTap;
  final String? btnTxt;
  final TextStyle? textStyle;
  final Color? backgroundColor;
  final double borderRadius;
  final bool isOutlined;
  final Color? outlineColor;
  const CustomButton({
    Key? key,
    this.onTap,
    required this.btnTxt,
    this.backgroundColor,
    this.textStyle,
    this.borderRadius = 10,
    this.isOutlined = false,
    this.outlineColor,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final ButtonStyle buttonStyle = TextButton.styleFrom(
      backgroundColor: isOutlined ? Colors.transparent : (onTap == null ? Theme.of(context).hintColor.withOpacity(0.7) : backgroundColor ?? Theme.of(context).primaryColor),
      minimumSize: Size(MediaQuery.of(context).size.width, 50),
      padding: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(borderRadius),
        side: isOutlined ? BorderSide(color: outlineColor ?? Theme.of(context).primaryColor) : BorderSide.none,
      ),
    );

    return TextButton(
      onPressed: onTap as void Function()?,
      style: buttonStyle,
      child: Text(
        btnTxt ?? "",
        style: textStyle ?? Theme.of(context).textTheme.displaySmall!.copyWith(
          color: isOutlined ? (outlineColor ?? Theme.of(context).primaryColor) : Colors.white,
          fontSize: Dimensions.fontSizeLarge,
        ),
      ),
    );
  }
}
