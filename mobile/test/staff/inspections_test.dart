import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/staff/inspections.dart';

InspectionItem item(
  String area,
  String condition, {
  List<String> photos = const [],
}) => InspectionItem(area: area, condition: condition, photoUploadIds: photos);

void main() {
  test('default areas match the web and server checklist', () {
    expect(defaultAreas, [
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
    ]);
  });

  test(
    'compareItems flags worse areas and keeps areas in only one inspection',
    () {
      final rows = compareItems(
        [item('Kitchen', 'GOOD'), item('Floors', 'FAIR')],
        [item('kitchen', 'POOR'), item('Balcony', 'GOOD')],
      );
      expect(rows.map((r) => [r.area, r.before, r.after, r.worse]).toList(), [
        ['Kitchen', 'GOOD', 'POOR', true],
        ['Floors', 'FAIR', null, false],
        ['Balcony', null, 'GOOD', false],
      ]);
    },
  );

  test('validateInspection limits areas and photos', () {
    expect(validateInspection([item('Kitchen', 'GOOD')]), isNull);
    expect(
      validateInspection(List.generate(31, (i) => item('Area $i', 'GOOD'))),
      'At most 30 areas',
    );
    expect(
      validateInspection([
        item('Kitchen', 'GOOD', photos: List.generate(7, (i) => 'p$i')),
      ]),
      'At most 6 photos for Kitchen',
    );
    expect(
      validateInspection([item('Kitchen', 'GOOD'), item('kitchen', 'FAIR')]),
      'kitchen is listed twice',
    ); // named as typed, like the server
  });

  test('items round-trip through JSON', () {
    final i = InspectionItem.fromJson({
      'area': 'Kitchen',
      'condition': 'POOR',
      'note': 'Tile',
      'photoUploadIds': ['a'],
    });
    expect(i.toJson(), {
      'area': 'Kitchen',
      'condition': 'POOR',
      'note': 'Tile',
      'photoUploadIds': ['a'],
    });
  });
}
