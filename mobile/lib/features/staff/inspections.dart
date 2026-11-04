/// Move-in / move-out inspections (phase 13), mobile side. Mirrors the web helpers in
/// frontend/src/features/tenants/inspections.ts and the server's inspection-rules.ts.
library;

const defaultAreas = <String>[
  'Living room',
  'Kitchen',
  'Bedrooms',
  'Bathroom & toilet',
  'Doors & locks',
  'Windows & grilles',
  'Walls & paint',
  'Floors',
  'Electrical fittings',
  'Plumbing & taps',
];

const conditions = <String>['GOOD', 'FAIR', 'POOR', 'DAMAGED'];
const conditionLabel = <String, String>{
  'GOOD': 'Good',
  'FAIR': 'Fair',
  'POOR': 'Poor',
  'DAMAGED': 'Damaged',
};
const maxAreas = 30;
const maxPhotos = 6;

class InspectionItem {
  InspectionItem({
    required this.area,
    required this.condition,
    this.note,
    List<String>? photoUploadIds,
  }) : photoUploadIds = photoUploadIds ?? [];

  String area;
  String condition;
  String? note;
  List<String> photoUploadIds;

  factory InspectionItem.fromJson(Map<String, dynamic> j) => InspectionItem(
    area: j['area'] as String,
    condition: j['condition'] as String,
    note: j['note'] as String?,
    photoUploadIds: [
      for (final p in (j['photoUploadIds'] as List? ?? const [])) p as String,
    ],
  );

  Map<String, dynamic> toJson() => {
    'area': area,
    'condition': condition,
    if (note != null && note!.trim().isNotEmpty) 'note': note!.trim(),
    'photoUploadIds': photoUploadIds,
  };
}

class Inspection {
  Inspection({
    required this.id,
    required this.kind,
    required this.inspectedOn,
    required this.items,
    this.notes,
    this.inspectorName,
    this.tenantAcknowledgedAt,
  });

  final String id;
  final String kind;
  final String inspectedOn;
  final List<InspectionItem> items;
  final String? notes;
  final String? inspectorName;
  final String? tenantAcknowledgedAt;

  factory Inspection.fromJson(Map<String, dynamic> j) => Inspection(
    id: j['id'] as String,
    kind: j['kind'] as String,
    inspectedOn: j['inspectedOn'] as String,
    items: [
      for (final i in j['items'] as List)
        InspectionItem.fromJson(i as Map<String, dynamic>),
    ],
    notes: j['notes'] as String?,
    inspectorName: j['inspectorName'] as String?,
    tenantAcknowledgedAt: j['tenantAcknowledgedAt'] as String?,
  );
}

class CompareRow {
  CompareRow(this.area, this.before, this.after, this.worse);
  final String area;
  final String? before;
  final String? after;
  final bool worse;
}

int _rank(String c) => conditions.indexOf(c);
String _key(String area) => area.trim().toLowerCase();

/// Move-in against move-out, area by area, in move-in order.
List<CompareRow> compareItems(
  List<InspectionItem> moveIn,
  List<InspectionItem> moveOut,
) {
  final out = {for (final i in moveOut) _key(i.area): i};
  final rows = <CompareRow>[];
  for (final i in moveIn) {
    final after = out.remove(_key(i.area));
    rows.add(
      CompareRow(
        i.area,
        i.condition,
        after?.condition,
        after != null && _rank(after.condition) > _rank(i.condition),
      ),
    );
  }
  for (final i in out.values) {
    rows.add(CompareRow(i.area, null, i.condition, false));
  }
  return rows;
}

/// Null when fine, else the first problem in words.
String? validateInspection(List<InspectionItem> items) {
  if (items.length > maxAreas) return 'At most $maxAreas areas';
  final seen = <String>{};
  for (final i in items) {
    final area = i.area.trim();
    if (area.isEmpty) return 'Every area needs a name';
    if (!seen.add(area.toLowerCase())) return '$area is listed twice';
    if (i.photoUploadIds.length > maxPhotos) {
      return 'At most $maxPhotos photos for $area';
    }
  }
  return null;
}
