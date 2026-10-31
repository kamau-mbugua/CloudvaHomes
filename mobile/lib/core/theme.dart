import 'package:flutter/material.dart';

/// KodiHub C2.1 "Ledger roof, refined" palette (§02 Colour & §06 Mobile).
abstract final class HodiColors {
  static const navy = Color(0xFF002B4D);
  static const navyDeep = Color(0xFF0A1F36);
  static const navyMid = Color(0xFF0A3A66);

  static const lime = Color(0xFF84BD00);
  static const limeText = Color(0xFF4D6B10);
  static const limeHover = Color(0xFF3D5509);
  static const limeSoft = Color(0xFFEEF6DB);
  static const limeSoftDark = Color(0xFF1C2E14);

  static const paper = Color(0xFFFAFAF7);
  static const paper2 = Color(0xFFF1EFE9);
  static const muted = Color(0xFFECE9E0);
  static const canvas = paper;
  static const stone = paper2;
  static const surfaceDark = nightCard;

  static const ink = Color(0xFF0A2540);
  static const inkSecondary = Color(0xFF1F3A5C);
  static const inkMuted = Color(0xFF52647E);
  static const inkSubtle = Color(0xFF5B6B82);

  static const night = Color(0xFF06121F);
  static const nightCard = Color(0xFF0C1E33);

  static const success = Color(0xFF1F7A4F);
  static const successSoft = Color(0xFFE6F4EC);
  static const warning = Color(0xFF9A5B00);
  static const warningSoft = Color(0xFFFDF3E3);
  static const danger = Color(0xFFB91C1C);
  static const dangerBorder = Color(0xFFDC2626);
  static const dangerSoft = Color(0xFFFDECEC);
  static const info = Color(0xFF28618F);
  static const infoSoft = Color(0x1F337ABF);

  // Semantic aliases used across staff & portal widgets
  static const blueAccent = limeText;
  static const skySoft = limeSoft;
  static const mintSoft = successSoft;
  static const amberSoft = warningSoft;
  static const roseSoft = dangerSoft;
  static const olive = limeText;
  static const oliveSoft = limeSoft;
}

typedef KodiHubColors = HodiColors;

/// Explicit button helpers for C2.1 semantic CTA rules (§04 Components & §06 Mobile).
abstract final class KodiHubButtonStyles {
  /// #84BD00 lime pill with #002B4D navy bold text — reserved for money-moving CTAs.
  static ButtonStyle money({double height = 52}) => FilledButton.styleFrom(
    backgroundColor: HodiColors.lime,
    foregroundColor: HodiColors.navy,
    minimumSize: Size.fromHeight(height),
    textStyle: const TextStyle(
      fontFamily: 'Lufga',
      fontSize: 15.5,
      fontWeight: FontWeight.w600,
    ),
    shape: const StadiumBorder(),
  );
}

