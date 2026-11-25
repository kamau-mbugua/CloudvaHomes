import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/notifications/push_service.dart';

void main() {
  test('tenant notifications open the matching tenant screen', () {
    final cases = {
      '/tenant/notices': '/tenant/notices',
      '/tenant/documents': '/tenant/documents',
      '/tenant/statement': '/tenant/statement',
      '/tenant/profile': '/tenant/profile',
      '/tenant/requests': '/tenant/requests',
      '/tenant/maintenance': '/tenant/requests',
      '/tenant/invoices/abc': '/tenant/invoices',
      '/tenant/payments': '/tenant/payments',
      '/tenant': '/tenant',
    };
    for (final e in cases.entries) {
      final r = mobileRouteForActionUrl(e.key);
      expect(r?.route, e.value, reason: e.key);
      expect(r?.mode, AppMode.tenant, reason: e.key);
    }
  });

  test(
    'push link /app/bookings/abc in host mode routes to /host/bookings/abc',
    () {
      final r = mobileRouteForActionUrl('/app/bookings/abc');
      expect(r?.route, '/host/bookings/abc');
      expect(r?.mode, AppMode.host);
    },
  );

  test('caretaker task push links open the matching staff screen', () {
    final cases = {
      '/app/meter-readings': '/staff/more/meters',
      '/app/meter-readings?propertyId=p1': '/staff/more/meters?propertyId=p1',
      '/app/units/u1': '/staff/units/u1',
      '/app/maintenance?late=true': '/staff/more/maintenance',
    };
    for (final e in cases.entries) {
      final r = mobileRouteForActionUrl(e.key);
      expect(r?.route, e.value, reason: e.key);
      expect(r?.mode, AppMode.staff, reason: e.key);
    }
  });
}
