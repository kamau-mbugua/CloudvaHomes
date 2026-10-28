import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:hodi_app/models/data/payment_types/payment_detail.dart';
import 'package:hodi_app/models/data/user_group/user_groups_response.dart';

import '../logger.dart';
import '../models/data/CommonResponse.dart';
import '../models/data/estate_invoices/check_status.dart';
import '../models/data/estate_invoices/estate_invoice_detail.dart';
import '../models/data/estate_invoices/estate_invoices.dart';
import '../models/data/estate_invoices/estate_invoices_list.dart';
import '../models/data/estate_payment/estate_payment.dart';
import '../models/data/expenditure/recurrent_expenditure.dart';
import '../models/data/expenses/expense_list_response.dart';
import '../models/data/getHouses/house_data.dart';
import '../models/data/getHouses/meter_houses.dart';
import '../models/data/getMetres/get_metres.dart';
import '../models/data/house_categories/house_ccategories.dart';
import '../models/data/houses/added_house_features.dart';
import '../models/data/houses/house_details.dart';
import '../models/data/houses/house_features.dart';
import '../models/data/houses/house_history.dart';
import '../models/data/houses/house_specs_response.dart';
import '../models/data/houses/un_occupied_houses.dart';
import '../models/data/invoice/invoice_details.dart';
import '../models/data/metred_bills/metred_bills.dart';
import '../models/data/onboard_fees/onboard_fees.dart';
import '../models/data/payment_types/payment_type_list_response.dart';
import '../models/data/payments/add_type/payment_types.dart';
import '../models/data/payments/payment-types.dart';
import '../models/data/payment_config/payment_config.dart';
import '../models/data/payment_statement/payment_statement.dart';
import '../models/data/payment_types/payment_types.dart';
import '../models/data/payments/payments.dart';
import '../models/data/payments/validate_slip.dart';
import '../models/data/profile/profile_response.dart';
import '../models/data/properties/properties.dart';
import '../models/data/property_category/property_category.dart';
import '../models/data/property_report/property_report.dart';
import '../models/data/table_data/dashboard_data.dart';
import '../models/data/table_data/unit_comparison.dart';
import '../models/data/tenants/search_tenant.dart';
import '../models/data/tenants/tenants_data_class.dart';
import '../models/data/tenants/tenants_details.dart';
import '../models/data/tenants_invoices/tenants_invoices.dart';
import '../models/data/user_group/all_user_group.dart';
import '../models/data/users/users_data.dart';
import '../models/data/utility_bills/utility_bill.dart';
import '../models/data/utility_bills/utility_bills_list.dart';
import '../models/response/response_model.dart';
import '../networking/base/api_checker.dart';
import '../networking/base/api_response.dart';
import '../repository/authenticated_repo.dart';
import '../services/invoice_status_handler.dart';
import '../widgets/base/custom_snackbar.dart';

class AuthenticatedAppProviders extends ChangeNotifier {
  // Add your code here
  final AuthenticatedRepo? authenticatedRepo;

  AuthenticatedAppProviders({required this.authenticatedRepo});

  DashboardData? _dashboardData;
  UnitComparisonDashboardContent? _unitComparisonDashboardContent;
  MeterPaymentResponse? _meterPaymentResponse;
  TenantData? _tenantData;
  List<Property> _properties = [];
  List<MetredBillsUtility> _metredBillsUtility = [];
  List<UtilityBill> _utilityBill = [];
  List<AllUserGroup> _allUserGroup = [];
  List<House> _house = [];
  List<UserGroup> _userGroupData = [];
  List<HouseCategoryData> _houseCategoryData = [];
  List<ReccurentExpenseData> _reccurentExpenseData = [];
  List<UtilityBillListData> _utilityBillListData = [];
  List<OnboardingFeesData> _onboardingFeesData = [];
  List<PaymentMethodData> _paymentMethodData = [];
  List<ExpenseListData> _expenseListData = [];
  List<PropertyReportData> _propertyReportData = [];
  List<PaymentStatementData> _paymentStatementData = [];
  List<TenantInvoiceData> _tenantInvoiceData = [];
  List<HouseHistoryData> _houseHistoryData = [];
  List<EstateInvoiceData> _estateInvoiceData = [];
  List<EstatePaymentData> _estatePaymentData = [];
  List<UserData> _userData = [];
  PaymentResponse? _paymentResponse;
  MeterHousesResponse? _meterHousesResponse;
  bool _isLoading = false;

  DashboardData? get dashboardData => _dashboardData;

  PaymentResponse? get paymentResponse => _paymentResponse;

  UnitComparisonDashboardContent? get unitComparisonDashboardContent =>
      _unitComparisonDashboardContent;

  List<Property> get properties => _properties;