ThemeData hodiTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final scheme = dark
      ? const ColorScheme.dark(
          primary: HodiColors.lime,
          onPrimary: Color(0xFF001A2E),
          secondary: Color(0xFF9DD000),
          onSecondary: Color(0xFF001A2E),
          secondaryContainer: HodiColors.limeSoftDark,
          onSecondaryContainer: Color(0xFFF2F5F9),
          surface: HodiColors.night,
          onSurface: Color(0xFFF2F5F9),
          onSurfaceVariant: Color(0xFF9EAEC4),
          surfaceContainerLowest: HodiColors.nightCard,
          surfaceContainerLow: HodiColors.nightCard,
          surfaceContainer: Color(0xFF122438),
          error: Color(0xFFEF4444),
          onError: Colors.white,
          outline: Color(0x1FFFFFFF),
          outlineVariant: Color(0x14FFFFFF),
        )
      : const ColorScheme.light(
          primary: HodiColors.navy,
          onPrimary: Colors.white,
          secondary: HodiColors.limeText,
          onSecondary: Colors.white,
          secondaryContainer: HodiColors.limeSoft,
          onSecondaryContainer: HodiColors.limeHover,
          surface: HodiColors.paper,
          onSurface: HodiColors.ink,
          onSurfaceVariant: HodiColors.inkMuted,
          surfaceContainerLowest: Colors.white,
          surfaceContainerLow: Colors.white,
          surfaceContainer: HodiColors.paper2,
          error: HodiColors.danger,
          onError: Colors.white,
          outline: Color(0x1F0A2540),
          outlineVariant: Color(0x140A2540),
        );

  return ThemeData(
    useMaterial3: true,
    fontFamily: 'Lufga',
    colorScheme: scheme,
    scaffoldBackgroundColor: scheme.surface,
    appBarTheme: const AppBarTheme(
      backgroundColor: HodiColors.navy,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      shape: Border(bottom: BorderSide(color: HodiColors.lime, width: 3)),
      iconTheme: IconThemeData(color: Colors.white),
      actionsIconTheme: IconThemeData(color: Colors.white),
      titleTextStyle: TextStyle(
        fontFamily: 'Lufga',
        color: Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.3,
      ),
    ),
    tabBarTheme: const TabBarThemeData(
      labelColor: Colors.white,
      unselectedLabelColor: Color(0xFF9EAEC4),
      indicatorColor: HodiColors.lime,
      indicatorSize: TabBarIndicatorSize.tab,
      dividerColor: Colors.transparent,
      labelStyle: TextStyle(
        fontFamily: 'Lufga',
        fontSize: 14,
        fontWeight: FontWeight.w600,
      ),
      unselectedLabelStyle: TextStyle(
        fontFamily: 'Lufga',
        fontSize: 14,
        fontWeight: FontWeight.w500,
      ),
    ),
    cardTheme: CardThemeData(
      color: scheme.surfaceContainerLowest,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    dividerTheme: DividerThemeData(
      color: scheme.outlineVariant,
      thickness: 1,
      space: 1,
    ),
    listTileTheme: ListTileThemeData(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: scheme.surfaceContainerLowest,
      selectedColor: dark ? HodiColors.lime : HodiColors.navy,
      secondarySelectedColor: dark ? HodiColors.lime : HodiColors.navy,
      checkmarkColor: dark ? HodiColors.navy : Colors.white,
      side: BorderSide(color: scheme.outline),
      shape: const StadiumBorder(),
      labelStyle: TextStyle(
        fontFamily: 'Lufga',
        color: scheme.onSurface,
        fontSize: 12.5,
        fontWeight: FontWeight.w600,
      ),
      secondaryLabelStyle: TextStyle(
        fontFamily: 'Lufga',
        color: dark ? HodiColors.navy : Colors.white,
        fontSize: 12.5,
        fontWeight: FontWeight.w600,
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: scheme.surfaceContainerLowest,
      surfaceTintColor: Colors.transparent,
      dragHandleColor: dark ? const Color(0x33FFFFFF) : HodiColors.muted,
      dragHandleSize: const Size(40, 4),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: scheme.surfaceContainerLowest,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: HodiColors.navy,
      contentTextStyle: const TextStyle(
        fontFamily: 'Lufga',
        color: Colors.white,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: dark ? HodiColors.lime : HodiColors.navy,
        foregroundColor: dark ? const Color(0xFF001A2E) : Colors.white,
        minimumSize: const Size.fromHeight(52),
        textStyle: const TextStyle(
          fontFamily: 'Lufga',
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
        shape: const StadiumBorder(),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: dark ? Colors.white : HodiColors.navy,
        minimumSize: const Size(0, 48),
        side: BorderSide(
          color: dark ? const Color(0x29FFFFFF) : const Color(0x2E0A2540),
        ),
        textStyle: const TextStyle(
          fontFamily: 'Lufga',
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
        shape: const StadiumBorder(),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(
          color: dark ? HodiColors.lime : HodiColors.limeText,
          width: 1.5,
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      filled: true,
      fillColor: scheme.surfaceContainerLowest,
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 64,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      backgroundColor: scheme.surfaceContainerLowest,
      surfaceTintColor: Colors.transparent,
      indicatorColor: dark ? HodiColors.limeSoftDark : HodiColors.limeSoft,
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          color: selected
              ? (dark ? HodiColors.lime : HodiColors.limeHover)
              : (dark ? const Color(0xFF9EAEC4) : HodiColors.inkSubtle),
        );
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontFamily: 'Lufga',
          fontSize: 11,
          fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
          color: selected
              ? (dark ? HodiColors.lime : HodiColors.limeHover)
              : (dark ? const Color(0xFF9EAEC4) : HodiColors.inkSubtle),
        );
      }),
    ),
  );
}
