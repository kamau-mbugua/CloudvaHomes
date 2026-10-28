import 'package:flutter/material.dart';
import 'package:hodi_app/models/data/tenants_invoices/tenants_invoices.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../../controller/pagination_controller.dart';
import '../../../../logger.dart';
import '../../../../models/data/estate_invoices/estate_invoices.dart';
import '../../../../models/data/estate_payment/estate_payment.dart';
import '../../../../models/data/tenants_invoices/invoice_types.dart';
import '../../../../providers/authenticated_app_providers.dart';
import '../../../../route/routes.dart';
import '../../../../utils/color_resources.dart';
import '../../../../utils/dimensions.dart';
import '../../../../utils/helpers.dart';
import '../../../../utils/styles.dart';
import '../../../../widgets/base/custom_snackbar.dart';
import '../../../../widgets/base/no_data_screen.dart';
import '../../../../widgets/meter_list_item_view.dart';
import '../../../../widgets/search_filter_row.dart';


class EstatePayment extends StatefulWidget {
  const EstatePayment({super.key});
  @override
  _EstatePaymentPageState createState() => _EstatePaymentPageState();
}

class _EstatePaymentPageState extends State<EstatePayment> {
  late PaginationController<EstatePaymentData> _paginationController;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchTerm = "";
  MyHelpers helpers = MyHelpers();
  String firstDate = '';
  String lastDate = '';

  @override
  void initState() {
    super.initState();
    firstDate = helpers.getCurrentMonthDates()['firstDate']!;
    lastDate = helpers.getCurrentMonthDates()['lastDate']!;

    _paginationController = PaginationController<EstatePaymentData>(
      fetchItems: (page, pageSize) async {
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getEstatePayments(page,
          pageSize,
          firstDate,
          lastDate,
          _searchTerm,
        );
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .estatePaymentData ??
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
      firstDate = fromDate;
      lastDate = toDate;
    });
    _paginationController.refresh();
    logger.d(
        ">>>>>>>>>onFilter<<<<<<<<<< selectedPropertyMonthNo: $selectedPropertyMonthNo, selectedYear: $selectedYear, selectedPropertyId: $selectedPropertyId, selectedPropertyCategoryId: $selectedPropertyCategoryId, fromDate: $fromDate, toDate: $toDate selectedUsedStatus: $selectedUsedStatus, selectedPaymentType: $selectedPaymentType");
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _buildUserGroupsList(),
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
                    'Estate Payment',
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
                    isEstateInvoicePaymentFilter: true,
                  ),
                  const MeterListItemView(isEstatePayment: true),
                ],
              ),
            ),
            PagedSliverList<int, EstatePaymentData>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<EstatePaymentData>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isEstatePayment: true,
                ),
                itemBuilder: (context, estatePaymentData, index) =>
                    GestureDetector(
                      onTap: () {
                        setState(() {
                          Navigator.pushNamed(
                            context,
                            AppRoutes.getEstateInvoiceDetailPageRoute(),
                            arguments: {
                              'invoiceRef': estatePaymentData.invoiceRrn.toString(),
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
                                    estatePaymentData.paymentRrn.toString(),
                                    textAlign: TextAlign.start,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    estatePaymentData.invoiceRrn.toString(),
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
                                    "KES ${ estatePaymentData.paidAmount.toString()}",
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    "${estatePaymentData.paymentType.toString()}",
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
                                    "${estatePaymentData.paidBy.toString()}",
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    "${estatePaymentData.createdOn.toString()}",
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
