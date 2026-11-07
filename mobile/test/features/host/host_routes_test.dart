import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hodi/core/auth/session.dart';
import 'package:hodi/core/auth/session_controller.dart';
import 'package:hodi/core/navigation.dart';
import 'package:hodi/core/providers.dart';
import 'package:hodi/features/host/host_routes.dart';

import '../../staff/helpers.dart';

Session _hostSession(Set<String> permissions) => Session(
  accessToken: 'token',
  user: SessionUser(
    id: 'u1',
    firstName: 'Host',
    lastName: 'User',
    email: 'host@example.invalid',
    phone: '+254700000001',
  ),
  organizations: [
    OrgMembership(
      id: 'o1',
      name: 'Cozy Stays',
      roleName: 'Owner',
      kind: 'HOST',
    ),
  ],
  activeOrganization: ActiveOrg(
    id: 'o1',
    name: 'Cozy Stays',
    kind: 'HOST',
    status: 'ACTIVE',
  ),
  permissions: permissions,
  tenantOf: const [],
  ownerOf: const [],
);

void main() {
  test('host route table builds without go_router assertions', () {
    final router = GoRouter(
      navigatorKey: rootNavigatorKey,
      routes: hostRoutes(),
    );
    addTearDown(router.dispose);

    for (final path in [
      '/host',
      '/host/calendar',
      '/host/bookings',
      '/host/listings',
      '/host/more',
      '/host/listings/new',
      '/host/listings/l1',
      '/host/site',
    ]) {
      expect(
        router.configuration.findMatch(Uri.parse(path)).isNotEmpty,
        isTrue,
        reason: path,
      );
    }
  });

  testWidgets(
    'caretaker sees Today, Calendar and More (and More shows Cleaning)',
    (tester) async {
      phoneSize(tester);
      final adapter = FakeAdapter({
        'GET /billing': (_) => {
          'data': {
            'status': 'ACTIVE',
            'balance': 0,
            'credit': 0,
            'plan': {'name': 'Standard'},
            'price': {'pricePerUnit': 10000, 'minimumMonthly': 0},
          },
        },
      });
      final router = GoRouter(
        navigatorKey: rootNavigatorKey,
        initialLocation: '/host/more',
        routes: hostRoutes(),
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            apiClientProvider.overrideWithValue(fakeApi(adapter)),
            sessionProvider.overrideWith(
              () => FakeSession(
                _hostSession({
                  'properties:view',
                  'listings:view',
                  'bookings:view',
                  'bookings:update',
                  'cleaning:view',
                  'cleaning:update',
                  'maintenance:view',
                }),
              ),
            ),
          ],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pumpAndSettle();

      final navBar = find.byType(NavigationBar);
      expect(navBar, findsOneWidget);
      expect(
        find.descendant(of: navBar, matching: find.text('Today')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navBar, matching: find.text('Calendar')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navBar, matching: find.text('More')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: navBar, matching: find.text('Bookings')),
        findsNothing,
      );
      expect(
        find.descendant(of: navBar, matching: find.text('Listings')),
        findsNothing,
      );

      // More shows Cleaning for caretaker.
      expect(find.text('Cleaning'), findsOneWidget);
    },
  );
}
