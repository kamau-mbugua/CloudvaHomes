import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/code_sign_in_screen.dart';
import '../features/auth/forgot_password_screen.dart';
import '../features/auth/register_screen.dart';
import '../features/auth/sign_in_screen.dart';
import '../features/owner/owner_screens.dart';
import '../features/platform/platform_screens.dart';
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
  if (s.user.mustChangePassword) {
    return location == '/change-password' ? null : '/change-password';
  }
  final home = switch (mode) {
    AppMode.staff => '/staff',
    AppMode.tenant => '/tenant',
    AppMode.owner => '/owner',
    AppMode.platform => '/platform',
    null => '/no-access',
  };
  if (isPublic ||
      location == '/' ||
      location == '/offline' ||
      location == '/change-password') {
    return home;
  }
  if (location.startsWith('/staff') && mode != AppMode.staff) return home;
  if (location.startsWith('/tenant') && mode != AppMode.tenant) return home;
  if (location.startsWith('/owner') && mode != AppMode.owner) return home;
  if (location.startsWith('/platform') && mode != AppMode.platform) return home;
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
      GoRoute(
        path: '/change-password',
        builder: (_, _) => const _MustChangePasswordScreen(),
      ),
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
      platformRoutes(),
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
        message: error == null ? 'Can’t reach KodiHub.' : messageOf(error),
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

class _MustChangePasswordScreen extends ConsumerStatefulWidget {
  const _MustChangePasswordScreen();

  @override
  ConsumerState<_MustChangePasswordScreen> createState() =>
      _MustChangePasswordScreenState();
}

class _MustChangePasswordScreenState
    extends ConsumerState<_MustChangePasswordScreen> {
  final _currentPw = TextEditingController();
  final _newPw = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _currentPw.dispose();
    _newPw.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_currentPw.text.isEmpty || _newPw.text.length < 10) {
      setState(
        () => _error =
            'Enter your temporary password and a new password of at least 10 characters.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(sessionProvider.notifier)
          .changePassword(
            currentPassword: _currentPw.text,
            newPassword: _newPw.text,
          );
      if (mounted) showMessage(context, 'Password updated.');
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Set your password'),
        actions: [
          TextButton(
            onPressed: () => ref.read(sessionProvider.notifier).signOut(),
            child: const Text(
              'Sign out',
              style: TextStyle(color: Colors.white70),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Kicker('ACTION REQUIRED'),
            const SizedBox(height: 6),
            Text(
              'Change your temporary password',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 6),
            Text(
              'You signed in with a system-generated temporary password. Choose a new password to continue using KodiHub.',
              style: TextStyle(color: muted, fontSize: 13.5, height: 1.4),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _currentPw,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Temporary password',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _newPw,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'New password (10+ characters)',
              ),
            ),
            const SizedBox(height: 16),
            if (_error != null) ...[
              ErrorBox(_error!),
              const SizedBox(height: 12),
            ],
            FilledButton(
              onPressed: _saving ? null : _submit,
              child: Text(_saving ? 'Saving…' : 'Update password & continue'),
            ),
          ],
        ),
      ),
    );
  }
}
