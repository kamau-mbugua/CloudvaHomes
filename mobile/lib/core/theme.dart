import 'package:flutter/material.dart';

/// Hodi's dark-blue & light-surface palette.
abstract final class HodiColors {
  static const navy = Color(0xFF002B4D);
  static const navyDeep = Color(0xFF041C34);
  static const navyMid = Color(0xFF0A3E6B);
  static const blueAccent = Color(0xFF1D63B8);
  static const skySoft = Color(0xFFEDF5FF);
  static const mintSoft = Color(0xFFE7F4E8);
  static const amberSoft = Color(0xFFFFF4E4);
  static const roseSoft = Color(0xFFFFE2E5);
  static const olive = Color(0xFF1D63B8);
  static const oliveSoft = Color(0xFFEDF5FF);
  static const lime = Color(0xFF60A5FA);
  static const limeSoft = Color(0xFF102A45);
  static const paper = Color(0xFFF4F7FC);
  static const ink = Color(0xFF091E3A);
  static const inkMuted = Color(0xFF5A6E85);
  static const night = Color(0xFF061322);
  static const nightCard = Color(0xFF0C1E33);
  static const success = Color(0xFF157347);
  static const warning = Color(0xFFB45309);
  static const danger = Color(0xFFDC2626);
}

ThemeData hodiTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: dark ? HodiColors.lime : HodiColors.navy,
    onPrimary: dark ? HodiColors.night : Colors.white,
    secondary: dark ? HodiColors.lime : HodiColors.blueAccent,
    onSecondary: dark ? HodiColors.night : Colors.white,
    secondaryContainer: dark ? HodiColors.limeSoft : HodiColors.skySoft,
    onSecondaryContainer: dark ? const Color(0xFFF2F5F9) : HodiColors.navy,
    error: dark ? const Color(0xFFEF4444) : HodiColors.danger,
    onError: Colors.white,
    surface: dark ? HodiColors.night : HodiColors.paper,
    onSurface: dark ? const Color(0xFFF2F5F9) : HodiColors.ink,
    onSurfaceVariant: dark ? const Color(0xFF9EAEC4) : HodiColors.inkMuted,
    surfaceContainerLowest: dark ? HodiColors.nightCard : Colors.white,
    surfaceContainerLow: dark ? HodiColors.nightCard : Colors.white,
    surfaceContainer: dark ? const Color(0xFF122438) : const Color(0xFFE8EFF8),
    outline: dark ? const Color(0x33FFFFFF) : const Color(0x29002B4D),
    outlineVariant: dark ? const Color(0x1FFFFFFF) : const Color(0x14002B4D),
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
        color: dark ? scheme.onSurface : HodiColors.navy,
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
        borderRadius: BorderRadius.circular(18),
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
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: scheme.surfaceContainerLowest,
      selectedColor: scheme.secondaryContainer,
      side: BorderSide(color: scheme.outlineVariant),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
      contentTextStyle: const TextStyle(color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: dark ? HodiColors.lime : HodiColors.navy,
        foregroundColor: dark ? HodiColors.night : Colors.white,
        minimumSize: const Size.fromHeight(48),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: dark ? Colors.white : HodiColors.navy,
        minimumSize: const Size(0, 44),
        side: BorderSide(color: scheme.outline),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(
          color: dark ? HodiColors.lime : HodiColors.navy,
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
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          color: selected
              ? (dark ? HodiColors.lime : HodiColors.navy)
              : scheme.onSurfaceVariant,
        );
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 12,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          color: selected
              ? (dark ? Colors.white : HodiColors.navy)
              : scheme.onSurfaceVariant,
        );
      }),
    ),
  );
}
