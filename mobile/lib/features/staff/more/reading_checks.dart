/// "123.4" style quantities: digits with up to 3 decimals, as the API takes them.
String? normaliseQuantity(String input) {
  final t = input.trim().replaceAll(',', '');
  return RegExp(r'^\d+(\.\d{1,3})?$').hasMatch(t) ? t : null;
}

/// Thousandths, to compare readings without doubles.
int milli(String quantity) {
  final parts = quantity.split('.');
  final frac = (parts.length > 1 ? parts[1] : '')
      .padRight(3, '0')
      .substring(0, 3);
  return int.parse(parts[0]) * 1000 + int.parse(frac);
}

/// "120.500" → "120.5"; "10.000" → "10".
String trimQuantity(String quantity) {
  if (!quantity.contains('.')) return quantity;
  return quantity
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');
}

/// Thousandths → trimmed decimal string (e.g. 45000 → "45", 12500 → "12.5").
String formatMilli(int value) {
  final neg = value < 0;
  final abs = neg ? -value : value;
  final raw =
      '${neg ? '-' : ''}${abs ~/ 1000}.${(abs % 1000).toString().padLeft(3, '0')}';
  return trimQuantity(raw);
}

/// True only when [averageUse] is a number above 0 and `current - previous > 3 × averageUse`.
bool isUnusualUse({
  required String previous,
  required String current,
  String? averageUse,
}) {
  if (averageUse == null) return false;
  final avg = normaliseQuantity(averageUse);
  if (avg == null) return false;
  final avgMilli = milli(avg);
  if (avgMilli <= 0) return false;
  final prev = normaliseQuantity(previous);
  final curr = normaliseQuantity(current);
  if (prev == null || curr == null) return false;
  return milli(curr) - milli(prev) > 3 * avgMilli;
}
