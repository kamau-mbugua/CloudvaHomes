import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/theme_provider.dart';

class ColorResources {
  static Color getSearchBg(BuildContext context) {
    return Provider.of<ThemeProvider>(context).darkTheme
        ? const Color(0xFF585a5c)
        : const Color(0xFFF4F7FC);
  }

  static Color getBackgroundColor(BuildContext context) {
    return Provider.of<ThemeProvider>(context).darkTheme
        ? const Color(0xFF343636)
        : const Color(0xFFF4F7FC);
  }

  static Color getHintColor(BuildContext context) {
    return Provider.of<ThemeProvider>(context).darkTheme
        ? const Color(0xFF98a1ab)
        : const Color(0xFF52575C);
  }

  static Color getGreyBunkerColor(BuildContext context) {
    return Provider.of<ThemeProvider>(context).darkTheme
        ? const Color(0xFFE4E8EC)
        : const Color(0xFF25282B);
  }

  static Color getCartTitleColor(BuildContext context) {
    return Provider.of<ThemeProvider>(context).darkTheme
        ? const Color(0xFF61699b)
        : const Color(0xFF000743);
  }

  static Color getProfileMenuHeaderColor(BuildContext context) {
    return Provider.of<ThemeProvider>(context).darkTheme
        ? footerCol0r.withOpacity(0.5)
        : footerCol0r;
  }

  static Color getFooterColor(BuildContext context) {
    return Provider.of<ThemeProvider>(context).darkTheme
        ? const Color(0xFF494949)
        : const Color(0xFFFFDDD9);
  }

  static const Color colorNero = Color(0xFF1F1F1F);
  static const Color searchBg = Color(0xFFF4F7FC);
  static const Color borderColor = Color(0xFFDCDCDC);
  static const Color footerCol0r = Color(0xFFFFDDD9);
  static const Color cardShadowColor = Color(0xFFA7A7A7);
  static const Color card1 = Color(0xFFedf5ff);
  static const Color card2 = Color(0xFFe7f4e8);
  static const Color card3 = Color(0xFFffe2e5);
  static const Color card4 = Color(0xFFfff4e4);

  //#8cc5ff
  static const Color colorPrimary = Color(0xFF8cc5ff);

  //3e8ed0
  static const Color colorPrimaryDark = Color(0xFF3e8ed0);

  //#298234
  static const Color textGreen = Color(0xFF298234);

  //#ed3241
  static const Color textRed = Color(0xFFed3241);

  //#e86339
  static const Color textOrange = Color(0xFFe86339);

  //#4293fe
  static const Color textBlue = Color(0xFF4293fe);

  //#f2228f
  static const Color graphPink = Color(0xFFf2228f);

  //#9291a5
  static const Color graphGrey = Color(0xFF9291a5);

  //#f8f9fe
  static const Color graphLightBlue = Color(0xFFf8f9fe);

  //#71727a
  static const Color textGrey = Color(0xFF71727a);

  //black
  static const Color colorBlack = Color(0xFF000000);

  //e2e8f0
  static const Color colorGrey = Color(0xFFe2e8f0);
}
