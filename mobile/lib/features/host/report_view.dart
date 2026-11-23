// Periods and wording for the host's Reports screen.

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

String _iso(DateTime d) => d.toIso8601String().substring(0, 10);

typedef ReportPeriod = ({String key, String label, String from, String to});

/// This month (to today), last month, the last three months and this year (to today).
List<ReportPeriod> reportPeriods(String todayIso) {
  final p = todayIso.split('-').map(int.parse).toList();
  final y = p[0];
  final m = p[1];
  final firstOfMonth = DateTime.utc(y, m, 1);
  final lastMonthStart = DateTime.utc(y, m - 1, 1);
  final lastMonthEnd = firstOfMonth.subtract(const Duration(days: 1));
  return [
    (key: 'month', label: 'This month', from: _iso(firstOfMonth), to: todayIso),
    (
      key: 'last',
      label: 'Last month',
      from: _iso(lastMonthStart),
      to: _iso(lastMonthEnd),
    ),
    (
      key: '3m',
      label: 'Last 3 months',
      from: _iso(DateTime.utc(y, m - 2, 1)),
      to: todayIso,
    ),
    (key: 'year', label: 'This year', from: '$y-01-01', to: todayIso),
  ];
}

/// "1 – 21 Nov 2026", "1 Sep – 21 Nov 2026", "1 Jan – 21 Nov 2026".
String periodRange(String from, String to) {
  final a = from.split('-').map(int.parse).toList();
  final b = to.split('-').map(int.parse).toList();
  if (a[0] == b[0] && a[1] == b[1]) {
    return '${a[2]} – ${b[2]} ${_months[b[1] - 1]} ${b[0]}';
  }
  final left = a[0] == b[0]
      ? '${a[2]} ${_months[a[1] - 1]}'
      : '${a[2]} ${_months[a[1] - 1]} ${a[0]}';
  return '$left – ${b[2]} ${_months[b[1] - 1]} ${b[0]}';
}

/// "2026-11" → "Nov".
String monthShort(String period) {
  final parts = period.split('-');
  return parts.length < 2 ? period : _months[int.parse(parts[1]) - 1];
}

/// "1.9%" with one decimal under 10%, whole numbers above.
String percent(double fraction) {
  final pct = fraction * 100;
  return pct < 10 && pct > 0 ? '${pct.toStringAsFixed(1)}%' : '${pct.round()}%';
}
