import 'package:fluro/fluro.dart';
import 'package:flutter/material.dart';
import 'package:hodi_app/route/routes.dart';
import 'package:hodi_app/screens/home/meters_page.dart';
import 'package:hodi_app/screens/home/tenants_page.dart';
import 'package:hodi_app/screens/properties/properties_page.dart';
import 'package:hodi_app/screens/properties/tenants/add_tenant_page.dart';
import 'package:hodi_app/screens/webview/WebViewPage.dart';

import '../pdf/pdf_page.dart';
import '../screens/admin/user_groups/list_user_groups_page.dart';
import '../screens/admin/users/add_users.dart';
import '../screens/admin/users/list_users_page.dart';
import '../screens/auth/forget_password_page.dart';
import '../screens/auth/login_page.dart';
import '../screens/auth/profile_page.dart';
import '../screens/config/new_let_fees/add_onboarding_fee_page.dart';
import '../screens/config/new_let_fees/new_le_fees_page_list.dart';
import '../screens/config/payment_config/assign_payment_page.dart';
import '../screens/config/payment_config/payment_page.dart';
import '../screens/config/payment_config/payment_v2/payment_form_page.dart';
import '../screens/config/payment_config/payment_v2/payment_types_list_page.dart';
import '../screens/config/payment_config/payments_config_page.dart';
import '../screens/config/utility_bill/add_utility_bill_page.dart';
import '../screens/config/utility_bill/utility_bill_page.dart';
import '../screens/expenditure/expense_expensidture_tabs/expense_expenditure_tabs_pages.dart';
import '../screens/expenditure/expenses/add_expense_page.dart';
import '../screens/expenditure/expenses/expenses_page.dart';
import '../screens/expenditure/recurrent/add_expenditure.dart';
import '../screens/expenditure/recurrent/recureent_expenditure_page.dart';
import '../screens/home/home_page.dart';
import '../screens/home/houses_page.dart';
import '../screens/home/houses_tabs_page.dart';
import '../screens/properties/houses/add_houses_page.dart';
import '../screens/properties/houses/house_details_page.dart';
import '../screens/invoices/estate/estate_invoice_detail_page.dart';
import '../screens/invoices/estate/estate_invoices_page.dart';
import '../screens/invoices/tenants/invoice_detail_page.dart';
import '../screens/invoices/tenants/tabs/tenants_invoices_unpaid_page.dart';
import '../screens/invoices/tenants/tenants_invoices_page.dart';
import '../screens/properties/houses/tabs/houses_ocupied_page.dart';
import '../screens/properties/meter/add_meter_page.dart';
import '../screens/properties/meter/meter_filter.dart';
import '../screens/properties/meter/update_meter_reading_page.dart';
import '../screens/properties/houses/house_categories.dart';
import '../screens/properties/tenants/tenants_details_page.dart';
import '../screens/splash/splash_page.dart';
import '../screens/transactions/payment_detail_page.dart';
import '../screens/transactions/payment_statement_page.dart';
import '../screens/transactions/property_report_page.dart';
import '../screens/transactions/transactions_page.dart';

class RouterHelper {
  static final FluroRouter router = FluroRouter();

