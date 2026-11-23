import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// KodiHQ is a Cloudva Solutions product: its terms and privacy policy are Cloudva's
/// (cloudvalabs.com), which cover our mobile apps and name KodiHub.
const termsUrl = 'https://www.cloudvalabs.com/terms';
const privacyUrl = 'https://www.cloudvalabs.com/privacy';

/// Where data requests go (access, correction, erasure), per the privacy policy.
const privacyEmail = 'privacy@cloudvalabs.com';

/// Opens a page in the in-app browser (falls back to the browser app).
Future<void> openLink(BuildContext context, String url) async {
  final uri = Uri.parse(url);
  final messenger = ScaffoldMessenger.maybeOf(context);
  var ok = false;
  try {
    ok = await launchUrl(uri, mode: LaunchMode.inAppBrowserView);
    if (!ok) ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    ok = false;
  }
  if (!ok) {
    messenger?.showSnackBar(SnackBar(content: Text('Couldn’t open $url')));
  }
}

/// "Terms · Privacy" links, for the foot of sign-in and account screens.
class LegalLinks extends StatelessWidget {
  const LegalLinks({super.key, this.color});

  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? Theme.of(context).colorScheme.onSurfaceVariant;
    final style = TextStyle(
      fontSize: 12,
      color: c,
      decoration: TextDecoration.underline,
      decorationColor: c,
    );
    Widget link(String label, String url, Key key) => InkWell(
      key: key,
      borderRadius: BorderRadius.circular(6),
      onTap: () => openLink(context, url),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
        child: Text(label, style: style),
      ),
    );
    // Wraps on narrow screens and large text sizes.
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        link('Terms of service', termsUrl, const Key('link-terms')),
        Text('·', style: TextStyle(color: c)),
        link('Privacy policy', privacyUrl, const Key('link-privacy')),
      ],
    );
  }
}