  List<House> get house => _house;
  List<HouseHistoryData> get houseHistoryData => _houseHistoryData;
  List<UtilityBill> get utilityBill => _utilityBill;
  List<PaymentMethodData> get paymentMethodData => _paymentMethodData;
  MeterHousesResponse? get meterHousesResponse => _meterHousesResponse;
  List<OnboardingFeesData> get onboardingFeesData => _onboardingFeesData;
  MeterPaymentResponse? get meterPaymentResponse => _meterPaymentResponse;
  List<MetredBillsUtility> get metredBillsUtility => _metredBillsUtility;
  TenantData? get tenantData => _tenantData;
  List<UtilityBillListData> get utilityBillListData => _utilityBillListData;
  List<UserGroup> get userGroupData => _userGroupData;
  List<EstateInvoiceData> get estateInvoiceData => _estateInvoiceData;
  List<PaymentStatementData> get paymentStatementData => _paymentStatementData;
  List<UserData> get userData => _userData;
  List<TenantInvoiceData> get tenantInvoiceData => _tenantInvoiceData;
  List<EstatePaymentData> get estatePaymentData => _estatePaymentData;
  List<ReccurentExpenseData> get reccurentExpenseData => _reccurentExpenseData;
  List<PropertyReportData> get propertyReportData => _propertyReportData;
  List<AllUserGroup> get allUserGroup => _allUserGroup;
  List<HouseCategoryData> get houseCategoryData => _houseCategoryData;
  List<ExpenseListData> get expenseListData => _expenseListData;
  bool get isLoading => _isLoading;

  String? _updateMeterErrorMessage = '';

  String? get updateMeterErrorMessage => _updateMeterErrorMessage;

