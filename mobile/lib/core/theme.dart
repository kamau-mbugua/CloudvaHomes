import 'package:flutter/material.dart';

/// Hodi's colours, from the web app's `styles/tokens.css`. Fonts: the platform's own (the
/// web's Lufga licence for apps is still an open question).
abstract final class HodiColors {
  static const navy = Color(0xFF002B4D);
  static const olive = Color(0xFF4D6B10);
  static const oliveSoft = Color(0xFFEEF6DB);
  static const lime = Color(0xFF9DD000);
  static const limeSoft = Color(0xFF1C2E14);
  static const paper = Color(0xFFFAFAF7);
  static const ink = Color(0xFF0A2540);
  static const inkMuted = Color(0xFF52647E);
  static const night = Color(0xFF06121F);
  static const nightCard = Color(0xFF0C1E33);
  static const success = Color(0xFF1F7A4F);
  static const warning = Color(0xFF9A5B00);
  static const danger = Color(0xFFDC2626);
}

ThemeData hodiTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: dark ? HodiColors.lime : HodiColors.navy,
    onPrimary: dark ? HodiColors.night : Colors.white,
    secondary: dark ? HodiColors.lime : HodiColors.olive,
    onSecondary: dark ? HodiColors.night : Colors.white,
    secondaryContainer: dark ? HodiColors.limeSoft : HodiColors.oliveSoft,
    onSecondaryContainer: dark ? const Color(0xFFF2F5F9) : HodiColors.ink,
    error: dark ? const Color(0xFFEF4444) : HodiColors.danger,
    onError: Colors.white,
    surface: dark ? HodiColors.night : HodiColors.paper,
    onSurface: dark ? const Color(0xFFF2F5F9) : HodiColors.ink,
    onSurfaceVariant: dark ? const Color(0xFF9EAEC4) : HodiColors.inkMuted,
    surfaceContainerLowest: dark ? HodiColors.nightCard : Colors.white,
    surfaceContainerLow: dark ? HodiColors.nightCard : Colors.white,
    surfaceContainer: dark ? const Color(0xFF122438) : const Color(0xFFF1EFE9),
    outline: dark ? const Color(0x33FFFFFF) : const Color(0x330A2540),
    outlineVariant: dark ? const Color(0x1FFFFFFF) : const Color(0x1F0A2540),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: scheme.surface,
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      foregroundColor: scheme.onSurface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: scheme.onSurface,
        fontSize: 19,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
      ),
    ),
    cardTheme: CardThemeData(
      color: scheme.surfaceContainerLowest,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
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
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: scheme.surfaceContainerLowest,
      selectedColor: scheme.secondaryContainer,
      side: BorderSide(color: scheme.outlineVariant),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      labelStyle: TextStyle(
        color: scheme.onSurface,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: scheme.surfaceContainerLowest,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: dark ? HodiColors.lime : HodiColors.olive,
        foregroundColor: dark ? HodiColors.night : Colors.white,
        minimumSize: const Size.fromHeight(48),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 44),
        side: BorderSide(color: scheme.outline),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(
          color: dark ? HodiColors.lime : HodiColors.olive,
          width: 1.5,
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      filled: true,
      fillColor: scheme.surfaceContainerLowest,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: scheme.surfaceContainerLowest,
      surfaceTintColor: Colors.transparent,
      indicatorColor: scheme.secondaryContainer,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 12,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          color: selected ? scheme.onSurface : scheme.onSurfaceVariant,
        );
      }),
    ),
  );
}
