import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/config.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets/brand_mark.dart';
import '../../core/widgets/common.dart';
import '../../core/auth/token_store.dart';
import 'saved_logins.dart';
import 'sign_in_method.dart';

/// A photo at the top of the sign-in page.
typedef SignInPhoto = ({String image, String caption});

const signInPhotos = <SignInPhoto>[
  (
    image: 'assets/images/intro_home.jpg',
    caption: 'Rent, invoices and receipts in one place',
  ),
  (
    image: 'assets/images/intro_pay.jpg',
    caption: 'Pay by M-Pesa, with a receipt in seconds',
  ),
  (
    image: 'assets/images/signin_host.jpg',
    caption: 'Short stays, bookings and guests',
  ),
  (
    image: 'assets/images/signin_manager.jpg',
    caption: 'Run your properties and your team',
  ),
  (
    image: 'assets/images/signin_tenant.jpg',
    caption: 'Your home, your account',
  ),
  (image: 'assets/images/intro_stays.jpg', caption: 'Your own booking site'),
  (
    image: 'assets/images/signin_owner.jpg',
    caption: 'Statements and payouts for owners',
  ),
];

/// The sign-in page: photos at the top, then the ways to sign in. Everyone signs in the same
/// way, whatever they use KodiHQ for; their account decides what they see.
class SignInChooserScreen extends ConsumerStatefulWidget {
  const SignInChooserScreen({super.key});

  @override
  ConsumerState<SignInChooserScreen> createState() =>
      _SignInChooserScreenState();
}

class _SignInChooserScreenState extends ConsumerState<SignInChooserScreen> {
  List<SavedCredential> _saved = const [];
  bool _restoring = false;

  @override
  void initState() {
    super.initState();
    ref.read(tokenStoreProvider).readSavedCredentials().then((creds) {
      if (mounted) setState(() => _saved = creds);
    });
  }

  /// Every saved login, phones and emails. Picking one signs back in with its saved session
  /// when that still works, else opens the way it last signed in, filled in.
  Future<void> _openSaved() async {
    final store = ref.read(tokenStoreProvider);
    final picked = await showSavedLoginsSheet(
      context,
      logins: _saved,
      onRemove: (id) async {
        await store.removeSavedCredential(id);
        final all = await store.readSavedCredentials();
        if (mounted) setState(() => _saved = all);
        return all;
      },
    );
    if (picked == null || !mounted) return;
    final token = picked.refreshToken;
    if (token != null && token.isNotEmpty) {
      setState(() => _restoring = true);
      final ok = await ref
          .read(sessionProvider.notifier)
          .signInWithSavedToken(token);
      if (!mounted) return;
      setState(() => _restoring = false);
      if (ok) return;
    }
    final method =
        SignInMethod.from(picked.method) ??
        (picked.byEmail
            ? SignInMethod.emailPassword
            : SignInMethod.phonePassword);
    context.push(method.route, extra: picked.identifier);
  }

