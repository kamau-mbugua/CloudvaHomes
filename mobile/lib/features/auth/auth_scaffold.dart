import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/config.dart';
import '../../core/theme.dart';
import '../../core/widgets/brand_mark.dart';
import '../../core/widgets/common.dart';

/// Clean `#FAFAF7` auth layout matching `03_sign_in_email.html` & `04_sign_in_phone_code.html`.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    super.key,
    required this.title,
    this.kicker,
    this.subtitle,
    required this.children,
    this.back = false,
    this.onBack,
  });
  final String title;
  final String? kicker;
  final String? subtitle;
  final List<Widget> children;
  final bool back;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final showBack = back || onBack != null;
    final topPad = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: dark ? HodiColors.night : HodiColors.paper,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(
              showBack ? 12 : 24,
              topPad + 12,
              24,
              8,
            ),
            child: Row(
              children: [
                if (showBack) ...[
                  IconButton(
                    tooltip: 'Back',
                    icon: const Icon(Icons.chevron_left_rounded, size: 28),
                    color: dark ? Colors.white : HodiColors.navy,
                    onPressed: onBack ?? () => Navigator.of(context).maybePop(),
                  ),
                  const Spacer(),
                  const KodiHubLockup(iconSize: 22, fontSize: 17),
                ] else ...[
                  const KodiHubLockup(iconSize: 28, fontSize: 20),
                  const Spacer(),
                ],
                if (!AppConfig.isProd) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: HodiColors.limeSoft,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      AppConfig.flavor.toUpperCase(),
                      style: const TextStyle(
                        fontFamily: 'JetBrainsMono',
                        color: HodiColors.limeHover,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 12, 24, 28),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Kicker(
                      kicker ?? 'Sign in',
                      color: dark ? HodiColors.lime : HodiColors.limeText,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      title,
                      style: TextStyle(
                        color: dark ? Colors.white : HodiColors.navy,
                        fontSize: 28,
                        fontWeight: FontWeight.w600,
                        letterSpacing: -0.7,
                        height: 1.15,
                      ),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        subtitle!,
                        style: TextStyle(
                          color: dark
                              ? const Color(0xFF9EAEC4)
                              : HodiColors.inkMuted,
                          fontSize: 14,
                          height: 1.45,
                        ),
                      ),
                    ],
                    const SizedBox(height: 22),
                    ...children,
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 6-digit OTP / 2FA code input matching `04_sign_in_phone_code.html` (6 individual boxes
/// with active `#4D6B10` focus ring, backed by a real [TextField] for keyboard/autofill/tests).
class SixDigitCodeField extends StatefulWidget {
  const SixDigitCodeField({
    super.key,
    required this.controller,
    required this.labelText,
    this.autofocus = true,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String labelText;
  final bool autofocus;
  final ValueChanged<String>? onSubmitted;

  @override
  State<SixDigitCodeField> createState() => _SixDigitCodeFieldState();
}

class _SixDigitCodeFieldState extends State<SixDigitCodeField> {
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_rebuild);
    _focusNode.addListener(_rebuild);
  }

  @override
  void didUpdateWidget(covariant SixDigitCodeField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_rebuild);
      widget.controller.addListener(_rebuild);
    }
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.controller.removeListener(_rebuild);
    _focusNode.removeListener(_rebuild);
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final text = widget.controller.text;
    final focused = _focusNode.hasFocus;
    final activeIndex = text.length.clamp(0, 5);

    return SizedBox(
      height: 60,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Row(
            children: [
              for (var i = 0; i < 6; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(
                  child: Container(
                    height: 58,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: dark ? HodiColors.nightCard : Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: focused && i == activeIndex
                            ? (dark ? HodiColors.lime : HodiColors.limeText)
                            : (dark
                                  ? const Color(0x29FFFFFF)
                                  : const Color(0x2E0A2540)),
                        width: focused && i == activeIndex ? 1.5 : 1.0,
                      ),
                      boxShadow: focused && i == activeIndex
                          ? [
                              BoxShadow(
                                color: HodiColors.limeText.withValues(
                                  alpha: 0.16,
                                ),
                                spreadRadius: 4,
                              ),
                            ]
                          : null,
                    ),
                    child: Text(
                      i < text.length ? text[i] : '',
                      style: TextStyle(
                        fontFamily: 'JetBrainsMono',
                        fontSize: 22,
                        fontWeight: FontWeight.w600,
                        color: dark ? Colors.white : HodiColors.navy,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
          Opacity(
            opacity: 0.01,
            child: TextField(
              controller: widget.controller,
              focusNode: _focusNode,
              autofocus: widget.autofocus,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(6),
              ],
              decoration: InputDecoration(
                labelText: widget.labelText,
                border: InputBorder.none,
              ),
              onSubmitted: widget.onSubmitted,
            ),
          ),
        ],
      ),
    );
  }
}
