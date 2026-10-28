import 'package:flutter/material.dart';
import 'package:hodi_app/models/data/tenants_invoices/tenants_invoices.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../../controller/pagination_controller.dart';
import '../../../../logger.dart';
import '../../../../models/data/estate_invoices/estate_invoices.dart';
import '../../../../models/data/tenants_invoices/invoice_types.dart';
import '../../../../providers/authenticated_app_providers.dart';
import '../../../../route/routes.dart';
import '../../../../utils/color_resources.dart';
import '../../../../utils/dimensions.dart';
import '../../../../utils/styles.dart';
import '../../../../viewmodel/payment_view_model.dart';
import '../../../../widgets/base/custom_snackbar.dart';
import '../../../../widgets/base/no_data_screen.dart';
import '../../../../widgets/meter_list_item_view.dart';
import '../../../../widgets/search_filter_row.dart';


class EstateUnpaidInvoices extends StatefulWidget {

  const EstateUnpaidInvoices({super.key});
  @override
  _EstateUnpaidInvoicesPageState createState() => _EstateUnpaidInvoicesPageState();
}

class _EstateUnpaidInvoicesPageState extends State<EstateUnpaidInvoices> {
  late PaginationController<EstateInvoiceData> _paginationController;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchTerm = "";
  String _selectedYear = "";
  String _selectedMonth = "";

  @override
  void initState() {
    super.initState();
    _selectedYear = getCurrentYear().toString();
    _paginationController = PaginationController<EstateInvoiceData>(
      fetchItems: (page, pageSize) async {
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getEstateInvoices(page,
            pageSize,
            InvoiceStatus.UNPAID,
            _selectedMonth,
            _selectedYear,
            _searchTerm,
        );
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .estateInvoiceData ??
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
      _selectedYear = selectedYear;
      _selectedMonth = selectedPropertyMonthNo;
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
                  Text(
                    'Estate Unpaid Invoices',
                    style: poppinsBold.copyWith(
                      fontSize: Dimensions.fontSizeLarge,
                      color: ColorResources.colorNero,
                    ),
                  ),
                  SearchFilterRow(
                    searchController: _searchController,
                    searchFocusNode: _searchFocusNode,
                    onFilter: _onFilter,
                    propertyIdNotifier: null,
                    isEstateInvoiceFilter: true,
                  ),
                  const MeterListItemView(isEstateUnpaidInvoices: true),
                ],
              ),
            ),
            PagedSliverList<int, EstateInvoiceData>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<EstateInvoiceData>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isUnpaidEstateInvoices: true,
                ),
                itemBuilder: (context, estateInvoiceData, index) =>
                    GestureDetector(
                      onTap: () {
                        setState(() {
                          Navigator.pushNamed(
                            context,
                            AppRoutes.getEstateInvoiceDetailPageRoute(),
                            arguments: {
                              'invoiceRef': estateInvoiceData.rrn.toString(),
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
                                    estateInvoiceData.rrn.toString(),
                                    textAlign: TextAlign.start,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    estateInvoiceData.monthName.toString(),
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
                                   "KES ${ estateInvoiceData.invoiceAmount.toString()}",
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    "KES ${ estateInvoiceData.rentAmount.toString()}",
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
                                    "${estateInvoiceData.dueDate.toString()}",
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    "${estateInvoiceData.adminName.toString()}",
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