  // Route handlers
  static final Handler _homeHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) =>
        HomeScreen(),
  );

  static final Handler _splashHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) =>
        SplashScreen(),
  );

  static final Handler _profileHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) =>
        ProfilePage(),
  );

  static final Handler _loginHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) =>
        LoginScreen(),
  );

  static final Handler _forgetPasswordHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) =>
        ForgetPasswordScreen(),
  );

  static final Handler _addMeterHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      // final Function(bool) isMeterAdded =
      //     context!.settings!.arguments as Function(bool);

      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      final Function(bool) isMeterAdded =
          args['isMeterAdded'] as Function(bool);

      return AddMeterPage(isMeterAdded: isMeterAdded);
    },
  );

  static final Handler _paymentHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;

      return PaymentPage(
          propertyId: args['propertyId'],
        invoiceId: args['invoiceId'],
        amount: args['amount'],
        paidBy: args['paidBy'],
        phoneNo: args['phoneNo'],
      );
    },
  );

  static final Handler _webViewHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;

      return WebViewPage(
        url: args['url'],
        title: args['title'],
      );
    },
  );

  static final Handler _paymentListHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;

      return PaymentTypesListPage(
          propertyId: args['propertyId'],
        originInvoice: args['originInvoice'],
        paymentPayload: args['paymentPayload'],
      );
    },
  );

  static final Handler _paymentProcessingHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;

      return PaymentFormPage(
        paymentPayload: args['paymentPayload'],
      );
    },
  );




  static final Handler _editMeterHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return UpdateMeterReadingPage(
        metreId: args['metreId'],
        houseName: args['houseName'],
        metreNo: args['metreNo'],
        metrePaymentContent: args['metrePaymentContent'],
      );
    },
  );

  static final Handler _paymentPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return TransactionsPage(
          propertyId: args['propertyId'], self: args['self']);
    },
  );

  static final Handler _filterMeterPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return MeterFiltersPage(
          propertyId: args['propertyId'], onFilter: args['onFilter']);
    },
  );

  static final Handler _tenantsPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return TenantsPage(
          propertyIdNotifier: args['propertyIdNotifier'],
          isAppBar: args['isAppBar'] ?? false,
          self: args['self'] ?? false,
        tenantId: "",
        isMyHouses: args['isMyHouses'] ?? false,
      );
    },
  );

  static final Handler _housesCategoriesPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return HouseCategoriesPage(
          propertyIdNotifier: args['propertyIdNotifier']);
    },
  );

  static final Handler _expenditureExpensePageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return ExpenseExpenditureTabsPage(
          propertyIdNotifier: args['propertyIdNotifier']);
    },
  );

  static final Handler _recurrentExpenditurePageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return RecurrentExpenditurePage(
          propertyIdNotifier: args['propertyIdNotifier']);
    },
  );

  static final Handler _invoiceDetailPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return InvoiceDetailPage(
          invoiceRef: args['invoiceRef']);
    },
  );

  static final Handler _paymentDetailPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return PaymentDetailPage(
          paymentRef: args['paymentRef']);
    },
  );

  static final Handler _estateInvoiceDetailPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return EstateInvoiceDetailPage(
          invoiceRef: args['invoiceRef']);
    },
  );

  static final Handler _expensesPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return ExpensesListPage(propertyIdNotifier: args['propertyIdNotifier']);
    },
  );
  static final Handler _pdfViewPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return PdfPreviewScreen(pdfPath: args['pdfPath']);
    },
  );

  static final Handler _propertyPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return PropertyReportPage(propertyIdNotifier: args['propertyIdNotifier']);
    },
  );

  static final Handler _paymentStatementPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return PaymentStatementPage(
        propertyIdNotifier: args['propertyIdNotifier'],
        isFilterByDate: args['isFilterByDate'],
      );
    },
  );

  static final Handler _utilityBillListPagePageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return UtilityBillListPage(
          propertyIdNotifier: args['propertyIdNotifier']);
    },
  );

  static final Handler _onboardingFeeistPagePageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return NewLetFeesListPage(propertyIdNotifier: args['propertyIdNotifier']);
    },
  );

  static final Handler _paymentTypeListPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return PaymentsTypeListPage(
          propertyIdNotifier: args['propertyIdNotifier']);
    },
  );

  static final Handler _tetantInvoicesPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return TenantsInvoicesPage(
          propertyIdNotifier: args['propertyIdNotifier'],
          isSelf: args['isSelf'] ?? false);
    },
  );

  static final Handler _tetantUnpaidInvoicesPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return TenantsInvoicesUnpaidPage(
          propertyIdNotifier: args['propertyIdNotifier'], isShowAppBar: true);
    },
  );
  //
  // static final Handler _housesPageHandler = Handler(
  //   handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
  //     final Map<String, dynamic> args =
  //         context!.settings!.arguments as Map<String, dynamic>;
  //     return HousesPage(
  //         propertyIdNotifier: args['propertyIdNotifier'],
  //         isAppBar: args['isAppBar']);
  //   },
  // );

  static final Handler _housesPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return HousesTabsPage(
          propertyIdNotifier: args['propertyIdNotifier'],
          isAppBar: args['isAppBar']);
    },
  );

  static final Handler _housesOccupiedPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return OccupiedHousesPage(
          propertyIdNotifier: args['propertyIdNotifier'],
          isAppBar: args['isAppBar'],
        isSelf: args['isSelf'],
      );
    },
  );

  static final Handler _housesDetailPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return HouseDetailsPage(
          houseId: args['houseId']);
    },
  );
  static final Handler _tenantDetailPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return TenantsDetailsPage(
          tenantId: args['tenantId']);
    },
  );

  static final Handler _metersPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Map<String, dynamic> args =
          context!.settings!.arguments as Map<String, dynamic>;
      return MetersPage(
          propertyIdNotifier: args['propertyIdNotifier'],
          isAppBar: args['isAppBar']);
    },
  );

  static final Handler _addUserPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Function(bool) isUserAdded =
          context!.settings!.arguments as Function(bool);
      return AddUsers(isUserAdded: isUserAdded);
    },
  );

  static final Handler _addExpenditurePageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Function(bool) isExpenditureAdded =
          context!.settings!.arguments as Function(bool);
      return AddExpenditur(isExpenditureAdded: isExpenditureAdded);
    },
  );
  static final Handler _addUtilityBillPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Function(bool) isExpenditureAdded =
          context!.settings!.arguments as Function(bool);
      return AddUtilityBillPage(isUtilityBillAdded: isExpenditureAdded);
    },
  );
  static final Handler _addPaymentTypePageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Function(bool) isPaymentTypeAdded =
          context!.settings!.arguments as Function(bool);
      return AssignPaymentPage(isPaymentTypeAdded: isPaymentTypeAdded);
    },
  );
  static final Handler _addNewOnboardingFeePageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Function(bool) isNewLetFeesAdded =
          context!.settings!.arguments as Function(bool);
      return AddNewOnboardingFeePage(isNewLetFeesAdded: isNewLetFeesAdded);
    },
  );

  static final Handler _addExpesePageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Function(bool) isExpenseAdded =
          context!.settings!.arguments as Function(bool);
      return AddExpensePage(isExpenseAdded: isExpenseAdded);
    },
  );

  static final Handler _addHousePageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Function(bool) isHouseAdded =
          context!.settings!.arguments as Function(bool);
      return AddHousePage(isHouseAdded: isHouseAdded);
    },
  );

  static final Handler _addTenantPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) {
      final Function(bool) isTenantAdded =
          context!.settings!.arguments as Function(bool);
      return AddTenantPage(isTenantAdded: isTenantAdded);
    },
  );

  static final Handler _propertiesPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) =>
        PropertiesPage(),
  );

  static final Handler _estateInvoicePageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) =>
        EstateInvoicesPage(),
  );

  static final Handler _userGroupsPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) =>
        ListUserGroupsPage(),
  );

  static final Handler _usersPageHandler = Handler(
    handlerFunc: (BuildContext? context, Map<String, List<String>> params) =>
        ListUserPage(),
  );

  // Setup the router and define routes
  static void setupRouter() {
    router.define(AppRoutes.home, handler: _homeHandler);
    router.define(AppRoutes.splash, handler: _splashHandler);
    router.define(AppRoutes.login, handler: _loginHandler);
    router.define(AppRoutes.forgetPassword, handler: _forgetPasswordHandler);
    router.define(AppRoutes.addMeter, handler: _addMeterHandler);
    router.define(AppRoutes.editMeter,
        handler: _editMeterHandler, transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.paymentRoute,
        handler: _paymentHandler, transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.paymentListRoute,
        handler: _paymentListHandler, transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.paymentProcessingRoute,
        handler: _paymentProcessingHandler, transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.paymentPage,
        handler: _paymentPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.filterMeter,
        handler: _filterMeterPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.tenantsPage,
        handler: _tenantsPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.housesPage,
        handler: _housesPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.housesOccupiedPage,
        handler: _housesOccupiedPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.housesDetailPage,
        handler: _housesDetailPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.tenantsDetailPage,
        handler: _tenantDetailPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.propertiesPage,
        handler: _propertiesPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.metersPage,
        handler: _metersPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.estateInvoices,
        handler: _estateInvoicePageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.userGroupsRoute,
        handler: _userGroupsPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.usersRoute,
        handler: _usersPageHandler, transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.housesCategoriesRoute,
        handler: _housesCategoriesPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.expenditureExpenseRoute,
        handler: _expenditureExpensePageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.recurrrentExpenditureRoute,
        handler: _recurrentExpenditurePageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.invoiceDetailPageRoute,
        handler: _invoiceDetailPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.paymentDetailPageRoute,
        handler: _paymentDetailPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.estateInvoiceDetailPageRoute,
        handler: _estateInvoiceDetailPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.tenantInvoicesRoute,
        handler: _tetantInvoicesPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.tenantUnpaidInvoicesRoute,
        handler: _tetantUnpaidInvoicesPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.expensesListRoute,
        handler: _expensesPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.pdfViewRoute,
        handler: _pdfViewPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.propertyListRoute,
        handler: _propertyPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.papmentStatementListRoute,
        handler: _paymentStatementPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.utilityBillListRoute,
        handler: _utilityBillListPagePageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.onboardingFeeListRoute,
        handler: _onboardingFeeistPagePageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.paymentTypeListRoute,
        handler: _paymentTypeListPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.addUserRoute,
        handler: _addUserPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.addExpenditureRoute,
        handler: _addExpenditurePageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.addUtilityBillRoute,
        handler: _addUtilityBillPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.addPaymentTypeRoute,
        handler: _addPaymentTypePageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.addNewOnboardingFeeRoute,
        handler: _addNewOnboardingFeePageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.addExpenseRoute,
        handler: _addExpesePageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.addHouseRoute,
        handler: _addHousePageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.addTenantRoute,
        handler: _addTenantPageHandler,
        transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.profileRoute,
        handler: _profileHandler, transitionType: TransitionType.inFromRight);
    router.define(AppRoutes.webViewPageRoute,
        handler: _webViewHandler, transitionType: TransitionType.inFromRight);
  }

  // Navigate to a route
  static Future navigateTo(BuildContext context, String routeName,
      {Object? arguments}) {
    return router.navigateTo(context, routeName,
        routeSettings: RouteSettings(arguments: arguments));
  }
}
