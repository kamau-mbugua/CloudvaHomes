import 'package:intl/intl.dart';

/// Money is integer cents everywhere (as on the API); only this file turns it into text.
final _grouped = NumberFormat('#,##0.00', 'en_US');

/// 2500000 → "KES 25,000.00"; negatives as "-KES 1,000.00".
String formatKes(int cents) {
  final sign = cents < 0 ? '-' : '';
  return '${sign}KES ${_grouped.format(cents.abs() / 100)}';
}

/// "1,250.50" / "1250" → 125050 cents, or null when it isn't an amount (at most 2 decimals).
int? parseKes(String input) {
  final text = input.trim().replaceAll(',', '').replaceAll(' ', '');
  final m = RegExp(r'^(\d+)(?:\.(\d{1,2}))?$').firstMatch(text);
  if (m == null) return null;
  final whole = int.parse(m.group(1)!);
  final frac = (m.group(2) ?? '').padRight(2, '0');
  return whole * 100 + int.parse(frac.isEmpty ? '0' : frac);
}

/// JSON money: the API sends cents as numbers (or numeric strings for very large values).
int centsFrom(Object? v) => switch (v) {
  int i => i,
  num n => n.round(),
  String s => int.tryParse(s) ?? 0,
  _ => 0,
};

/// M-Pesa takes whole shillings: round a balance up to the next shilling.
int wholeShillingsUp(int cents) => cents <= 0 ? 0 : ((cents + 99) ~/ 100) * 100;
