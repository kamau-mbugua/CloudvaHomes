import 'package:flutter/material.dart';
import 'package:hodi_app/utils/color_resources.dart';
import 'package:hodi_app/utils/dimensions.dart';
import 'package:hodi_app/utils/styles.dart';

import '../models/data/getMetres/get_metres.dart';

class MeterListItemView extends StatelessWidget {
  final MetrePaymentContent? item;
  final bool isHeader;
  final bool isHousesHeader;
  final bool isTenantsHeader;
  final bool isMyHousesHeader;
  final bool isUserGroupsHeader;
  final bool isUserHeader;
  final bool isHouseCategoryHeader;
  final bool isBfInvoices;
  final bool isEstateUnpaidInvoices;
  final bool isRecurrentExpenditure;
  final bool isEstatePaidInvoices;
  final bool isEstatePayment;
  final bool isExpensesList;
  final bool isPropertyReport;
  final bool isPaymentsTypeList;
  final bool isPaymentStatement;
  final bool isUtilityBillList;
  final bool isNewLetFeesList;
  final bool isHouseHistory;

  const MeterListItemView(
      {this.item,
      this.isHeader = false,
      this.isHousesHeader = false,
      this.isUserHeader = false,
      this.isTenantsHeader = false,
      this.isBfInvoices = false,
      this.isHouseHistory = false,
      this.isMyHousesHeader = false,
      this.isHouseCategoryHeader = false,
      this.isExpensesList = false,
      this.isPropertyReport = false,
      this.isPaymentsTypeList = false,
      this.isPaymentStatement = false,
      this.isEstateUnpaidInvoices = false,
      this.isRecurrentExpenditure = false,
      this.isUtilityBillList = false,
      this.isNewLetFeesList = false,
      this.isEstatePayment = false,
      this.isEstatePaidInvoices = false,
      this.isUserGroupsHeader = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 0, 10, 10),
      child: Container(
        color: isHeader
            ? ColorResources.graphLightBlue
            : isHousesHeader ? ColorResources.graphLightBlue
            : isUserGroupsHeader ? ColorResources.graphLightBlue
            : isTenantsHeader ? ColorResources.graphLightBlue
            : isMyHousesHeader ? ColorResources.graphLightBlue
            : isBfInvoices ? ColorResources.graphLightBlue
            : isHouseHistory ? ColorResources.graphLightBlue
            : isHouseCategoryHeader ? ColorResources.graphLightBlue
            : isEstateUnpaidInvoices ? ColorResources.graphLightBlue
            : isUtilityBillList ? ColorResources.graphLightBlue
            : isNewLetFeesList ? ColorResources.graphLightBlue
            : isRecurrentExpenditure ? ColorResources.graphLightBlue
            : isEstatePayment ? ColorResources.graphLightBlue
            : isEstatePaidInvoices ? ColorResources.graphLightBlue
            : isUserHeader ? ColorResources.graphLightBlue
            : isExpensesList ? ColorResources.graphLightBlue
            : isPropertyReport ? ColorResources.graphLightBlue
            : isPaymentsTypeList ? ColorResources.graphLightBlue
            : isPaymentStatement ? ColorResources.graphLightBlue
            : null,
        padding: const EdgeInsets.fromLTRB(0, 10, 0, 10),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            if (isTenantsHeader
                || isMyHousesHeader
                || isUserGroupsHeader
                || isBfInvoices
                || isHouseHistory
                || isUserHeader
                || isEstatePaidInvoices
                || isEstateUnpaidInvoices
                || isUtilityBillList
                || isNewLetFeesList
                || isRecurrentExpenditure
                || isEstatePayment
                || isExpensesList
                || isPropertyReport
                || isPaymentsTypeList
                || isPaymentStatement
                || isHouseCategoryHeader) ...[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isUserGroupsHeader ? 'Group Name'
                      : isUserHeader ? 'Full Name'
                      : isHouseCategoryHeader ? 'Category Name'
                      : isMyHousesHeader ? 'Name'
                      : isBfInvoices ? 'Invoice No'
                      : isHouseHistory ? 'Name'
                      : isEstateUnpaidInvoices ? 'Invoice No'
                      : isRecurrentExpenditure ? 'Name-Property'
                      : isUtilityBillList ? 'Name-Property'
                      : isNewLetFeesList ? 'Name'
                      : isEstatePayment ? 'Payment No'
                      : isEstatePaidInvoices ? 'Invoice No'
                      : isExpensesList ? 'Expense Name'
                      : isPropertyReport ? 'Name'
                      : isPaymentsTypeList ? 'Name'
                      : isPaymentStatement ? 'Ref No.'
                      : 'Tenant Name',
                      textAlign: TextAlign.end,
                      style: poppinsRegular.copyWith(
                        fontSize: isPropertyReport ||isPaymentStatement || isPaymentsTypeList ? Dimensions.fontSizeExtraSmall
                            :Dimensions.fontSizeSmall,
                        color: ColorResources.textBlue,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                        isUserGroupsHeader ? "User Type"
                        : isUserHeader ? "Group"
                        : isHouseCategoryHeader ? "Property"
                        : isMyHousesHeader ? "House No"
                        : isEstateUnpaidInvoices ? "Month"
                        : isRecurrentExpenditure ? "Frequency"
                        : isUtilityBillList ? "Type"
                        : isNewLetFeesList ? "Property"
                        : isEstatePayment ? "Invoice No"
                        : isEstatePaidInvoices ? "Month"
                        : isBfInvoices ? "House No"
                        : isHouseHistory ? "Phone"
                        : isExpensesList ? "Amount"
                        : isPropertyReport ? "Year-Month"
                        : isPaymentsTypeList ? "Property"
                        : isPaymentStatement ? "Amounty"
                        : "House No",
                        textAlign: TextAlign.end,
                        style: poppinsRegular.copyWith(
                          fontSize: isPropertyReport||isPaymentStatement||isPaymentsTypeList ? Dimensions.fontSizeExtraSmall
                              :Dimensions.fontSizeSmall,
                          color: Colors.black,
                          fontWeight: FontWeight.bold,
                        )),
                  ],
                ),
              ),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: isUserGroupsHeader
                    || isUserHeader
                    || isBfInvoices
                    || isHouseHistory
                    || isHouseCategoryHeader
                    || isEstateUnpaidInvoices
                    || isRecurrentExpenditure
                    || isUtilityBillList
                    || isNewLetFeesList
                    || isEstatePayment
                    || isEstatePaidInvoices
                    || isPropertyReport
                    || isPaymentsTypeList
                    || isPaymentStatement
                    || isExpensesList
                    ? CrossAxisAlignment.center
                    : CrossAxisAlignment.start,
                children: [
                  Text(
                    isHeader ? 'Meter No'
                    : isHousesHeader ? 'House Name'
                    : isTenantsHeader ? 'Property Name'
                    : isMyHousesHeader ? 'Property Name'
                    : isUserHeader ? 'Phone Number'
                    : isUserGroupsHeader ? 'Estate'
                    : isUserGroupsHeader ? 'Estate'
                    : isBfInvoices ? 'Tenant'
                    : isHouseHistory ? 'Occupied On'
                    : isEstateUnpaidInvoices ? 'Invoice Amount'
                    : isRecurrentExpenditure ? 'Amount'
                    : isUtilityBillList ? 'Amount'
                    : isNewLetFeesList ? 'Amount'
                    : isEstatePayment ? 'Amount'
                    : isEstatePaidInvoices ? 'Invoice Amount'
                    : isHouseCategoryHeader ? 'Units'
                    : isExpensesList ? 'Recurring'
                    : isPropertyReport ? 'Total Units'
                    : isPaymentsTypeList ? 'Bank Name'
                    : isPaymentStatement ? 'Payment Ref'
                    : item?.metreNo ?? '',
                    textAlign: TextAlign.start,
                    style: poppinsRegular.copyWith(
                      fontSize: isPropertyReport||isPaymentStatement ||isPaymentsTypeList ? Dimensions.fontSizeExtraSmall
                          :Dimensions.fontSizeSmall,
                      color: ColorResources.textBlue,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    isHeader ? 'House No'
                    : isHousesHeader ? 'Property Name.'
                    : isTenantsHeader ? 'Category'
                    : isMyHousesHeader ? 'Category'
                    : isUserGroupsHeader ? 'Status'
                    : isUserHeader ? 'Status'
                    : isBfInvoices ? 'Due Date'
                    : isHouseHistory ? 'Vacated On'
                    : isEstateUnpaidInvoices ? 'Total Rent'
                    : isRecurrentExpenditure ? 'Status'
                    : isUtilityBillList ? 'Status'
                    : isNewLetFeesList ? 'Status'
                    : isEstatePayment ? 'Payment Type'
                    : isEstatePaidInvoices ? 'Total Rent'
                    : isHouseCategoryHeader ? 'Status'
                    : isPropertyReport ? 'Occupied Units'
                    : isPaymentsTypeList ? 'Acc No. - Name'
                    : isPaymentStatement ? 'Type'
                    : isExpensesList ? 'Incurred On'
                    : item?.houseName.toString() ?? '',
                    textAlign: TextAlign.start,
                    style: poppinsRegular.copyWith(
                      fontSize: isPropertyReport ||isPaymentStatement ||isPaymentsTypeList ? Dimensions.fontSizeExtraSmall
                          :Dimensions.fontSizeSmall,
                      color: Colors.black,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: isPropertyReport||isPaymentStatement||isPaymentsTypeList
                    ? CrossAxisAlignment.center
                    :CrossAxisAlignment.end,
                children: [
                  Text(
                    isHeader ? 'Current Readings'
                    : isHousesHeader ? 'Category'
                    : isTenantsHeader ? 'Rent'
                    : isMyHousesHeader ? 'Rent'
                    : isBfInvoices ? 'Rent Owed'
                    : isHouseHistory ? 'Rent Owed'
                    : isUserGroupsHeader ? 'Action'
                    : isUserHeader ? 'Action'
                    : isRecurrentExpenditure ? 'Action'
                    : isUtilityBillList ? 'Action'
                    : isNewLetFeesList ? 'Action'
                    : isEstateUnpaidInvoices ? 'Due Date'
                    : isEstatePayment ? 'Paid By'
                    : isEstatePaidInvoices ? 'Paid Date'
                    : isHouseCategoryHeader ? 'Action'
                    : isPropertyReport ? 'Invoiced Amount'
                    : isPaymentsTypeList ? 'Paybill No.'
                    : isPaymentStatement ? 'Banl Name'
                    : isExpensesList ? 'Action'
                    : item?.currentReading.toString() ?? '',
                    textAlign: TextAlign.end,
                    style: poppinsRegular.copyWith(
                      fontSize: isPropertyReport||isPaymentStatement || isPaymentsTypeList ? Dimensions.fontSizeExtraSmall
                          :Dimensions.fontSizeSmall,
                      color:ColorResources.textBlue,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                      isHeader ? 'Consumed Units'
                      : isHousesHeader ? 'Rent'
                      : isTenantsHeader ? 'Rent Owed'
                      : isMyHousesHeader ? 'Rent Owed'
                      : isBfInvoices ? 'Rent Paid'
                      : isHouseHistory ? 'Approved By'
                      : isUserGroupsHeader ? ''
                      : isUserHeader ? ''
                      : isRecurrentExpenditure ? ''
                      : isUtilityBillList ? ''
                      : isNewLetFeesList ? ''
                      : isHouseCategoryHeader ? ''
                      : isEstateUnpaidInvoices ? 'Admin'
                      : isEstatePayment ? 'Paid On'
                      : isEstatePaidInvoices ? 'Payment No.'
                      : isPropertyReport ? 'Paid Amount'
                      : isPaymentsTypeList ? 'Status'
                      : isPaymentStatement ? 'Status'
                      : isExpensesList ? ''
                      : item?.consumedUnits.toString() ?? '',
                      textAlign: TextAlign.end,
                      style: poppinsRegular.copyWith(
                        fontSize: isPropertyReport ||isPaymentStatement ||isPaymentsTypeList ? Dimensions.fontSizeExtraSmall
                            :Dimensions.fontSizeSmall,
                        color: Colors.black,
                        fontWeight: FontWeight.bold,
                      )),
                ],
              ),
            ),
            if (isPropertyReport || isPaymentStatement || isPaymentsTypeList) ...[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      isPaymentStatement? 'Payment Date'
                      :isPaymentsTypeList? 'Action'
                      :'Arrears',
                      textAlign: TextAlign.end,
                      style: poppinsRegular.copyWith(
                        fontSize: Dimensions.fontSizeExtraSmall,
                        color: ColorResources.textBlue,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                        isPaymentStatement?'Created On'
                        :isPaymentsTypeList?''
                        :'Expense Amount',
                        textAlign: TextAlign.end,
                        style: poppinsRegular.copyWith(
                          fontSize:Dimensions.fontSizeExtraSmall,
                          color: Colors.black,
                          fontWeight: FontWeight.bold,
                        )),
                  ],
                ),
              ),
            ]
          ],
        ),
      ),
    );
  }
}
