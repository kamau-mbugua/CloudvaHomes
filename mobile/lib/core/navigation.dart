import 'package:flutter/widgets.dart';

/// The app's root navigator. Detail screens opened from a tab use it
/// (`parentNavigatorKey: rootNavigatorKey`) so they cover the tab shell: one app bar, no tabs.
final rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');
