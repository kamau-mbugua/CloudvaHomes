import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hodi/core/navigation.dart';
import 'package:hodi/features/tenant/tenant_routes.dart';

void main() {
  test('the tenant route table is valid and has the new pages', () {
    final router = GoRouter(
      navigatorKey: rootNavigatorKey,
      routes: tenantRoutes(),
    );
    addTearDown(router.dispose);
    for (final path in [
      '/tenant',
      '/tenant/invoices',
      '/tenant/payments',
      '/tenant/requests',
      '/tenant/more',
      '/tenant/statement',
      '/tenant/documents',
      '/tenant/notices',
      '/tenant/profile',
    ]) {
      expect(
        router.configuration.findMatch(Uri.parse(path)).isNotEmpty,
        isTrue,
        reason: path,
      );
    }
  });
}
