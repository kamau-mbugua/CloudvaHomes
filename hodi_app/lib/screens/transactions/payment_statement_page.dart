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
import '../../models/data/payment_statement/payment_statement.dart';
import '../../models/data/property_report/property_report.dart';
import '../../widgets/search_filter_row.dart';

class PaymentStatementPage extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;
  final isFilterByDate;

  const PaymentStatementPage({super.key, required this.propertyIdNotifier, this.isFilterByDate = true});
  @override
  _PaymentStatementPageState createState() => _PaymentStatementPageState();
}

class _PaymentStatementPageState extends State<PaymentStatementPage> {
  late PaginationController<PaymentStatementData> _paginationController;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchTerm = "";
  String _selectedUsedStatus = "";
  String _selectedPaymentType = "";

  MyHelpers helpers = MyHelpers();
  String firstDate = '';
  String lastDate = '';

  ValueNotifier<String>? propertyIdNotifierNew;

  @override
  void initState() {
    super.initState();
    firstDate = helpers.getCurrentMonthDates()['firstDate']!;
    lastDate = helpers.getCurrentMonthDates()['lastDate']!;
    propertyIdNotifierNew = widget.propertyIdNotifier;

    _paginationController = PaginationController<PaymentStatementData>(
      fetchItems: (page, pageSize) async {
        // Fetch user groups from your provider
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getPaymentStatement(page, pageSize, _searchTerm,
            widget.propertyIdNotifier.value, "",1, firstDate, lastDate, _selectedUsedStatus, _selectedPaymentType);
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .paymentStatementData ??
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
      if (!selectedPropertyId.isEmptyOrNull) {
        widget.propertyIdNotifier.value = selectedPropertyId;
      }

      if (!fromDate.isEmptyOrNull) {
        firstDate = fromDate;
      }
      if (!toDate.isEmptyOrNull) {
        lastDate = toDate;
      }
      _selectedUsedStatus = selectedUsedStatus;
      _selectedPaymentType = selectedPaymentType;
    });
    _paginationController.refresh();
    logger.d(
        ">>>>>>>>>onFilter<<<<<<<<<< selectedPropertyMonthNo: $selectedPropertyMonthNo, selectedYear: $selectedYear, selectedPropertyId: $selectedPropertyId, selectedPropertyCategoryId: $selectedPropertyCategoryId, fromDate: $fromDate, toDate: $toDate selectedUsedStatus: $selectedUsedStatus, selectedPaymentType: $selectedPaymentType");
  }
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Payment Statement',
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
                    'Payment Statement',
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
                    isPaymentStatementFilter: true,
                  ),
                  const MeterListItemView(isPaymentStatement: true),
                ],
              ),
            ),
            PagedSliverList<int, PaymentStatementData>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<PaymentStatementData>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isPaymentStatement: true,
                ),
                itemBuilder: (context, paymentStatementData, index) =>
                    GestureDetector(
                      onTap: () {
                        setState(() {
                          Navigator.pushNamed(
                            context,
                            AppRoutes.getPaymentDetailPageRoute(),
                            arguments: {
                              'paymentRef': paymentStatementData.paymentRrn.toString(),
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
                                    paymentStatementData.refNo.toString(),
                                    textAlign: TextAlign.start,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeExtraSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    "KES ${paymentStatementData.amount}",
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
                                    paymentStatementData.paymentRrn.toString(),
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeExtraSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.normal,
                                    ),
                                  ),
                                  Text(
                                    "${paymentStatementData.paymentType.toString()}",
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
                                    "${paymentStatementData.bankName.toString()}",
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeExtraSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.normal,
                                    ),
                                  ),
                                  Text(
                                    "${paymentStatementData.used.toString()}",
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
                                    "${paymentStatementData.paidOn.toString()}",
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeExtraSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.normal,
                                    ),
                                  ),
                                  Text(
                                    "${paymentStatementData.createdOn.toString()}",
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
