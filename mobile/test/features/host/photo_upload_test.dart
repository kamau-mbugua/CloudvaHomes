import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/features/host/host_models.dart';

void main() {
  test('photo upload message says what happened in plain words', () {
    expect(
      photoUploadMessage(added: 1, failed: 0, skipped: 0),
      '1 photo added.',
    );
    expect(
      photoUploadMessage(added: 4, failed: 0, skipped: 0),
      '4 photos added.',
    );
    expect(
      photoUploadMessage(added: 3, failed: 1, skipped: 0),
      '3 photos added. 1 could not be uploaded.',
    );
    expect(
      photoUploadMessage(added: 2, failed: 0, skipped: 2),
      '2 photos added. 2 not added: a listing holds up to 20 photos.',
    );
    expect(
      photoUploadMessage(added: 0, failed: 2, skipped: 0),
      'No photos added. 2 could not be uploaded.',
    );
  });

  test('photos that still fit under the 20-photo limit', () {
    expect(photosRoomLeft(0), 20);
    expect(photosRoomLeft(18), 2);
    expect(photosRoomLeft(25), 0);
  });
}
