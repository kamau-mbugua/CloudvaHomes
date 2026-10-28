import 'package:flutter/material.dart';
import 'package:hodi_app/models/data/tenants_invoices/tenants_invoices.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../../controller/pagination_controller.dart';
import '../../../../logger.dart';
import '../../../../models/data/tenants_invoices/invoice_types.dart';
import '../../../../providers/authenticated_app_providers.dart';
import '../../../../route/routes.dart';
import '../../../../utils/color_resources.dart';
import '../../../../utils/dimensions.dart';
import '../../../../utils/styles.dart';
import '../../../../viewmodel/payment_view_model.dart';
import '../../../../widgets/base/no_data_screen.dart';
import '../../../../widgets/meter_list_item_view.dart';
import '../../../../widgets/search_filter_row.dart';

class TenantsInvoicesUnpaidPage extends StatefulWidget {
  final ValueNotifier<String>? propertyIdNotifier;
  bool isSelf;
  bool isShowAppBar;
  String houseId;
  String tenantId;
  TenantsInvoicesUnpaidPage(
      {super.key,
      this.propertyIdNotifier = null,
      this.isSelf = false,
      this.isShowAppBar = false,
      this.houseId = "",
      this.tenantId = "",
      });

  @override
  _TenantsInvoicesUnpaidPageState createState() =>
      _TenantsInvoicesUnpaidPageState();
}

class _TenantsInvoicesUnpaidPageState extends State<TenantsInvoicesUnpaidPage> {
  late PaginationController<TenantInvoiceData> _paginationController;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchTerm = "";
  String _categoryId = "";
  String _yearSelected = "";
  String _monthSelected = "";

  @override
  void initState() {
    super.initState();
    _yearSelected = getCurrentYear().toString();
    _paginationController = PaginationController<TenantInvoiceData>(
      fetchItems: (page, pageSize) async {
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getTenantsInvoices(
          page,
          pageSize,
          InvoiceStatus.UNPAID,
          _monthSelected,
          _yearSelected,
          "",
          widget.propertyIdNotifier?.value ?? "",
          _searchTerm,
          _categoryId,
          widget.isSelf,
          widget.houseId,
          widget.tenantId,
        );
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
                .tenantInvoiceData ??
            [];
      },
    );
    Future.microtask(() => _paginationController.refresh());

    _searchFocusNode.addListener(() {
      if (!_searchFocusNode.hasFocus) {
        _searchTerm = _searchController.text;
        _paginationController.refresh();
      }
    });
  }

  int getCurrentYear([String? year]) {
    return year != null ? int.parse(year) : DateTime.now().year;
  }

  @override
  void dispose() {
    _paginationController.dispose();
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  void _onFilter(
    String selectedPropertyMonthNo,
    String selectedYear,
    String selectedPropertyId,
    String selectedPropertyCategoryId,
    String fromDate,
    String toDate,
    String selectedUsedStatus,
    String selectedPaymentType,
  ) {
    setState(() {
      widget.propertyIdNotifier?.value = selectedPropertyId;
      _categoryId = selectedPropertyCategoryId;
      _yearSelected = selectedYear;
      _monthSelected = selectedPropertyMonthNo;
    });
    _paginationController.refresh();
    logger.d(
        ">>>>>>>>>onFilter<<<<<<<<<< selectedPropertyMonthNo: $selectedPropertyMonthNo, selectedYear: $selectedYear, selectedPropertyId: $selectedPropertyId, selectedPropertyCategoryId: $selectedPropertyCategoryId, fromDate: $fromDate, toDate: $toDate selectedUsedStatus: $selectedUsedStatus, selectedPaymentType: $selectedPaymentType");
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<PaymentViewModel>(
  builder: (context, provider, child) {
    if (provider.paymentSuccessful) {
      //refresh the page
      _paginationController.refresh();
    }
  return Scaffold(
      appBar: widget.isShowAppBar
          ? AppBar(
              title: Text(
                "Expense-Expenditure",
                style: poppinsBold.copyWith(
                  color: Theme.of(context).primaryColor,
                  fontSize: Dimensions.fontSizeDefault,
                ),
              ),
              centerTitle: true,
              backgroundColor: Colors.white,
              leading: BackButton(
                color: Colors.black,
                onPressed: () {
                  Navigator.pop(context);
                },
              ),
            )
          : null,
      body: _buildUserGroupsList(),
    );
  },
);
  }

  Widget _buildUserGroupsList() {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: RefreshIndicator(
        onRefresh: _paginationController.refresh,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  widget.houseId.isEmptyOrNull ||
                  widget.tenantId.isEmptyOrNull
                      ? Text(
                          'Unpaid Invoices',
                          style: poppinsBold.copyWith(
                            fontSize: Dimensions.fontSizeLarge,
                            color: ColorResources.colorNero,
                          ),
                        )
                      : Container(),
                  widget.houseId.isEmptyOrNull ||
                  widget.tenantId.isEmptyOrNull
                      ? SearchFilterRow(
                          searchController: _searchController,
                          searchFocusNode: _searchFocusNode,
                          onFilter: _onFilter,
                          propertyIdNotifier: widget.propertyIdNotifier,
                          isInvoiceFilter: true,
                        )
                      : Container(),
                  const MeterListItemView(isBfInvoices: true),
                ],
              ),
            ),
            PagedSliverList<int, TenantInvoiceData>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<TenantInvoiceData>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isUnpaidInvoices: true,
                ),
                itemBuilder: (context, tenantInvoiceData, index) =>
                    GestureDetector(
                  onTap: () {
                    setState(() {
                      Navigator.pushNamed(
                        context,
                        AppRoutes.getInvoiceDetailPageRoute(),
                        arguments: {
                          'invoiceRef': tenantInvoiceData.rrn.toString(),
                        },
                      );
                    });
                  },
                  child: Container(
                    width: MediaQuery.of(context).size.width - 32,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      color: Colors.grey[index % 2 == 0 ? 100 : 200],
                      border: Border.all(color: Colors.white),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                tenantInvoiceData.rrn.toString(),
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                tenantInvoiceData.houseName.toString(),
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.normal,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              Text(
                                tenantInvoiceData.tenantName.toString(),
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                tenantInvoiceData.dueDate,
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                "KES ${tenantInvoiceData.rentOwed.toString()}",
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                "KES ${tenantInvoiceData.rentPaid.toString()}",
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
