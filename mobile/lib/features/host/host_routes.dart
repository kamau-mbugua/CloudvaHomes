import 'package:go_router/go_router.dart';

import '../billing/plan_billing_screen.dart';
import '../sms/sms_screen.dart';
import '../staff/more/expenses_screens.dart';
import '../staff/more/parity_screens.dart';
import 'booking_detail_screen.dart';
import 'booking_form_screen.dart';
import 'bookings_screen.dart';
import 'calendar_screen.dart';
import 'cleaning_screen.dart';
import 'guests_screen.dart';
import 'host_more_screen.dart';
import 'host_receipts_screen.dart';
import 'host_reports_screen.dart';
import 'host_shell.dart';
import 'listing_editor_screen.dart';
import 'listings_screen.dart';
import 'site_settings_screen.dart';
import 'today_screen.dart';

/// Host mode (`/host/...`): 5 bottom tabs (Today, Calendar, Bookings, Listings, More)
/// plus full-screen top-level routes outside the shell (no `parentNavigatorKey` inside a branch).
List<RouteBase> hostRoutes() => [
  StatefulShellRoute.indexedStack(
    builder: (_, _, shell) => HostShell(shell: shell),
    branches: [
      StatefulShellBranch(
        routes: [
          GoRoute(path: '/host', builder: (_, _) => const TodayScreen()),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/host/calendar',
            builder: (_, _) => const CalendarScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/host/bookings',
            builder: (_, _) => const BookingsScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/host/listings',
            builder: (_, _) => const ListingsScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/host/more',
            builder: (_, _) => const HostMoreScreen(),
          ),
        ],
      ),
    ],
  ),
  // Full-screen pages as top-level routes (outside the tab shell).
  GoRoute(
    path: '/host/bookings/new',
    builder: (_, state) => BookingFormScreen(
      initialListingId: state.uri.queryParameters['listingId'],
      initialCheckIn: state.uri.queryParameters['checkIn'],
      initialCheckOut: state.uri.queryParameters['checkOut'],
    ),
  ),
  GoRoute(
    path: '/host/bookings/:bookingId',
    builder: (_, state) =>
        BookingDetailScreen(bookingId: state.pathParameters['bookingId']!),
  ),
  GoRoute(
    path: '/host/listings/new',
    builder: (_, _) => const ListingEditorScreen(),
  ),
  GoRoute(
    path: '/host/listings/:listingId',
    builder: (_, state) =>
        ListingEditorScreen(listingId: state.pathParameters['listingId']),
  ),
  GoRoute(path: '/host/site', builder: (_, _) => const SiteSettingsScreen()),
  GoRoute(path: '/host/billing', builder: (_, _) => const PlanBillingScreen()),
  GoRoute(path: '/host/sms', builder: (_, _) => const SmsScreen()),
  GoRoute(path: '/host/cleaning', builder: (_, _) => const CleaningScreen()),
  GoRoute(path: '/host/guests', builder: (_, _) => const GuestsScreen()),
  GoRoute(path: '/host/expenses', builder: (_, _) => const ExpensesScreen()),
  GoRoute(
    path: '/host/expenses/new',
    builder: (_, _) => const ExpenseFormScreen(),
  ),
  GoRoute(path: '/host/reports', builder: (_, _) => const HostReportsScreen()),
  GoRoute(
    path: '/host/receipts',
    builder: (_, _) => const HostReceiptsScreen(),
  ),
  GoRoute(
    path: '/host/maintenance',
    builder: (_, _) => const StaffMaintenanceScreen(),
  ),
];
