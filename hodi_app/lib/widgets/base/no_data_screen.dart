import 'package:flutter/material.dart';

import '../../utils/dimensions.dart';
import '../../utils/images.dart';
import '../../utils/styles.dart';


class NoDataScreen extends StatelessWidget {
  final bool isTransaction;
  final bool isRecentTransaction;
  final bool isMeterTransaction;
  final bool isTenants;
  final bool isTenantsSelf;
  final bool isNothing;
  final bool isFooter;
  final bool isAddress;
  final bool isUserGroupsHeader;
  final bool isUserHeader;
  final bool isHouseCategoryHeader;
  final bool isBfInvoices;
  final bool isPaidInvoices;
  final bool isUnpaidInvoices;
  final bool isUnpaidEstateInvoices;
  final bool isRecurrentExpenditure;
  final bool isEstatePayment;
  final bool isExpensesList;
  final bool isPropertyReport;
  final bool isPaymentStatement;
  final bool isUtilityBillList;
  final bool isNewLetFeesList;
  final bool isPaymentsTypeList;
  final bool isHouses;
  final bool isHouseHistory;
  const NoDataScreen({Key? key,
    this.isRecentTransaction = false,
    this.isNothing = false,
    this.isTransaction = false,
    this.isFooter = false,
    this.isBfInvoices = false,
    this.isPropertyReport = false,
    this.isEstatePayment = false,
    this.isPaymentStatement = false,
    this.isUnpaidInvoices = false,
    this.isRecurrentExpenditure = false,
    this.isUtilityBillList = false,
    this.isPaymentsTypeList = false,
    this.isUnpaidEstateInvoices = false,
    this.isPaidInvoices = false,
    this.isNewLetFeesList = false,
    this.isHouses = false,
    this.isAddress = false,
    this.isUserHeader = false,
    this.isMeterTransaction = false,
    this.isUserGroupsHeader = false,
    this.isHouseCategoryHeader = false,
    this.isExpensesList = false,
    this.isTenantsSelf = false,
    this.isHouseHistory = false,
    this.isTenants = false}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.of(context).size.height;
    return SingleChildScrollView(
      child: Column(
        children: [
          Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(Dimensions.paddingSizeLarge),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.stretch, children: [

                  Image.asset(
                  Images.noFoodImage,
                    width: MediaQuery.of(context).size.height*0.22,
                    height: MediaQuery.of(context).size.height*0.22,
                    //color: Theme.of(context).primaryColor,
                  ),

                  Text(
                    isTenants ? "No Tenants Found"
                    :isTenantsSelf ? "You Do not have any house"
                    :isTransaction ? "No Transaction History Available"
                    : isRecentTransaction ? "No Recent Transaction"
                    : isNothing ? "Nothing Found"
                    : isUserGroupsHeader ? "No User Groups Found"
                    : isHouseCategoryHeader ? "No House Category Found"
                    : isBfInvoices ? "No BF Invoices Found"
                    : isUtilityBillList ? "No Utility Bill Found"
                    : isPaymentsTypeList ? "No Payment Type Added"
                    : isEstatePayment ? "No Estate Payment Found"
                    : isPropertyReport ? "No Property Report Found"
                    : isNewLetFeesList ? "No New Let Fees Found"
                    : isUnpaidInvoices ? "No Unpaid Invoices Found"
                    : isRecurrentExpenditure ? "No Recurrent Expenditure Found"
                    : isPaymentStatement ? "No Payment Statement Found"
                    : isExpensesList ? "No Expenses Found"
                    : isHouses ? "No Houses Found"
                    : isUnpaidEstateInvoices ? "No Unpaid Invoices Found"
                    : isPaidInvoices ? "No Paid Invoices Found"
                    : isHouseHistory ? "No House History Found"
                    : isUserHeader ? "No User Found"
                    : isMeterTransaction ? "No Meter Transaction" : '',
                    style: rubikBold.copyWith(color: Theme.of(context).primaryColor, fontSize: Dimensions.fontSizeDefault),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 10),

                  Text(
                    isTenants ? "Add a tenant to see it here"
                    :isTenantsSelf ? "Add a house to see it here"
                    :isTransaction ? "Do a transaction to see it here"
                    : isRecentTransaction ? "No recent transaction available"
                    : isUserGroupsHeader ? "No User Groups Added"
                    : isBfInvoices ? "All invoices are paid"
                    : isEstatePayment ? "No Estate Payment available"
                    : isPaymentsTypeList ? "You have not added any payment type"
                    : isUnpaidInvoices ? "All invoices are paid"
                    : isNewLetFeesList ? "No New Let Fees available, consider adding one"
                    : isUtilityBillList ? "No Utility Bill available, added utility bills will appear here"
                    : isRecurrentExpenditure ? "No Recurrent Expenditure available, consider adding one"
                    : isPropertyReport ? "No Property Report available, consider adding one"
                    : isExpensesList ? "No Expenses Added, consider adding one"
                    : isPaymentStatement ? "No Payment Statement available"
                    : isUnpaidEstateInvoices ? "All invoices are paid"
                    : isHouses ? "No Houses Added"
                    : isPaidInvoices ? "No Paid invoices available"
                    : isHouseHistory ? "This house has no history"
                    : isUserHeader ? "No User Added"
                    : isHouseCategoryHeader ? "No House Category Added"
                    : isNothing ? ''
                    : isMeterTransaction ? "No meter transaction available" : '',
                    style: rubikMedium.copyWith(fontSize: Dimensions.fontSizeDefault), textAlign: TextAlign.center,
                  ),


                ]),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
