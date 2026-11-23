import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/intro.dart';
import '../../core/theme.dart';
import '../../core/widgets/brand_mark.dart';

/// One intro page.
typedef IntroSlide = ({String image, String kicker, String title, String body});

const introSlides = <IntroSlide>[
  (
    image: 'assets/images/intro_home.jpg',
    kicker: 'Rent, made simple',
    title: 'Every home in one app',
    body:
        'Landlords, agencies, tenants and owners see the same up-to-date rent, invoices and receipts.',
  ),
  (
    image: 'assets/images/intro_pay.jpg',
    kicker: 'M-Pesa built in',
    title: 'Pay and get paid from your phone',
    body:
        'Tenants and guests pay by M-Pesa, and a receipt arrives the moment the money lands.',
  ),
  (
    image: 'assets/images/intro_stays.jpg',
    kicker: 'Short stays too',
    title: 'Run your short stays',
    body:
        'Take bookings on your own site, see who arrives today and keep every unit ready.',
  ),
];

/// First launch only: a few swipeable pages about KodiHQ, then the sign-in choices.
class IntroScreen extends ConsumerStatefulWidget {
  const IntroScreen({super.key});

  @override
  ConsumerState<IntroScreen> createState() => _IntroScreenState();
}

class _IntroScreenState extends ConsumerState<IntroScreen> {
  final _pages = PageController();
  int _page = 0;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<void> _done() async {
    await finishIntro(ref);
    if (mounted) context.go('/sign-in');
  }

  void _next() {
    if (_page == introSlides.length - 1) {
      _done();
    } else {
      _pages.nextPage(
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final last = _page == introSlides.length - 1;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: dark ? HodiColors.night : HodiColors.paper,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 8, 0),
              child: Row(
                children: [
                  const KodiHubLockup(iconSize: 24, fontSize: 18),
                  const Spacer(),
                  if (!last)
                    TextButton(onPressed: _done, child: const Text('Skip')),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pages,
                itemCount: introSlides.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (_, i) => _Slide(slide: introSlides[i]),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
              child: Row(
                children: [
                  Semantics(
                    label: 'Page ${_page + 1} of ${introSlides.length}',
                    child: Row(
                      children: [
                        for (var i = 0; i < introSlides.length; i++)
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            margin: const EdgeInsets.only(right: 6),
                            width: i == _page ? 22 : 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: i == _page
                                  ? HodiColors.lime
                                  : const Color(0xFFCBD5E1),
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  FilledButton(
                    key: const Key('intro-next'),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 52),
                      padding: const EdgeInsets.symmetric(horizontal: 28),
                    ),
                    onPressed: _next,
                    child: Text(last ? 'Get started' : 'Next'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Slide extends StatelessWidget {
  const _Slide({required this.slide});

  final IntroSlide slide;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return LayoutBuilder(
      builder: (context, c) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(28),
              child: SizedBox(
                height: (c.maxHeight * 0.58).clamp(220.0, 460.0),
                width: double.infinity,
                child: Image.asset(
                  slide.image,
                  fit: BoxFit.cover,
                  excludeFromSemantics: true,
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              slide.kicker.toUpperCase(),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.2,
                color: dark ? HodiColors.lime : HodiColors.limeText,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              slide.title,
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w600,
                height: 1.15,
                letterSpacing: -0.5,
                color: dark ? Colors.white : HodiColors.navy,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              slide.body,
              style: TextStyle(
                fontSize: 15,
                height: 1.5,
                color: dark ? const Color(0xFF9EAEC4) : HodiColors.inkMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
