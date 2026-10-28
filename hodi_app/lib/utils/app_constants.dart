class AppConstants{
//App Constants
static const String appName = 'HODI';
static const String appVersion = 'v1.0.0';
static const String appDescription = 'a rental management system';

//API Constants
  static const String baseUrl = 'https://hodi-test.qnex.io/api/';
  static const String loginUri = 'login';
  static const String forgetPasswordUrlUri = 'forgot-password';
  static const String userProfileUrl = 'profile/user-details';
  static const String dashboardSummaryUrl = 'dashboard/table-data';
  static const String getPaymentStatementUrl = 'payment-statements';
  static const String paymentsUrl = 'payments';
  static const String esatetPaymentsUrl = 'estate-payments';
  static const String getReccurrentExpenditureUrl = 'expenditure';
  static const String addNewExpenditureUrl = 'expenditure/new';
  static const String getExpenseListUrl = 'expenses';
  static const String allPropertiesUrl = 'properties';
  static const String houseFeaturesUrl = 'house-features/property';
  static const String getMetresUrl = 'metres';
  static const String getMetresHousesUrl = 'metres/specs';
  static const String addNewMeterUrl = 'metres/new';
  static const String updateMeterReadingUrl = 'metres/update-reading';
  static const String getTenantsUrl = 'tenants';
  static const String getTenantsInvoicesUrl = 'invoices';
  static const String getEstateInvoicesUrl = 'estate-invoices';
  static const String getUserGroupsUrl = 'user-groups';
  static const String deleteUserGroupUrl = '/user-groups/flags/delete';
  static const String deactivateUserGroupUrl = '/user-groups/flags/deactivate';
  static const String getHousesUrl = 'houses';
  static const String getHousesCategoriesUrl = 'property-categories';
  static const String getUsersUrl = 'users';
  static const String getAllUserGroupsUrl = 'all-user-groups';
  static const String getUtilityBillUrl = 'utility-bills';
  static const String getOnboardFeesUrl = 'onboard-fees';
  static const String getPaymentsTypesUrl = 'estate/payment-types';
  static const String getOTPUrl = 'otps';
  static const String addNewUserUrl = 'users/new';
  static const String deactivateDeleteUserUrl = 'users/flags';
  static const String getMetredBillsUrl = 'metred-bills?simple=true';
  static const String getUserProfileUrl = 'profile/user-details';
  static const String deleteAccountUrl = 'delete-account';


//shared preferences
static const String onBoardingSkip = 'onBoardingSkip';
static const String token = 'token';
static const String loginResponse = 'loginResponse';
static const String theme = 'theme';

}