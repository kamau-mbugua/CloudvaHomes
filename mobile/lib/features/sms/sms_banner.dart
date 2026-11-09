import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/theme.dart';
import 'sms_api.dart';
import 'sms_models.dart';

/// Above every screen while the organisation's SMS needs attention: KodiHub units low or out,
/// or its own SMS account failing. Only for people who may see SMS; taps open Settings → SMS.
class SmsBanner extends ConsumerWidget {
  const SmsBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    if (session == null || !session.can('sms:view')) {
      return const SizedBox.shrink();
    }
    final account = ref.watch(smsAccountProvider).value;
    final banner = account == null ? null : smsBanner(account);
    if (banner == null) return const SizedBox.shrink();
    final color = banner.danger
        ? Theme.of(context).colorScheme.error
        : HodiColors.warning;
    return Material(
      color: banner.danger
          ? Theme.of(context).colorScheme.errorContainer
          : HodiColors.warningSoft,
      child: InkWell(
        onTap: () => context.push(session.isHost ? '/host/sms' : '/staff/sms'),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              Icon(Icons.sms_failed_outlined, color: color, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  banner.text,
                  style: TextStyle(color: color, fontWeight: FontWeight.w600),
                ),
              ),
              if (session.can('sms:manage'))
                Text(
                  banner.buy ? 'Buy SMS' : 'Check',
                  style: TextStyle(color: color, fontWeight: FontWeight.w700),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
