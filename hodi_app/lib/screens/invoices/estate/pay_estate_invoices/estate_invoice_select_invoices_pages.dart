import 'package:flutter/material.dart';
import 'package:hodi_app/route/routes.dart';
import 'package:hodi_app/utils/color_resources.dart';
import 'package:hodi_app/utils/styles.dart';
import 'package:hodi_app/widgets/base/custom_button.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../../controller/pagination_controller.dart';
import '../../../../models/data/authentication/login_response.dart';
import '../../../../models/data/estate_invoices/estate_invoices.dart';
import '../../../../models/data/tenants_invoices/invoice_types.dart';
import '../../../../providers/auth_provider.dart';
import '../../../../providers/authenticated_app_providers.dart';
import '../../../../utils/dimensions.dart';
import '../../../../viewmodel/payment_view_model.dart';

class EstateInvoiceSelectInvoicesPages extends StatefulWidget {
  @override
  _EstateInvoiceSelectInvoicesPagesState createState() =>
      _EstateInvoiceSelectInvoicesPagesState();
}

class _EstateInvoiceSelectInvoicesPagesState
    extends State<EstateInvoiceSelectInvoicesPages> {
  late PaginationController<EstateInvoiceData> _paginationController;
  List<EstateInvoiceData> selectedInvoices = [];
  String _searchTerm = "";
  String _selectedYear = "";
  String _selectedMonth = "";

  LoginResponse? loginResponse = null;


  int getCurrentYear([String? year]) {
    return year != null ? int.parse(year) : DateTime.now().year;
  }

  @override
  void initState() {
    super.initState();
    loginResponse = Provider.of<AuthProvider>(context, listen: false).getLoginResponse();
    _selectedYear = getCurrentYear().toString();
    _paginationController = PaginationController<EstateInvoiceData>(
      fetchItems: (page, pageSize) async {
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getEstateInvoicesPay(
          page,
          pageSize,
          loginResponse?.data.userDetails.estateId ?? "",

        );
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
                .estateInvoiceData ??
            [];
      },
    );
    Future.microtask(() => _paginationController.refresh());
  }

  @override
  void dispose() {
    _paginationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer2<AuthenticatedAppProviders,PaymentViewModel>(
      builder: (context, provider, paymentViewModel, child) {
        if (paymentViewModel.paymentSuccessful) {
          //close the dialog
          Navigator.pop(context);
        }

        return provider.isLoading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Text(
                    'Select the invoice(s) you want to pay',
                    style: poppinsBold.copyWith(
                      fontSize: Dimensions.fontSizeLarge,
                      color: ColorResources.colorNero,
                    ),
                  ).paddingBottom(16),
                  Expanded(
                    child: _buildInvoicesSelectList(),
                  ),
                  _buildCalculateSelectedInvoices()
                ],
              ).paddingAll(16);
      },
    );
  }

  Widget _buildCalculateSelectedInvoices() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          "Total Amount: KES ${_calculateTotalAmount()}",
          style: poppinsSemiBold.copyWith(
            color: Theme.of(context).primaryColor,
            fontSize: Dimensions.fontSizeDefault,
          ),
        ),

        Visibility(
          visible: true,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: CustomButton(
                  btnTxt: "Cancel",
                  isOutlined: true,
                  outlineColor: ColorResources.textRed,
                  onTap: () {
                    Navigator.pop(context);
                  },
                ),
              ),
              SizedBox(width: 8), // Add some spacing between the buttons
              Visibility(
                visible: selectedInvoices.isNotEmpty,
                child: Expanded(
                  child: CustomButton(
                    btnTxt: "Pay ${selectedInvoices.length} Invoice(s)",
                    backgroundColor: Theme.of(context).primaryColorDark,
                    onTap: () {

                      List<String> invoiceIds = [];
                      selectedInvoices.forEach((element) {
                        invoiceIds.add(element.id.toString());
                      });

                      var amount = _calculateTotalAmount();

                      //create a Hashmap of the above

                      var paymentPayload = {
                        "invoiceIds": invoiceIds,
                        "amount": amount,
                        "paidBy": selectedInvoices[0].adminName,
                        "phoneNo": selectedInvoices[0].adminPhone,
                      };

                      Navigator.pushNamed(context, AppRoutes.getPaymentListRoute(), arguments:{
                        "propertyId":"",
                        "originInvoice":"hodi",
                        "paymentPayload":paymentPayload
                      });
                    },
                  ),
                ),
              ),
            ],
          ).paddingTop(16),
        )

      ],
    );
  }

  double _calculateTotalAmount() {
    double totalAmount = 0;
    selectedInvoices.forEach((element) {
      totalAmount += element.invoiceAmount;
    });
    return totalAmount;
  }

  Widget _buildInvoicesSelectList() {
    return RefreshIndicator(
      onRefresh: () => _paginationController.refresh(),
      child: PagedListView<int, EstateInvoiceData>(
        pagingController: _paginationController.pagingController,
        builderDelegate: PagedChildBuilderDelegate<EstateInvoiceData>(
          itemBuilder: (context, item, index) {
            return CheckboxListTile(
              title: Text(
                item.rrn,
                style: poppinsSemiBold.copyWith(
                  color: Theme.of(context).dividerColor,
                  fontSize: Dimensions.fontSizeDefault,
                ),
              ),
              subtitle: Text(
                "KES ${item.invoiceAmount.toString()}",
                style: poppinsSemiBold.copyWith(
                  color: Theme.of(context).dividerColor,
                  fontSize: Dimensions.fontSizeDefault,
                ),
              ),
              value: selectedInvoices.contains(item),
              onChanged: (bool? value) {
                if (value!) {
                  setState(() {
                    selectedInvoices.add(item);
                  });
                } else {
                  setState(() {
                    selectedInvoices.remove(item);
                  });
                }
              },
            );
          },
        ),
      ),
    );
  }
}
