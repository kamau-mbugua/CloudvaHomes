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
import 'theme.dart';
import 'widgets/brand_mark.dart';
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
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: HodiColors.navy,
    body: SafeArea(
      child: Column(
        children: [
          const Spacer(),
          const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                KodiHubMark(size: 104, tone: BrandTone.navy, animated: true),
                SizedBox(height: 18),
                KodiHubWordmark(fontSize: 34, tone: BrandTone.navy),
              ],
            ),
          ),
          const Spacer(),
          const Padding(
            padding: EdgeInsets.only(bottom: 36),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Rent, reconciled.',
                  style: TextStyle(color: Color(0xFFD7E0EC), fontSize: 14),
                ),
                SizedBox(height: 6),
                Text(
                  'A CLOUDVALABS PRODUCT',
                  style: TextStyle(
                    fontFamily: 'JetBrainsMono',
                    color: Color(0xFF9EAEC4),
                    fontSize: 10.5,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 1.9,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
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
            title: 'Use KodiHub on the web',
            body:
                'This account has nothing to show in the app yet. Owners and KodiHub admins use the web app.',
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
