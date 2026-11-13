import '../../../core/money.dart';
import '../staff_models.dart';

/// The property's charges a one-off invoice for this unit can pick: active, and for this unit
/// (a charge with no units listed applies to every unit).
List<Json> chargesForUnit(List<Json> charges, String unitId) => [
  for (final c in charges)
    if ((c['status'] ?? 'ACTIVE') == 'ACTIVE' && _appliesTo(c, unitId)) c,
];

bool _appliesTo(Json c, String unitId) {
  final units = (c['unitIds'] as List?) ?? const [];
  return units.isEmpty || units.contains(unitId);
}

/// How a charge reads in the picker: "Garbage · KES 300 a month", "Water · KES 150 per m³".
String chargeOptionLabel(Json c) {
  final name = c['name'] as String? ?? 'Charge';
  if (c['kind'] == 'FIXED' && c['amount'] != null) {
    return '$name · ${formatKes(centsFrom(c['amount']))} a month';
  }
  if (c['kind'] == 'METERED' && c['unitRate'] != null) {
    return '$name · ${formatKes(centsFrom(c['unitRate']))} per ${c['unitLabel'] ?? 'unit'}';
  }
  return '$name · amount varies';
}

/// The line a picked charge fills in: its name, and its monthly amount when it has a fixed one
/// (a varying or metered charge leaves the amount to type).
({String description, String amount}) chargeLineFor(Json c) => (
  description: c['name'] as String? ?? '',
  amount: c['kind'] == 'FIXED' && c['amount'] != null
      ? (centsFrom(c['amount']) / 100).toStringAsFixed(
          centsFrom(c['amount']) % 100 == 0 ? 0 : 2,
        )
      : '',
);