  Future<ResponseModel> handleApiResponse(ApiResponse apiResponse) async {
    ResponseModel isSuccessful;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      if (apiResponse.response!.data['status'] == '00') {
        isSuccessful = ResponseModel(true, 'successful');
      } else {
        showCustomSnackBar(apiResponse.response!.data['message']);
        _updateMeterErrorMessage = apiResponse.response!.data['message'];
        isSuccessful = ResponseModel(false, _updateMeterErrorMessage);
      }
    } else {
      showCustomSnackBar(ApiChecker.getError(apiResponse).errors![0].message);
      _updateMeterErrorMessage =
          ApiChecker.getError(apiResponse).errors![0].message;
      isSuccessful = ResponseModel(false, _updateMeterErrorMessage);
    }
    _isLoading = false;
    notifyListeners();
    return isSuccessful;
  }

  void getDashboardData(String estateId, String propertyId, String status, bool isSelf, BuildContext context) async {
    _dashboardData = null;
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!.getDashboardData(estateId, propertyId, status, isSelf);
    if (apiResponse.response != null && apiResponse.response!.statusCode == 200) {
      final responseData = apiResponse.response!.data;
      logger.i("getDashboardDataDashboardData: ${responseData['content']}");
      if (/*responseData['status'] == '00' && */responseData['content'] != null) {
        logger.i("getDashboardDataDashboardData: ${responseData['content']}");
        try {
          logger.i("getDashboardDataDashboardData: ${responseData['content']}");
          _dashboardData = DashboardData.fromJson(responseData['content']);
        } catch (e) {
          logger.e("Error parsing DashboardData: ${e.toString()}");
          _dashboardData = null;
        }
      } else {
        // If the status is not '00', this means you received a special message,
        // such as {status: "002", message: "..."}.
        // In this case, trigger the InvoiceStatusHandler.
        await InvoiceStatusHandler(context).fetchCheckInvoiceStatus();
        _dashboardData = null;
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
    }
    _isLoading = false;
    notifyListeners();
  }


  Future<bool> addMeterReading(
      String metreNo,
      String billId,
      String previousReading,
      String currentReading,
      String houseId,
      String image,
      String descrition) async {
    ApiResponse apiResponse = await authenticatedRepo!.addMeterReading(metreNo,
        billId, previousReading, currentReading, houseId, image, descrition);
    bool isSuccessful;

    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      isSuccessful = true;
      notifyListeners();
    } else {
      showCustomSnackBar(ApiChecker.getError(apiResponse).errors![0].message);
      isSuccessful = false;
    }

    notifyListeners();
    return isSuccessful;
  }

  Future<ResponseModel> addExpense(String propertyId, String estateId,
      String name, String description, String amount) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!
        .addExpense(propertyId, estateId, name, description, amount);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> addUtilityBill(String name, String amount, int type,
      int propertyId, int estateId, String? metredBillId) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!
        .addUtilityBill(name, amount, type, propertyId, estateId, metredBillId);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> addNewOnboardingFee(
      String name,
      String amount,
      int type,
      int propertyId,
      int estateId,
      String? months,
      bool refundable) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.addNewOnboardingFee(
        name, amount, type, propertyId, estateId, months, refundable);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> addExpenditure(
      String name,
      String description,
      int amount,
      int frequency,
      String frequencyName,
      int propertyId,
      int estateId) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.addExpenditure(name,
        description, amount, frequency, frequencyName, propertyId, estateId);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> addUser(
      {required String firstName,
      required String lastName,
      required String username,
      required String idNo,
      required String email,
      required String phone,
      required int estateId,
      required int userGroupId}) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.addUser(
        firstName: firstName,
        lastName: lastName,
        username: username,
        idNo: idNo,
        email: email,
        phone: phone,
        estateId: estateId,
        userGroupId: userGroupId);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> updateMeterReading(String metreId, String descrition,
      String currentReading, String image) async {
    _isLoading = true;
    _updateMeterErrorMessage = '';
    ApiResponse apiResponse = await authenticatedRepo!
        .updateMeterReading(metreId, descrition, currentReading, image);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> deleteUserGroup(String userGroupId) async {
    _isLoading = true;
    _updateMeterErrorMessage = '';
    ApiResponse apiResponse =
        await authenticatedRepo!.deleteUserGroup(userGroupId);
    return await handleApiResponse(apiResponse);
  }

  void getUnitComparisons(
      String estateId, String propertyId, String status, String month, String year) async {
    _unitComparisonDashboardContent = null;
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!
        .getUnitComparisons(estateId, propertyId, status, month, year);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{_unitComparisonDashboardContent = UnitComparisonDashboardContent.fromJson(
          apiResponse.response!.data['content']);
      }catch(e){
        logger.e(e.toString());
        _unitComparisonDashboardContent = null;
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<InvoiceDataResponse?> getInvoiceDetail(String invoiceRef) async {
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!
        .getInvoiceDetail(invoiceRef);
    InvoiceDataResponse? invoiceDataResponse;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {

      if (apiResponse.response!.data['status'] == '00') {
        invoiceDataResponse =
            InvoiceDataResponse.fromJson(apiResponse.response!.data["data"]);
      } else {
        showCustomSnackBar(apiResponse.response!.data['message']);
      }

      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      showCustomSnackBar(ApiChecker.getError(apiResponse).errors![0].message);
      invoiceDataResponse = null;
    }
    _isLoading = false;
    notifyListeners();
    return invoiceDataResponse;
  }

  Future<PaymentDetailData?> getPaymentDetail(String paymentRef) async {
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!
        .getPaymentDetail(paymentRef);
    PaymentDetailData? invoiceDataResponse;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {

      if (apiResponse.response!.data['status'] == '00') {
        invoiceDataResponse =
            PaymentDetailData.fromJson(apiResponse.response!.data["data"]);
      } else {
        showCustomSnackBar(apiResponse.response!.data['message']);
      }

      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      showCustomSnackBar(ApiChecker.getError(apiResponse).errors![0].message);
      invoiceDataResponse = null;
    }
    _isLoading = false;
    notifyListeners();
    return invoiceDataResponse;
  }

  Future<EstateInvoiceDataResponse?> getEstateInvoiceDetail(String invoiceRef) async {
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!
        .getEstateInvoiceDetail(invoiceRef);
    EstateInvoiceDataResponse? invoiceDataResponse;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {

      if (apiResponse.response!.data['status'] == '00') {
        invoiceDataResponse =
            EstateInvoiceDataResponse.fromJson(apiResponse.response!.data["data"]);
      } else {
        showCustomSnackBar(apiResponse.response!.data['message']);
      }

      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      showCustomSnackBar(ApiChecker.getError(apiResponse).errors![0].message);
      invoiceDataResponse = null;
    }
    _isLoading = false;
    notifyListeners();
    return invoiceDataResponse;
  }

  Future<MeterHousesResponse?> getMeterHouses(
      String propertyId, String billId) async {
    _meterHousesResponse = null;
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse =
        await authenticatedRepo!.getMeterHouses(propertyId, billId);

    MeterHousesResponse? meterHousesResponse;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      _meterHousesResponse =
          MeterHousesResponse.fromJson(apiResponse.response!.data);
      meterHousesResponse = _meterHousesResponse;
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      meterHousesResponse = null;
    }
    _isLoading = false;
    notifyListeners();
    return meterHousesResponse;
  }

  Future<List<Property>> getBusinessProperties(String estateId) async {
    _properties = [];
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse =
        await authenticatedRepo!.getBusinessProperties(estateId);
    List<Property> properties = [];
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        apiResponse.response!.data.forEach((data) {
          _properties.add(Property.fromJson(data));
        });
        properties = _properties;

      }catch(e){
        logger.e(e.toString());
        properties = [];
      }

      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      properties = [];
    }
    _isLoading = false;
    notifyListeners();
    return properties;
  }


  Future<List<UserEstateInvoiceData>> getUserEstateInvoices(String estateId) async {
    _properties = [];
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse =
        await authenticatedRepo!.getUserEstateInvoices(estateId);
    List<UserEstateInvoiceData> userEstateInvoiceData = [];
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
     try{
       apiResponse.response!.data["content"].forEach((data) {
         userEstateInvoiceData.add(UserEstateInvoiceData.fromJson(data));
       });
     }catch(e) {
       logger.e(e.toString());
       userEstateInvoiceData = [];
     }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      userEstateInvoiceData = [];
    }
    _isLoading = false;
    notifyListeners();
    return userEstateInvoiceData;
  }

  Future<List<UnOccupiedHouses>> getUnOccupiedHouses(String estateId) async {
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse =
        await authenticatedRepo!.getUnOccupiedHouses(estateId);
    List<UnOccupiedHouses> properties = [];
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        apiResponse.response!.data.forEach((data) {
          properties.add(UnOccupiedHouses.fromJson(data));
        });
      }catch(e){
        logger.e(e.toString());
        properties = [];
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      properties = [];
    }
    _isLoading = false;
    notifyListeners();
    return properties;
  }

  Future<HouseDetails?> getHouseDetails(String houseId) async {
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse =
        await authenticatedRepo!.getHouseDetails(houseId);
    HouseDetails? properties = null;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        properties = HouseDetails.fromJson(apiResponse.response!.data);
      }catch(e){
        logger.e(e.toString());
        properties = null;
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      showCustomSnackBar(ApiChecker.getError(apiResponse).errors![0].message);
      properties = null;
    }
    _isLoading = false;
    notifyListeners();
    return properties;
  }


  Future<TenantsDetailsData?> getTenantsDetails(String tenantId) async {
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse =
        await authenticatedRepo!.getTenantsDetails(tenantId);
    TenantsDetailsData? properties = null;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {

      if (apiResponse.response!.data['status'] == '00') {
        properties =
            TenantsDetailsData.fromJson(apiResponse.response!.data["data"]);
      } else {
        showCustomSnackBar(apiResponse.response!.data['message']);
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      showCustomSnackBar(ApiChecker.getError(apiResponse).errors![0].message);
    }
    _isLoading = false;
    notifyListeners();
    return properties;
  }

  Future<PaymentTypeData?> getPropertyPaymentTypes(String propertyId) async {
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse =
        await authenticatedRepo!.getPropertyPaymentTypes(propertyId);
    PaymentTypeData? properties = null;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {

      if (apiResponse.response!.data['status'] == '00') {
        properties =
            PaymentTypeData.fromJson(apiResponse.response!.data["data"]);
      } else {
        showCustomSnackBar(apiResponse.response!.data['message']);
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      showCustomSnackBar(ApiChecker.getError(apiResponse).errors![0].message);
    }
    _isLoading = false;
    notifyListeners();
    return properties;
  }

  Future<List<PaymentTypeListData>> getPaymentTypesList(String? originInvoice,String roleType, String? propertyId) async {
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse =
        await authenticatedRepo!.getPaymentTypesList(originInvoice, roleType,propertyId);
    List<PaymentTypeListData>? properties = null;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {

      if (apiResponse.response!.data['status'] == '00') {
        properties = (apiResponse.response!.data["data"] as List).map((e) => PaymentTypeListData.fromJson(e)).toList();
      } else {
        properties = [];
        showCustomSnackBar(apiResponse.response!.data['message']);
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      showCustomSnackBar(ApiChecker.getError(apiResponse).errors![0].message);
      properties = [];
    }
    _isLoading = false;
    notifyListeners();
    return properties;
  }

  Future<List<AddedHouseFeaturesList>?> getHouseAddedFeatures(String houseId) async {
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse =
        await authenticatedRepo!.getHouseAddedFeatures(houseId);
    List<AddedHouseFeaturesList>? properties = null;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        properties = (apiResponse.response!.data as List).map((e) => AddedHouseFeaturesList.fromJson(e)).toList();
      }catch(e){
        logger.e(e.toString());
        properties = null;
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      showCustomSnackBar(ApiChecker.getError(apiResponse).errors![0].message);
      properties = [];
    }
    _isLoading = false;
    notifyListeners();
    return properties;
  }

  Future<HouseSpecsResponse?> getHouseSpecs(String selectedPropertyId) async {
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse =
        await authenticatedRepo!.getHouseSpecs(selectedPropertyId);
    HouseSpecsResponse? properties = null;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        //check if status is 00 or 01
        properties = HouseSpecsResponse.fromJson(apiResponse.response!.data);
      }catch(e){
        logger.e(e.toString());
        properties = null;
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      properties = null;
      showCustomSnackBar(ApiChecker.getError(apiResponse).errors![0].message);
    }
    _isLoading = false;
    notifyListeners();
    return properties;
  }

  Future<HouseFeaturesResponse?> getHouseFeatures(
      String selectedPropertyId, String selectedFloorNo) async
  {
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!
        .getHouseFeatures(selectedPropertyId, selectedFloorNo);
    HouseFeaturesResponse? properties = null;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        //check if status is 00 or 01
        properties = HouseFeaturesResponse.fromJson(apiResponse.response!.data);
      }catch(e){
        logger.e(e.toString());
        properties = null;
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      properties = null;
      showCustomSnackBar(ApiChecker.getError(apiResponse).errors![0].message);
    }
    _isLoading = false;
    notifyListeners();
    return properties;
  }

  Future<List<MetredBillsUtility>> getMetredBils() async {
    _metredBillsUtility = [];
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!.getMetredBils();
    List<MetredBillsUtility> metredBillsUtility = [];
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        apiResponse.response!.data.forEach((data) {
          _metredBillsUtility.add(MetredBillsUtility.fromJson(data));
        });
        metredBillsUtility = _metredBillsUtility;
      }catch(e){
        logger.e(e.toString());
        metredBillsUtility = [];
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      metredBillsUtility = [];
    }
    _isLoading = false;
    notifyListeners();
    return metredBillsUtility;
  }

  Future<UserProfileResponse?> getUserProfile() async {
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!.getUserProfile();
    UserProfileResponse? metredBillsUtility = null;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        metredBillsUtility = UserProfileResponse.fromJson(apiResponse.response!.data);
      }catch(e){
        logger.e(e.toString());
        metredBillsUtility = null;
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      metredBillsUtility = null;
    }
    _isLoading = false;
    notifyListeners();
    return metredBillsUtility;
  }

  Future<List<UtilityBill>> getUtilityBill(String propertyId) async {
    _utilityBill = [];
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse =
        await authenticatedRepo!.getUtilityBill(propertyId);
    List<UtilityBill> utilityBill = [];
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        apiResponse.response!.data.forEach((data) {
          _utilityBill.add(UtilityBill.fromJson(data));
        });
        utilityBill = _utilityBill;
      }catch(e){
        logger.e(e.toString());
        utilityBill = [];
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      utilityBill = [];
    }
    _isLoading = false;
    notifyListeners();
    return utilityBill;
  }

  Future<List<AllUserGroup>> getAllUserGroups() async {
    _allUserGroup = [];
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!.getAllUserGroups();
    List<AllUserGroup> allUserGroup = [];
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        apiResponse.response!.data.forEach((data) {
          _allUserGroup.add(AllUserGroup.fromJson(data));
        });
        allUserGroup = _allUserGroup;
      }catch(e){
        logger.e(e.toString());
        allUserGroup = [];
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      allUserGroup = [];
    }
    _isLoading = false;
    notifyListeners();
    return allUserGroup;
  }

  Future<List<House>> getHouses(int page, int pageSize, String estateId,
      String propertyId, String categoryId, String searchTerm, String occupied)
  async {
    _house = [];
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!.getHouses(
        page, pageSize, estateId, propertyId, categoryId, searchTerm, occupied);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        apiResponse.response!.data['content'].forEach((data) {
          _house.add(House.fromJson(data));
        });
      }catch(e){
        logger.e(e.toString());
        _house = [];
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
    }
    _isLoading = false;
    notifyListeners();
    return house;
  }

  Future<List<Tenant>> getTenants(
      int? page,
      int? pageSize,
      String? propertyId,
      String? estateId,
      String? categoryId,
      bool self,
      String searchTerm,
      String userId,
      )
  async {
    _tenantData = null;
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!.getTenants(page!,
        pageSize!, propertyId!, estateId!, categoryId!, self, searchTerm, userId);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        _tenantData = TenantData.fromJson(apiResponse.response!.data);
      }catch(e){
        logger.e(e.toString());
        _tenantData = null;
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
    }
    _isLoading = false;
    notifyListeners();
    return _tenantData?.content ?? [];
  }

  Future<List<MetrePaymentContent>> getMetres(
      int page,
      int pageSize,
      String propertyId,
      String estateId,
      String billId,
      bool? isMeterRead,
      String searchTerm,
      String houseId)
  async {
    _meterPaymentResponse = null;
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!.getMetres(
        page, pageSize, propertyId, estateId, billId, isMeterRead, searchTerm, houseId);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        _meterPaymentResponse =
            MeterPaymentResponse.fromJson(apiResponse.response!.data);
      }catch(e){
        logger.e(e.toString());
        _meterPaymentResponse = null;
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
    }
    _isLoading = false;
    notifyListeners();
    return _meterPaymentResponse?.content ?? [];
  }

  Future<List<Payment>> getPaymentsData(
      int page,
      int pageSize,
      String propertyId,
      String estateId,
      String startDate,
      String endDate,
      bool self,
      String categoryId,
      String userId,
      )
  async {
    _paymentResponse = null;
    _isLoading = true;
    notifyListeners();

    ApiResponse apiResponse = await authenticatedRepo!.getPaymentsData(
        page, pageSize, propertyId, estateId, startDate, endDate, self,categoryId, userId);
    logger.i("getPaymentsDataRespone: ${apiResponse.response!.data}");
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      logger.i("getPaymentsDataRespone 1: ${apiResponse.response!.data}");
      try{
        _paymentResponse = PaymentResponse.fromJson(apiResponse.response!.data);
      }catch(e){
        logger.e(e.toString());
        _paymentResponse = null;
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
    }
    _isLoading = false;
    notifyListeners();
    return _paymentResponse?.content ?? [];
  }

  Future<List<UserGroup>> getUserGroups(
      int page, int pageSize, String searchTerm)
  async {
    _userGroupData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse =
        await authenticatedRepo!.getUserGroups(page, pageSize, searchTerm);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        apiResponse.response!.data['content'].forEach((data) {
          _userGroupData.add(UserGroup.fromJson(data));
        });
      }catch(e){
        logger.e(e.toString());
        _userGroupData = [];
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _userGroupData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _userGroupData;
  }

  Future<List<HouseCategoryData>> getHouseCategories(int page, int pageSize,
      String searchTerm, String propertyId, String estateId) async {
    _houseCategoryData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!
        .getHouseCategories(page, pageSize, searchTerm, propertyId, estateId);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _houseCategoryData.add(HouseCategoryData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _userGroupData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _houseCategoryData;
  }

  Future<List<EstatePropertyCategory>> getHouseCategoriesUnpaginated(String estateId) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!
        .getHouseCategoriesUnpaginated(estateId);
    List<EstatePropertyCategory> estatePropertyCategory = [];
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data.forEach((data) {
        estatePropertyCategory.add(EstatePropertyCategory.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      estatePropertyCategory = [];
    }
    _isLoading = false;
    notifyListeners();
    return estatePropertyCategory;
  }

  Future<List<ReccurentExpenseData>> getReccurrentExpenditure(
      int page,
      int pageSize,
      String searchTerm,
      String propertyId,
      String estateId) async {
    _reccurentExpenseData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.getReccurrentExpenditure(
        page, pageSize, searchTerm, propertyId, estateId);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _reccurentExpenseData.add(ReccurentExpenseData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _reccurentExpenseData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _reccurentExpenseData;
  }

  Future<List<UtilityBillListData>> getUtilityBillList(int page, int pageSize,
      String searchTerm, String propertyId, String estateId) async {
    _utilityBillListData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!
        .getUtilityBillList(page, pageSize, searchTerm, propertyId, estateId);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _utilityBillListData.add(UtilityBillListData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _utilityBillListData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _utilityBillListData;
  }

  Future<List<OnboardingFeesData>> getNewLetFeesList(int page, int pageSize,
      String searchTerm, String propertyId, String estateId) async {
    _onboardingFeesData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!
        .getNewLetFeesList(page, pageSize, searchTerm, propertyId, estateId);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _onboardingFeesData.add(OnboardingFeesData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _onboardingFeesData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _onboardingFeesData;
  }

  Future<List<PaymentMethodData>> getPaymentsTypeList(int page, int pageSize,
      String searchTerm, String propertyId, String estateId) async {
    _paymentMethodData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!
        .getPaymentsTypeList(page, pageSize, searchTerm, propertyId, estateId);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _paymentMethodData.add(PaymentMethodData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _paymentMethodData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _paymentMethodData;
  }

  Future<List<PaymentTypeList>> getPaymentsTypeListUnpaginated( String estateId) async {
    _paymentMethodData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!
        .getPaymentsTypeListUnpaginated(estateId);
    List<PaymentTypeList> paymentTypeList = [];
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        paymentTypeList.add(PaymentTypeList.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      paymentTypeList = [];
    }
    _isLoading = false;
    notifyListeners();
    return paymentTypeList;
  }

  Future<List<ExpenseListData>> getExpenseList(
      int page,
      int pageSize,
      String searchTerm,
      String propertyId,
      String estateId,
      String firstDate,
      String lastDate) async {
    _expenseListData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.getExpenseList(
        page, pageSize, searchTerm, propertyId, estateId, firstDate, lastDate);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _expenseListData.add(ExpenseListData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _expenseListData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _expenseListData;
  }

  Future<List<TenantInvoiceData>> getTenantsInvoices(
      int page,
      int pageSize,
      int invoiceStatus,
      String month,
      String year,
      String estateId,
      String propertyId,
      String searchTerm,
      String categoryId,
      bool self,
      String houseId,
      String userId,
      ) async {
    _tenantInvoiceData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.getTenantsInvoices(
        page,
        pageSize,
        invoiceStatus,
        month,
        year,
        estateId,
        propertyId,
        searchTerm,
        categoryId,
        self, houseId,userId);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _tenantInvoiceData.add(TenantInvoiceData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _tenantInvoiceData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _tenantInvoiceData;
  }


  Future<List<HouseHistoryData>> getHouseHistory(
      int page,
      int pageSize,
      String houseId) async {
    _houseHistoryData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.getHouseHistory(
        page,
        pageSize,houseId);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _houseHistoryData.add(HouseHistoryData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _houseHistoryData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _houseHistoryData;
  }

  Future<List<PropertyReportData>> getPropertyReport(int page, int pageSize,
      String searchTerm, String propertyId, String estateId, int status, String year, String month) async {
    _propertyReportData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.getPropertyReport(
        page, pageSize, searchTerm, propertyId, estateId, status, year, month);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _propertyReportData.add(PropertyReportData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _propertyReportData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _propertyReportData;
  }

  Future<List<PaymentStatementData>> getPaymentStatement(
      int page,
      int pageSize,
      String searchTerm,
      String propertyId,
      String estateId,
      int status,
      String startDate,
      String endDate,
      String used,
      String paymentTypeId
      ) async {
    _paymentStatementData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.getPaymentStatement(page,
        pageSize, searchTerm, propertyId, estateId, status, startDate, endDate, used, paymentTypeId);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _paymentStatementData.add(PaymentStatementData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _paymentStatementData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _paymentStatementData;
  }

  Future<List<EstateInvoiceData>> getEstateInvoices(
    int page,
    int pageSize,
    int invoiceStatus,
    String month,
    String year,
    String searchTerm,
  ) async {
    _estateInvoiceData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.getEstateInvoices(
        page, pageSize, invoiceStatus, month, year, searchTerm);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _estateInvoiceData.add(EstateInvoiceData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _estateInvoiceData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _estateInvoiceData;
  }

  Future<List<EstateInvoiceData>> getEstateInvoicesPay(
    int page,
    int pageSize,
    String estateId,
  ) async {
    _estateInvoiceData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.getEstateInvoicesPay(
        page, pageSize, estateId);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _estateInvoiceData.add(EstateInvoiceData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _estateInvoiceData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _estateInvoiceData;
  }

  Future<List<EstatePaymentData>> getEstatePayments(
    int page,
    int pageSize,
    String startDate,
    String endDate,
    String searchTerm,
  ) async {
    _estatePaymentData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!
        .getEstatePayments(page, pageSize, startDate, endDate, searchTerm);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _estatePaymentData.add(EstatePaymentData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _estatePaymentData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _estatePaymentData;
  }

  Future<List<UserData>> getUser(
      int page, int pageSize, String searchTerm) async {
    _userData = [];
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse =
        await authenticatedRepo!.getUser(page, pageSize, searchTerm);
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      apiResponse.response!.data['content'].forEach((data) {
        _userData.add(UserData.fromJson(data));
      });
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      _userData = [];
    }
    _isLoading = false;
    notifyListeners();
    return _userData;
  }

  Future<ResponseModel> deactivateUserGroup(String userGroupId) async {
    _isLoading = true;
    _updateMeterErrorMessage = '';
    ApiResponse apiResponse =
        await authenticatedRepo!.deactivateUserGroup(userGroupId);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> deactivateDeleteUser(String id, String action) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse =
        await authenticatedRepo!.deactivateDeleteUser(id, action);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> updateHouseCategoryStatus(
      String id, String action) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse =
        await authenticatedRepo!.updateHouseCategoryStatus(id, action);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> updateRecurringExpenditureStatus(
      String id, String action) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse =
        await authenticatedRepo!.updateRecurringExpenditureStatus(id, action);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> updateUtilityBillStatus(
      String id, String action) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse =
        await authenticatedRepo!.updateUtilityBillStatus(id, action);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> updateNewLetFeesStatus(String id, String action) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse =
        await authenticatedRepo!.updateNewLetFeesStatus(id, action);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> updatePaymentsTypeStatus(
      String id, String action) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse =
        await authenticatedRepo!.updatePaymentsTypeStatus(id, action);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> updateExpenseStatus(String id) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.updateExpenseStatus(id);
    return await handleApiResponse(apiResponse);
  }

  Future<ResponseModel> addHouse(
      String houseNumber,
      int floor,
      int houseTypeId,
      String squareFt,
      String description,
      String rent,
      int categoryId,
      int propertyId,
      int estateId,
      List<int> featureIds) async {
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.addHouse(
        houseNumber,
        floor,
        houseTypeId,
        squareFt,
        description,
        rent,
        categoryId,
        propertyId,
        estateId,
        featureIds);
    return handleApiResponse(apiResponse);
  }

  Future<TenantSearchUserDataResponse> searchTenant(String idNumber) async{
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.searchTenant(idNumber);
    TenantSearchUserDataResponse tenantSearchUserDataResponse;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {

      if (apiResponse.response!.data['status'] == '00') {
        tenantSearchUserDataResponse = TenantSearchUserDataResponse.fromJson(apiResponse.response!.data);
      } else {
        tenantSearchUserDataResponse = TenantSearchUserDataResponse.fromJson(apiResponse.response!.data);
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      tenantSearchUserDataResponse = TenantSearchUserDataResponse.fromJson(apiResponse.response!.data);
    }
    _isLoading = false;
    notifyListeners();
    return tenantSearchUserDataResponse;
  }

  Future<ResponseModel> addTenantNew(String houseId,
      String userId,
      String payDate,
      bool withArrears,
      String currency,
      bool generateInvoice,
      int refundableAmount,
      Object tenant,
      Object invoice) async{
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.addTenant(houseId,
        userId,
        payDate,
        withArrears,
        currency,
        generateInvoice,
        refundableAmount,
        tenant,
        invoice);
    return handleApiResponse(apiResponse);
  }

  Future<ResponseModel>  makePayment(Map payloadObject) async{
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.makePayment(payloadObject);
    return handleApiResponse(apiResponse);
  }

  Future<ResponseModel>  makePaymentEstateInvoice(Map payloadObject) async{
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.makePaymentEstateInvoice(payloadObject);
    return handleApiResponse(apiResponse);
  }

  Future<ResponseModel> assignPayment(String typeId,
      String bankId,
      String estateId,
      String propertyId,
      String accountNo,
      String accountName,
      String payBillNo,
      String otp)async{
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.assignPayment(typeId,
        bankId,
        estateId,
        propertyId,
        accountNo,
        accountName,
        payBillNo,
        otp);
    return handleApiResponse(apiResponse);
  }

  Future<ValidateSlipResponse> validateSlip(String slipRef) async{
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.validateSlip(slipRef);
    ValidateSlipResponse validateSlipResponse;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {

      if (apiResponse.response!.data['status'] == '00') {
        validateSlipResponse = ValidateSlipResponse.fromJson(apiResponse.response!.data);
      } else {
        validateSlipResponse = ValidateSlipResponse.fromJson(apiResponse.response!.data);
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      validateSlipResponse = ValidateSlipResponse.fromJson(apiResponse.response!.data);
    }
    _isLoading = false;
    notifyListeners();
    return validateSlipResponse;
  }

  Future<CommonResponse> deleteAccount(String username, String password) async{
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.deleteAccount(username, password);
    CommonResponse assignPaymentResponse;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        assignPaymentResponse = CommonResponse.fromJson(apiResponse.response!.data);
      }catch(e){
        logger.e(e.toString());
        assignPaymentResponse = CommonResponse.fromJson(apiResponse.response!.data);
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      assignPaymentResponse = CommonResponse.fromJson(apiResponse.response!.data);
    }
    _isLoading = false;
    notifyListeners();
    return assignPaymentResponse;
  }

  Future<AssignPaymentResponse> getAssignPaymentTypes(String selectedPropertyId, String selectedEstateId) async{
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.getAssignPaymentTypes(selectedPropertyId, selectedEstateId);
    AssignPaymentResponse assignPaymentResponse;
    if (apiResponse.response != null &&
        apiResponse.response!.statusCode == 200) {
      try{
        assignPaymentResponse = AssignPaymentResponse.fromJson(apiResponse.response!.data);
      }catch(e){
        logger.e(e.toString());
        assignPaymentResponse = AssignPaymentResponse.fromJson(apiResponse.response!.data);
      }
      notifyListeners();
    } else {
      ApiChecker.checkApi(apiResponse);
      assignPaymentResponse = AssignPaymentResponse.fromJson(apiResponse.response!.data);
    }
    _isLoading = false;
    notifyListeners();
    return assignPaymentResponse;
  }


  Future<CheckStatusResponse?> checkInvoiceStatus(String estateId) async {
    ApiResponse apiResponse = await authenticatedRepo!.checkInvoiceStatus(estateId: estateId);
    logger.d("checkInvoiceStatus: ${apiResponse.response?.data}");
    CheckStatusResponse? responseModel;
    if (apiResponse.response != null && apiResponse.response!.data != null) {
      responseModel = CheckStatusResponse.fromJson(apiResponse.response!.data);
    } else {
      // Handle the case where the response or data is null
      responseModel = CheckStatusResponse(status: "error", message: "No data available");
    }
    return responseModel;
  }

  Future<ResponseModel> requestOTP(String selectedEstateId) async{
    _isLoading = true;
    notifyListeners();
    ApiResponse apiResponse = await authenticatedRepo!.requestOTP(selectedEstateId);
    return handleApiResponse(apiResponse);
  }

}