  @override
  Widget build(BuildContext context) {
    final appConfig = ref.watch(appConfigProvider).valueOrNull;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final height = MediaQuery.sizeOf(context).height;
    final photoHeight = (height * 0.40).clamp(240.0, 380.0);
    final bg = dark ? HodiColors.night : HodiColors.paper;

    return Scaffold(
      backgroundColor: bg,
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(height: photoHeight, child: const _PhotoCarousel()),
            // The sheet slides up over the photos a little.
            Transform.translate(
              offset: const Offset(0, -24),
              child: Container(
                decoration: BoxDecoration(
                  color: bg,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(28),
                  ),
                ),
                padding: const EdgeInsets.fromLTRB(24, 26, 24, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Kicker(
                      'Sign in',
                      color: dark ? HodiColors.lime : HodiColors.limeText,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Sign in to KodiHQ',
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w600,
                        letterSpacing: -0.5,
                        color: dark ? Colors.white : HodiColors.navy,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'One account for landlords, agencies, hosts, tenants and owners.',
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.45,
                        color: dark
                            ? const Color(0xFF9EAEC4)
                            : HodiColors.inkMuted,
                      ),
                    ),
                    const SizedBox(height: 20),
                    if (appConfig?.maintenanceMode == true) ...[
                      const ErrorBox(
                        'KodiHQ is currently in maintenance mode. Only platform administrators can sign in right now.',
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (appConfig?.forceUpdateRequired == true) ...[
                      ErrorBox(
                        'Please update the KodiHQ app${appConfig?.minimumMobileVersion != null ? ' to v${appConfig!.minimumMobileVersion} or newer' : ''} for the latest features.',
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (_saved.isNotEmpty) ...[
                      _restoring
                          ? const Padding(
                              padding: EdgeInsets.all(12),
                              child: Center(child: CircularProgressIndicator()),
                            )
                          : SavedLoginsBar(
                              count: _saved.length,
                              onTap: _openSaved,
                            ),
                      const SizedBox(height: 18),
                    ],
                    const _GroupLabel('With a password'),
                    for (final m in const [
                      SignInMethod.emailPassword,
                      SignInMethod.phonePassword,
                    ])
                      _MethodButton(method: m),
                    const SizedBox(height: 12),
                    const _GroupLabel('No password · we send you a code'),
                    for (final m in const [
                      SignInMethod.phoneCode,
                      SignInMethod.emailCode,
                    ])
                      _MethodButton(method: m),
                    const SizedBox(height: 14),
                    Text(
                      'Use the email or phone your organisation, landlord or agency has for you.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12.5,
                        height: 1.4,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    if (appConfig?.allowPublicSignup != false) ...[
                      const SizedBox(height: 6),
                      TextButton(
                        onPressed: () => context.push('/register'),
                        child: const Text(
                          'New landlord, agency or host? Create an account',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotoCarousel extends StatefulWidget {
  const _PhotoCarousel();

  @override
  State<_PhotoCarousel> createState() => _PhotoCarouselState();
}

class _PhotoCarouselState extends State<_PhotoCarousel> {
  final _pages = PageController();
  Timer? _timer;
  int _page = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _timer?.cancel();
    // Turns on its own unless the phone asks for less motion.
    if (!MediaQuery.of(context).disableAnimations) {
      _timer = Timer.periodic(const Duration(seconds: 4), (_) {
        if (!_pages.hasClients) return;
        _pages.animateToPage(
          (_page + 1) % signInPhotos.length,
          duration: const Duration(milliseconds: 600),
          curve: Curves.easeInOut,
        );
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Stack(
      fit: StackFit.expand,
      children: [
        PageView.builder(
          controller: _pages,
          itemCount: signInPhotos.length,
          onPageChanged: (i) => setState(() => _page = i),
          itemBuilder: (_, i) => Image.asset(
            signInPhotos[i].image,
            fit: BoxFit.cover,
            excludeFromSemantics: true,
          ),
        ),
        // Darken top and bottom so the logo and caption read on any photo.
        const IgnorePointer(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0x99002B4D),
                  Color(0x00002B4D),
                  Color(0x00002B4D),
                  Color(0xCC002B4D),
                ],
                stops: [0, 0.3, 0.55, 1],
              ),
            ),
          ),
        ),
        Positioned(
          top: top + 12,
          left: 20,
          right: 20,
          child: Row(
            children: [
              const KodiHubLockup(
                iconSize: 26,
                fontSize: 19,
                tone: BrandTone.navy,
              ),
              const Spacer(),
              if (!AppConfig.isProd)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: HodiColors.lime,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    AppConfig.flavor.toUpperCase(),
                    style: const TextStyle(
                      fontFamily: 'JetBrainsMono',
                      color: HodiColors.navy,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
            ],
          ),
        ),
        Positioned(
          left: 24,
          right: 24,
          bottom: 44,
          child: Semantics(
            liveRegion: true,
            child: Text(
              signInPhotos[_page].caption,
              key: const Key('sign-in-photo-caption'),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w600,
                height: 1.25,
              ),
            ),
          ),
        ),
        Positioned(
          left: 24,
          bottom: 32,
          child: Row(
            children: [
              for (var i = 0; i < signInPhotos.length; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.only(right: 5),
                  width: i == _page ? 18 : 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: i == _page
                        ? HodiColors.lime
                        : Colors.white.withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _GroupLabel extends StatelessWidget {
  const _GroupLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(2, 0, 2, 8),
    child: Text(
      text.toUpperCase(),
      style: TextStyle(
        fontSize: 11.5,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.8,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    ),
  );
}

class _MethodButton extends StatelessWidget {
  const _MethodButton({required this.method});

  final SignInMethod method;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: cs.surfaceContainerLowest,
        shape: RoundedRectangleBorder(
          side: BorderSide(color: cs.outlineVariant),
          borderRadius: BorderRadius.circular(14),
        ),
        child: InkWell(
          key: Key('sign-in-with-${method.name}'),
          borderRadius: BorderRadius.circular(14),
          onTap: () => context.push(method.route),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 56),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: dark
                          ? HodiColors.limeSoftDark
                          : HodiColors.limeSoft,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      method.icon,
                      size: 19,
                      color: dark ? HodiColors.lime : HodiColors.limeText,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      method.label,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: dark ? Colors.white : HodiColors.navy,
                      ),
                    ),
                  ),
                  Icon(Icons.chevron_right, color: cs.onSurfaceVariant),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
