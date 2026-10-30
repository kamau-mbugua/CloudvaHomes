import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/code_sign_in_screen.dart';
import '../features/auth/forgot_password_screen.dart';
import '../features/auth/register_screen.dart';
import '../features/auth/sign_in_screen.dart';
import '../features/owner/owner_screens.dart';
import '../features/staff/staff_routes.dart';
import '../features/tenant/tenant_routes.dart';
import 'api/api_error.dart';
import 'auth/session.dart';
import 'auth/session_controller.dart';
import 'navigation.dart';
import 'widgets/common.dart';

const _public = {'/sign-in', '/sign-in/code', '/forgot', '/register'};

/// Where to send someone, given the session and the mode. Pure, so it is unit-tested.
String? redirectFor({
  required AsyncValue<Session?> session,
  required AppMode? mode,
  required String location,
}) {
  if (session.isLoading && !session.hasValue) {
    return location == '/' ? null : '/';
  }
  if (session.hasError && !session.hasValue) {
    return location == '/offline' ? null : '/offline';
  }
  final s = session.valueOrNull;
  final isPublic = _public.contains(location);
  if (s == null) return isPublic ? null : '/sign-in';
  final home = switch (mode) {
    AppMode.staff => '/staff',
    AppMode.tenant => '/tenant',
    AppMode.owner => '/owner',
    null => '/no-access',
  };
  if (isPublic || location == '/' || location == '/offline') return home;
  if (location.startsWith('/staff') && mode != AppMode.staff) return home;
  if (location.startsWith('/tenant') && mode != AppMode.tenant) return home;
  if (location.startsWith('/owner') && mode != AppMode.owner) return home;
  if (location == '/no-access' && mode != null) return home;
  return null;
}

/// Bridges Riverpod changes to go_router's refresh.
class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(Ref ref) {
    ref.listen(sessionProvider, (_, _) => notifyListeners());
    ref.listen(modeProvider, (_, _) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);
  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) => redirectFor(
      session: ref.read(sessionProvider),
      mode: ref.read(modeProvider),
      location: state.matchedLocation,
    ),
    routes: [
      GoRoute(path: '/', builder: (_, _) => const _Splash()),
      GoRoute(path: '/offline', builder: (_, _) => const _Offline()),
      GoRoute(path: '/no-access', builder: (_, _) => const _NoAccess()),
      GoRoute(path: '/sign-in', builder: (_, _) => const SignInScreen()),
      GoRoute(
        path: '/sign-in/code',
        builder: (_, _) => const CodeSignInScreen(),
      ),
      GoRoute(path: '/forgot', builder: (_, _) => const ForgotPasswordScreen()),
      GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
      tenantRoutes(),
      ownerRoutes(),
      staffRoutes(),
    ],
  );
});

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}

class _Offline extends ConsumerWidget {
  const _Offline();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final error = ref.watch(sessionProvider).error;
    return Scaffold(
      body: ErrorState(
        message: error == null ? 'Can’t reach Hodi.' : messageOf(error),
        onRetry: () => ref.invalidate(sessionProvider),
      ),
    );
  }
}

/// Signed in, but nothing the app shows (e.g. only a landlord-owner or a platform admin).
class _NoAccess extends ConsumerWidget {
  const _NoAccess();
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    body: SafeArea(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const EmptyState(
            icon: Icons.web_outlined,
            title: 'Use Hodi on the web',
            body:
                'This account has nothing to show in the app yet. Owners and Hodi admins use the web app.',
          ),
          TextButton(
            onPressed: () => ref.read(sessionProvider.notifier).signOut(),
            child: const Text('Sign out'),
          ),
        ],
      ),
    ),
  );
}
