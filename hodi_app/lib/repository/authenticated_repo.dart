import 'package:flutter/cupertino.dart';
import 'package:hodi_app/logger.dart';
import 'package:nb_utils/nb_utils.dart';

import '../networking/base/api_response.dart';
import '../networking/datasource/remote/dio/dio_client.dart';
import '../networking/datasource/remote/exception/api_error_handler.dart';
import '../utils/app_constants.dart';

class AuthenticatedRepo {
  final DioClient? dioClient;
  AuthenticatedRepo({required this.dioClient});

  Future<ApiResponse> getDashboardData(
      String estateId, String propertyId, String status,bool isSelf) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.dashboardSummaryUrl}?estateId=$estateId&propertyId=$propertyId&status=$status&page=0&pageSize=10');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getUnitComparisons(String estateId, String propertyId,
      String status, String month, String year) async {
    try {
      var URL =
          '${AppConstants.dashboardSummaryUrl}?estateId=$estateId&propertyId=$propertyId&status=$status&month=$month&year=$year&page=0&pageSize=10';
      debugPrint('getUnitComparisons >>>>>>>>>>>>>>>URL: $URL');
      final response = await dioClient!.get(URL);
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getInvoiceDetail(String invoiceRef) async {
    try {
      var URL = '${AppConstants.getTenantsInvoicesUrl}/detail/$invoiceRef';
      debugPrint('getUnitComparisons >>>>>>>>>>>>>>>URL: $URL');
      final response = await dioClient!.get(URL);
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getPaymentDetail(String invoiceRef) async {
    try {
      var URL = '${AppConstants.paymentsUrl}/detail/$invoiceRef';
      debugPrint('getUnitComparisons >>>>>>>>>>>>>>>URL: $URL');
      final response = await dioClient!.get(URL);
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getEstateInvoiceDetail(String invoiceRef) async {
    try {
      var URL = '${AppConstants.getEstateInvoicesUrl}/detail/$invoiceRef';
      debugPrint('getUnitComparisons >>>>>>>>>>>>>>>URL: $URL');
      final response = await dioClient!.get(URL);
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getPaymentsData(
    int page,
    int pageSize,
    String propertyId,
    String estateId,
    String startDate,
    String endDate,
    bool self,
    String categoryId,
    String userId,
  ) async {
    try {
      final response = userId.isEmptyOrNull
          ? await dioClient!.get(
              '${AppConstants.paymentsUrl}?page=$page&pageSize=$pageSize&propertyId=$propertyId&estateId=$estateId&startDate=$startDate&endDate=$endDate&self=$self&categoryId=$categoryId')
          : await dioClient!.get(
              '${AppConstants.paymentsUrl}?page=$page&pageSize=$pageSize&propertyId=$propertyId&estateId=$estateId&startDate=$startDate&endDate=$endDate&self=$self&categoryId=$categoryId&userId=$userId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getBusinessProperties(String estateId) async {
    try {
      final response = await dioClient!
          .get('${AppConstants.allPropertiesUrl}/all?estateId=$estateId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }
  Future<ApiResponse> getUserEstateInvoices(String estateId) async {
    try {
      final response = await dioClient!
          .get('${AppConstants.getEstateInvoicesUrl}/pay?estateId=$estateId&page=0&pageSize=100');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getUnOccupiedHouses(String estateId) async {
    try {
      final response = await dioClient!
          .get('${AppConstants.getHousesUrl}/unoccupied/all/$estateId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getHouseDetails(String houseId) async {
    try {
      final response =
          await dioClient!.get('${AppConstants.getHousesUrl}/$houseId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getTenantsDetails(String tenantId) async {
    try {
      final response = await dioClient!
          .get('${AppConstants.getTenantsUrl}/$tenantId/details');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getPropertyPaymentTypes(String propertyId) async {
    try {
      final response = await dioClient!
          .get('${AppConstants.getPaymentsTypesUrl}/property/$propertyId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }


  Future<ApiResponse> getPaymentTypesList(String? originInvoice, String roleType, String? propertyId) async{
    try {
      final response = await dioClient!
          .get('${AppConstants.getPaymentsTypesUrl}/$originInvoice/$roleType/$propertyId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getHouseAddedFeatures(String houseId) async {
    try {
      final response = await dioClient!
          .get('${AppConstants.getHousesUrl}/house-features/$houseId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getHouseSpecs(String selectedPropertyId) async {
    try {
      final response = await dioClient!
          .get('${AppConstants.allPropertiesUrl}/specs/$selectedPropertyId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getHouseFeatures(
      String selectedPropertyId, String selectedFloorNo) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.houseFeaturesUrl}/$selectedPropertyId/$selectedFloorNo');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getMetredBils() async {
    try {
      final response =
          await dioClient!.get('${AppConstants.getMetredBillsUrl}');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getUserProfile() async {
    try {
      final response =
          await dioClient!.get('${AppConstants.getUserProfileUrl}');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getHouses(
      int page,
      int pageSize,
      String estateId,
      String propertyId,
      String categoryId,
      String searchTerm,
      String occupied) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.getHousesUrl}?page=$page&pageSize=$pageSize&estateId=$estateId&propertyId=$propertyId&categoryId=$categoryId&searchTerm=$searchTerm&occupied=$occupied');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getUtilityBill(String propertyId) async {
    try {
      bool simple = true;
      bool metred = true;
      final response = await dioClient!.get(
          '${AppConstants.getUtilityBillUrl}/all?simple=$simple&metred=$metred&propertyId=$propertyId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getMetres(
      int page,
      int pageSize,
      String propertyId,
      String estateId,
      String billId,
      bool? isMeterRead,
      String searchTerm,
      String houseId) async {
    try {
      final response = isMeterRead == null
          ? await dioClient!.get(
              '${AppConstants.getMetresUrl}?page=$page&pageSize=$pageSize&propertyId=$propertyId&estateId=$estateId&billId=$billId&searchTerm=$searchTerm&houseId=$houseId')
          : await dioClient!.get(
              '${AppConstants.getMetresUrl}?page=$page&pageSize=$pageSize&propertyId=$propertyId&estateId=$estateId&billId=$billId&currentReading=$isMeterRead&searchTerm=$searchTerm&houseId=$houseId');

      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getMeterHouses(String propertyId, String billId) async {
    try {
      bool simple = true;
      bool metred = true;

      final response = await dioClient!.get(
          '${AppConstants.getMetresHousesUrl}?propertyId=$propertyId&billId=$billId&simple=$simple&metred=$metred');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> addMeterReading(
      String metreNo,
      String billId,
      String previousReading,
      String currentReading,
      String houseId,
      String image,
      String descrition) async {
    try {
      final response =
          await dioClient!.post(AppConstants.addNewMeterUrl, data: {
        "metreNo": metreNo,
        "billId": billId,
        "previousReading": previousReading,
        "currentReading": currentReading,
        "houseId": houseId,
        "image": image,
        "descrition": descrition
      });
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> updateMeterReading(String metreId, String descrition,
      String currentReading, String image) async {
    try {
      final response =
          await dioClient!.post(AppConstants.updateMeterReadingUrl, data: {
        "descrition": descrition,
        "currentReading": currentReading,
        "image": image,
        "metreId": metreId
      });
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getTenants(
      int page,
      int pageSize,
      String propertyId,
      String estateId,
      String categoryId,
      bool self,
      String searchTerm,
      String userId) async {
    try {
      final response = userId.isEmptyOrNull
          ? await dioClient!.get(
              '${AppConstants.getTenantsUrl}?page=$page&pageSize=$pageSize&propertyId=$propertyId&estateId=$estateId&categoryId=$categoryId&self=$self&searchTerm=$searchTerm')
          : await dioClient!.get(
              '${AppConstants.getTenantsUrl}?page=$page&pageSize=$pageSize&propertyId=$propertyId&estateId=$estateId&categoryId=$categoryId&self=$self&searchTerm=$searchTerm&userId=$userId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getUserGroups(
      int page, int pageSize, String searchTerm) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.getUserGroupsUrl}?page=$page&pageSize=$pageSize&searchTerm=$searchTerm');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> deleteUserGroup(String userGroupId) async {
    try {
      final response = await dioClient!
          .post('${AppConstants.deleteUserGroupUrl}/$userGroupId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> deactivateUserGroup(String userGroupId) async {
    try {
      final response = await dioClient!
          .post('${AppConstants.deactivateUserGroupUrl}/$userGroupId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getUser(int page, int pageSize, String searchTerm) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.getUsersUrl}?page=$page&pageSize=$pageSize&searchTerm=$searchTerm');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getAllUserGroups() async {
    try {
      final response =
          await dioClient!.get('${AppConstants.getAllUserGroupsUrl}');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> addUser(
      {required String firstName,
      required String lastName,
      required String username,
      required String idNo,
      required String email,
      required String phone,
      required int estateId,
      required int userGroupId}) async {
    try {
      final response =
          await dioClient!.post('${AppConstants.addNewUserUrl}', data: {
        "firstName": firstName,
        "lastName": lastName,
        "username": username,
        "idNo": idNo,
        "email": email,
        "phone": phone,
        "estateId": estateId,
        "userGroupId": userGroupId
      });
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> deactivateDeleteUser(String id, String action) async {
    try {
      final response = await dioClient!
          .post('${AppConstants.deactivateDeleteUserUrl}/$action/$id');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getHouseCategories(int page, int pageSize,
      String searchTerm, String propertyId, String estateId) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.getHousesCategoriesUrl}?page=$page&pageSize=$pageSize&searchTerm=$searchTerm&propertyId=$propertyId&estateId=$estateId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getHouseCategoriesUnpaginated(String estateId) async {
    try {
      final response = await dioClient!
          .get('${AppConstants.getHousesCategoriesUrl}/estate/$estateId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> updateHouseCategoryStatus(
      String id, String action) async {
    try {
      final response = await dioClient!
          .post('${AppConstants.getHousesCategoriesUrl}/flags/$action/$id');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> updateRecurringExpenditureStatus(
      String id, String action) async {
    try {
      final response = await dioClient!.post(
          '${AppConstants.getReccurrentExpenditureUrl}/flags/$action/$id');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> updateUtilityBillStatus(String id, String action) async {
    try {
      final response = await dioClient!
          .post('${AppConstants.getUtilityBillUrl}/flags/$action/$id');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> updateNewLetFeesStatus(String id, String action) async {
    try {
      final response = await dioClient!
          .post('${AppConstants.getOnboardFeesUrl}/flags/$action/$id');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> updatePaymentsTypeStatus(String id, String action) async {
    try {
      final response = await dioClient!
          .post('${AppConstants.getPaymentsTypesUrl}/flags/$action/$id');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> updateExpenseStatus(String id) async {
    try {
      final response =
          await dioClient!.post('${AppConstants.getExpenseListUrl}/void/$id');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getTenantsInvoices(
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
    try {
      var newmonth = month ?? "";

      final response = userId.isEmptyOrNull
          ? await dioClient!.get(
              '${AppConstants.getTenantsInvoicesUrl}/$invoiceStatus?page=$page&pageSize=$pageSize&month=$newmonth&year=$year&estateId=$estateId&propertyId=$propertyId&searchTerm=$searchTerm&categoryId=$categoryId&self=$self&houseId=$houseId')
          : await dioClient!.get(
              '${AppConstants.getTenantsInvoicesUrl}/$invoiceStatus?page=$page&pageSize=$pageSize&month=$newmonth&year=$year&estateId=$estateId&propertyId=$propertyId&searchTerm=$searchTerm&categoryId=$categoryId&self=$self&houseId=$houseId&userId=$userId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getHouseHistory(
      int page, int pageSize, String houseId) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.getTenantsUrl}/house/history?page=$page&pageSize=$pageSize&houseId=$houseId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getEstateInvoices(int page, int pageSize,
      int invoiceStatus, String month, String year, String searchTerm) async {
    try {
      var newmonth = month ?? "";

      final response = await dioClient!.get(
          '${AppConstants.getEstateInvoicesUrl}/$invoiceStatus?page=$page&pageSize=$pageSize&month=$newmonth&year=$year&searchTerm=$searchTerm');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }


  Future<ApiResponse> getEstateInvoicesPay(int page, int pageSize, String estateId) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.getEstateInvoicesUrl}/pay?page=$page&pageSize=$pageSize&estateId=$estateId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getEstatePayments(int page, int pageSize,
      String startDate, String endDate, String searchTerm) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.esatetPaymentsUrl}?page=$page&pageSize=$pageSize&startDate=$startDate&endDate=$endDate&searchTerm=$searchTerm');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getReccurrentExpenditure(int page, int pageSize,
      String searchTerm, String propertyId, String estateId) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.getReccurrentExpenditureUrl}?page=$page&pageSize=$pageSize&searchTerm=$searchTerm&propertyId=$propertyId&estateId=$estateId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getUtilityBillList(int page, int pageSize,
      String searchTerm, String propertyId, String estateId) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.getUtilityBillUrl}?page=$page&pageSize=$pageSize&searchTerm=$searchTerm&propertyId=$propertyId&estateId=$estateId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getNewLetFeesList(int page, int pageSize,
      String searchTerm, String propertyId, String estateId) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.getOnboardFeesUrl}?page=$page&pageSize=$pageSize&searchTerm=$searchTerm&propertyId=$propertyId&estateId=$estateId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getPaymentsTypeList(int page, int pageSize,
      String searchTerm, String propertyId, String estateId) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.getPaymentsTypesUrl}?page=$page&pageSize=$pageSize&searchTerm=$searchTerm&propertyId=$propertyId&estateId=$estateId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getPaymentsTypeListUnpaginated(String estateId) async {
    try {
      final response = await dioClient!
          .get('${AppConstants.getPaymentsTypesUrl}/estate/$estateId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> addExpenditure(
      String name,
      String description,
      int amount,
      int frequency,
      String frequencyName,
      int propertyId,
      int estateId) async {
    try {
      final response =
          await dioClient!.post('${AppConstants.addNewExpenditureUrl}', data: {
        "name": name,
        "description": description,
        "amount": amount,
        "frequency": frequency,
        "frequencyName": frequencyName,
        "propertyId": propertyId,
        "estateId": estateId
      });
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getExpenseList(
      int page,
      int pageSize,
      String searchTerm,
      String propertyId,
      String estateId,
      String firstDate,
      String lastDate) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.getExpenseListUrl}?page=$page&pageSize=$pageSize&searchTerm=$searchTerm&propertyId=$propertyId&estateId=$estateId&startDate=$firstDate&endDate=$lastDate');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> addExpense(String propertyId, String estateId,
      String name, String description, String amount) async {
    try {
      final response =
          await dioClient!.post('${AppConstants.getExpenseListUrl}/new', data: {
        "propertyId": propertyId.trim().toInt(),
        "estateId": estateId.trim().toInt(),
        "name": name,
        "description": description,
        "amount": amount,
        "month": 0
      });
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> addUtilityBill(String name, String amount, int type,
      int propertyId, int estateId, String? metredBillId) async {
    try {
      var metredBillIdNew = metredBillId ?? "";

      final response =
          await dioClient!.post('${AppConstants.getUtilityBillUrl}/new', data: {
        "name": name,
        "amount": amount,
        "type": type,
        "propertyId": propertyId,
        "estateId": estateId,
        "metredBillId": metredBillIdNew
      });
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> addNewOnboardingFee(String name, String amount, int type,
      int propertyId, int estateId, String? months, bool refundable) async {
    try {
      var monthsNew = months ?? "";

      final response =
          await dioClient!.post('${AppConstants.getOnboardFeesUrl}/new', data: {
        "name": name,
        "amount": amount,
        "type": type,
        "propertyId": propertyId,
        "estateId": estateId,
        "months": monthsNew,
        "refundable": refundable
      });
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getPropertyReport(
      int page,
      int pageSize,
      String searchTerm,
      String propertyId,
      String estateId,
      int status,
      String year,
      String month) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.dashboardSummaryUrl}?page=$page&pageSize=$pageSize&searchTerm=$searchTerm&propertyId=$propertyId&estateId=$estateId&status=$status&year=$year&month=$month');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> getPaymentStatement(
      int page,
      int pageSize,
      String searchTerm,
      String propertyId,
      String estateId,
      int status,
      String startDate,
      String endDate,
      String used,
      String paymentTypeId) async {
    try {
      final response = await dioClient!.get(
          '${AppConstants.getPaymentStatementUrl}?page=$page&pageSize=$pageSize&searchTerm=$searchTerm&propertyId=$propertyId&estateId=$estateId&status=$status&startDate=$startDate&endDate=$endDate&used=$used&paymentTypeId=$paymentTypeId');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> addHouse(
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
    try {
      final response =
          await dioClient!.post('${AppConstants.getHousesUrl}/new', data: {
        "houseNumber": houseNumber,
        "floor": floor,
        "houseTypeId": houseTypeId,
        "squareFt": squareFt,
        "description": description,
        "rent": rent,
        "categoryId": categoryId,
        "propertyId": propertyId,
        "estateId": estateId,
        "featureIds": featureIds
      });
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> searchTenant(
    String idNo,
  ) async {
    try {
      final response = await dioClient!
          .post('${AppConstants.getTenantsUrl}/tenant-details', data: {
        "idNo": idNo,
      });
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> validateSlip(
    String slipRef,
  ) async {
    try {
      final response = await dioClient!
          .get('${AppConstants.paymentsUrl}/validate-slip/$slipRef');
      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> addTenant(
      String houseId,
      String userId,
      String payDate,
      bool withArrears,
      String currency,
      bool generateInvoice,
      int refundableAmount,
      Object tenant,
      Object invoice) async {
    try {
      final response = await dioClient!
          .post('${AppConstants.getTenantsUrl}/assign-tenant', data: {
        "houseId": houseId,
        "userId": userId,
        "payDate": payDate,
        "withArrears": withArrears,
        "currency": currency,
        "generateInvoice": generateInvoice,
        "refundableAmount": refundableAmount,
        "tenant": tenant,
        "invoice": invoice
      });

      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> makePayment(Map payloadObject) async {
    try {
      final response = await dioClient!.post(
          '${AppConstants.paymentsUrl}/receive-payments',
          data: payloadObject);

      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> makePaymentEstateInvoice(Map payloadObject) async {
    try {
      final response = await dioClient!.post(
          '${AppConstants.esatetPaymentsUrl}/receive-payment',
          data: payloadObject);

      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }


  Future<ApiResponse> getAssignPaymentTypes(
      String selectedPropertyId, String selectedEstateId) async {
    try {
      final response = await dioClient!
          .post('${AppConstants.getPaymentsTypesUrl}/all', data: {
        "propertyId": selectedPropertyId,
        "estateId": selectedEstateId
      });

      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> deleteAccount(
      String username,
      String password,
      ) async{
    try{
      final response = await dioClient!.post(AppConstants.deleteAccountUrl, data: {
        "username": username,
        "password": password,
      });

      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> assignPayment(String typeId,
      String bankId,
      String estateId,
      String propertyId,
      String accountNo,
      String accountName,
      String payBillNo,
      String otp) async{
    try{
      final response = await dioClient!.post('${AppConstants.getPaymentsTypesUrl}/new', data: {
        "typeId": typeId,
        "bankId": bankId,
        "estateId": estateId,
        "propertyId": propertyId,
        "accountNo": accountNo,
        "accountName": accountName,
        "payBillNo": payBillNo,
        "otp": otp
      });

      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }

  Future<ApiResponse> requestOTP(String selectedEstateId) async{
    try{
      final response = await dioClient!.get('${AppConstants.getOTPUrl}/initiate-type-otp/$selectedEstateId');

      return ApiResponse.withSuccess(response);
    } catch (e) {
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }


  Future<ApiResponse>  checkInvoiceStatus({String? estateId}) async {
    try {
      final response = await dioClient!.get("${AppConstants.getEstateInvoicesUrl}/check-status/$estateId");
      return ApiResponse.withSuccess(response);
    } catch (e) {
      logger.d("checkInvoiceStatus Error: ${e.toString()}");
      return ApiResponse.withError(ApiErrorHandler.getMessage(e));
    }
  }



}

//will return when invoice.upaid, return 2, when invoice.paid, return 1, when invoice.pending, return 0
