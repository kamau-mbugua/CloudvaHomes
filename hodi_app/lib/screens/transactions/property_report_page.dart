import 'package:flutter/material.dart';
import 'package:hodi_app/models/data/expenditure/recurrent_expenditure.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../controller/pagination_controller.dart';
import '../../../models/data/expenses/expense_list_response.dart';
import '../../../providers/authenticated_app_providers.dart';
import '../../../route/routes.dart';
import '../../../utils/color_resources.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/helpers.dart';
import '../../../utils/styles.dart';
import '../../../widgets/base/custom_snackbar.dart';
import '../../../widgets/base/no_data_screen.dart';
import '../../../widgets/custom_confirmation_dialog.dart';
import '../../../widgets/custom_popup_menu.dart';
import '../../../widgets/meter_list_item_view.dart';
import '../../logger.dart';
import '../../models/data/property_report/property_report.dart';
import '../../widgets/search_filter_row.dart';

class PropertyReportPage extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;

  const PropertyReportPage({super.key, required this.propertyIdNotifier});
  @override
  _PropertyReportPageState createState() => _PropertyReportPageState();
}

class _PropertyReportPageState extends State<PropertyReportPage> {
  late PaginationController<PropertyReportData> _paginationController;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchTerm = "";
  String _selectedYear = "";
  String _selectedPropertyMonthNo = "";

  MyHelpers helpers = MyHelpers();
  String firstDate = '';
  String lastDate = '';

  @override
  void initState() {
    super.initState();
    firstDate = helpers.getCurrentMonthDates()['firstDate']!;
    lastDate = helpers.getCurrentMonthDates()['lastDate']!;

    _paginationController = PaginationController<PropertyReportData>(
      fetchItems: (page, pageSize) async {
        // Fetch user groups from your provider
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getPropertyReport(page, pageSize, _searchTerm,
            widget.propertyIdNotifier.value, "",1, _selectedYear, _selectedPropertyMonthNo);
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .propertyReportData ??
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



  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Property Report',
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
      ),
      body: _buildUserGroupsList(),
    );
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
      widget.propertyIdNotifier.value = selectedPropertyId;
      _selectedYear = selectedYear;
      _selectedPropertyMonthNo = selectedPropertyMonthNo;
    });
    _paginationController.refresh();
    logger.d(
        ">>>>>>>>>onFilter<<<<<<<<<< selectedPropertyMonthNo: $selectedPropertyMonthNo, selectedYear: $selectedYear, selectedPropertyId: $selectedPropertyId, selectedPropertyCategoryId: $selectedPropertyCategoryId, fromDate: $fromDate, toDate: $toDate selectedUsedStatus: $selectedUsedStatus, selectedPaymentType: $selectedPaymentType");
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
                    'Property Report',
                    style: poppinsBold.copyWith(
                      fontSize: Dimensions.fontSizeLarge,
                      color: ColorResources.colorNero,
                    ),
                  ),
                  SearchFilterRow(
                    searchController: _searchController,
                    searchFocusNode: _searchFocusNode,
                    onFilter: _onFilter,
                    propertyIdNotifier: widget.propertyIdNotifier,
                    isPropertyFilter: true,
                  ),
                  const MeterListItemView(isPropertyReport: true),
                ],
              ),
            ),
            PagedSliverList<int, PropertyReportData>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<PropertyReportData>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isPropertyReport: true,
                ),
                itemBuilder: (context, propertyReportData, index) =>
                    GestureDetector(
                      onTap: () {
                        setState(() {

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
                                    propertyReportData.property.toString(),
                                    textAlign: TextAlign.start,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeExtraSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    "${propertyReportData.year}-${propertyReportData.monthName}",
                                    textAlign: TextAlign.start,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeExtraSmall,
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
                                    propertyReportData.totalUnits.toString(),
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeExtraSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.normal,
                                    ),
                                  ),
                                  Text(
                                    "${propertyReportData.occupiedUnits.toString()}",
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeExtraSmall,
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
                                    "KES ${propertyReportData.invoiceAmount.toString()}",
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeExtraSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.normal,
                                    ),
                                  ),
                                  Text(
                                    "KES ${propertyReportData.paymentAmount.toString()}",
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeExtraSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.normal,
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
                                    "KES ${propertyReportData.rentArrears.toString()}",
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeExtraSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.normal,
                                    ),
                                  ),
                                  Text(
                                    "KES ${propertyReportData.expenseAmount.toString()}",
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeExtraSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.normal,
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
