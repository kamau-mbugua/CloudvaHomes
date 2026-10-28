import 'package:flutter/material.dart';
import 'package:nb_utils/nb_utils.dart';

import '../screens/filter_page/filter_page.dart';

class SearchFilterRow extends StatelessWidget {
  final TextEditingController searchController;
  final FocusNode searchFocusNode;
  final Function(
      String selectedPropertyMonthNo,
      String selectedYear,
      String selectedPropertyId,
      String selectedPropertyCategoryId,
      String fromDate,
      String toDate,
      String selectedUsedStatus,
      String selectedPaymentType,
      ) onFilter;
  final ValueNotifier<String>? propertyIdNotifier;
  final bool isHousesFilter;
  final bool isCategoryFilter;
  final bool isTenantsFilter;
  final bool isInvoiceFilter;
  final bool isExpenditureFilter;
  final bool isExpenseFilter;
  final bool isPaymentFilter;
  final bool isPropertyFilter;
  final bool isPaymentStatementFilter;
  final bool isUtilityBillFilter;
  final bool isEstateInvoiceFilter;
  final bool isEstateInvoicePaymentFilter;

  const SearchFilterRow({
    Key? key,
    required this.searchController,
    required this.searchFocusNode,
    required this.onFilter,
    required this.propertyIdNotifier,
    this.isHousesFilter = false,
    this.isCategoryFilter = false,
    this.isTenantsFilter = false,
    this.isInvoiceFilter = false,
    this.isExpenditureFilter = false,
    this.isExpenseFilter = false,
    this.isPaymentFilter = false,
    this.isPropertyFilter = false,
    this.isPaymentStatementFilter = false,
    this.isUtilityBillFilter = false,
    this.isEstateInvoiceFilter = false,
    this.isEstateInvoicePaymentFilter = false,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        1.width,
        TextField(
          controller: searchController,
          focusNode: searchFocusNode,
          decoration: InputDecoration(
            filled: true,
            fillColor: context.cardColor,
            hintText: "Search",
            hintStyle: primaryTextStyle(color: Colors.grey.shade400),
            constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width - 145),
            prefixIcon: Icon(
              Icons.search_rounded,
              color: Colors.grey.shade400,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(15),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        16.width,
        GestureDetector(
          onTap: () {
            showCustomFiltersBottomSheet(
              context,
              propertyIdNotifier?.value ?? '',
              onFilter,
            );
          },
          child: Container(
            height: 60,
            width: 60,
            margin: EdgeInsets.only(top: 16, bottom: 16),
            decoration: BoxDecoration(
              color: context.cardColor,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.filter_list, color: Colors.blue),
          ),
        ),
      ],
    ).paddingOnly(bottom: 5, top: 10);
  }

  void showCustomFiltersBottomSheet(BuildContext context, String propertyId, Function(String,String,String,String,String,String,String,String) onFilter) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        return FilterPage(propertyId: propertyId,
          onFilter: onFilter,
          isHousesFilter: isHousesFilter,
          isCategoryFilter: isCategoryFilter,
          isTenantsFilter: isTenantsFilter,
          isInvoiceFilter: isInvoiceFilter,
          isExpenditureFilter: isExpenditureFilter,
          isExpenseFilter: isExpenseFilter,
          isPaymentFilter: isPaymentFilter,
          isPropertyFilter: isPropertyFilter,
          isPaymentStatementFilter: isPaymentStatementFilter,
            isUtilityBillFilter: isUtilityBillFilter,
          isEstateInvoiceFilter: isEstateInvoiceFilter,
          isEstateInvoicePaymentFilter: isEstateInvoicePaymentFilter,

        );
      },
    );
  }
}