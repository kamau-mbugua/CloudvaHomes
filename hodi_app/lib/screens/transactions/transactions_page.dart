import 'package:flutter/material.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../controller/pagination_controller.dart';
import '../../logger.dart';
import '../../models/data/payments/payments.dart';
import '../../providers/authenticated_app_providers.dart';
import '../../route/routes.dart';
import '../../utils/color_resources.dart';
import '../../utils/dimensions.dart';
import '../../utils/helpers.dart';
import '../../utils/styles.dart';
import '../../widgets/base/no_data_screen.dart';
import '../../widgets/dashboard_listItem_view.dart';
import '../../widgets/meter_list_item_view.dart';
import '../../widgets/search_filter_row.dart';

class TransactionsPage extends StatefulWidget {
  String? propertyId;
  String? tenantId;
  final bool self;
  TransactionsPage({super.key, this.propertyId, this.self = false, this.tenantId = ""});

  @override
  _TransactionsPageState createState() => _TransactionsPageState();
}

class _TransactionsPageState extends State<TransactionsPage> {

  MyHelpers helpers = MyHelpers();
  String firstDate = '';
  String lastDate = '';
  late PaginationController<Payment> _paginationController;

  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchTerm = "";
  String _categoryId = "";
  ValueNotifier<String>? propertyIdNotifierNew;

  @override
  void initState() {
    super.initState();
    propertyIdNotifierNew = ValueNotifier(widget.propertyId ?? "");
    firstDate = helpers.getThreeMonthsAgoDates()['firstDate']!;
    lastDate = helpers.getThreeMonthsAgoDates()['lastDate']!;
    _paginationController = PaginationController<Payment>(
      fetchItems: (page, pageSize) async {
        // Fetch tenants from your provider
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getPaymentsData(
            0, 10, widget.propertyId ?? "", "", firstDate, lastDate, widget.self, _categoryId, widget?.tenantId ?? "");
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .paymentResponse?.content ?? [];
      },
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _paginationController.refresh();
    });
    _searchFocusNode.addListener(_onSearchFocusChange);
  }

  void _onSearchFocusChange() {
    if (!_searchFocusNode.hasFocus) {
      _searchTerm = _searchController.text;
      if (mounted) {
        _paginationController.refresh();
      }
    }
  }


  @override
  void dispose() {
    _paginationController.dispose();
    firstDate = '';
    lastDate = '';
    _searchController.dispose();
    _searchFocusNode.removeListener(_onSearchFocusChange);
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
      widget.propertyId = selectedPropertyId;
      firstDate = fromDate;
      lastDate = toDate;
      _categoryId = selectedPropertyCategoryId;
    });
    _paginationController.refresh();
    logger.d(
        ">>>>>>>>>onFilter<<<<<<<<<< selectedPropertyMonthNo: $selectedPropertyMonthNo, selectedYear: $selectedYear, selectedPropertyId: $selectedPropertyId, selectedPropertyCategoryId: $selectedPropertyCategoryId, fromDate: $fromDate, toDate: $toDate selectedUsedStatus: $selectedUsedStatus, selectedPaymentType: $selectedPaymentType");
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.tenantId.isEmptyOrNull? AppBar(
        title: Text(widget.self ? 'My Transactions' :
          'All Transactions',
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
      ) : null,
      body: _buildMeters(),
    );
  }

  Widget _buildMeters(){
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
                  widget.tenantId.isEmptyOrNull?
                  Text(widget.self ? 'My Transactions' :
                    'All Transactions',
                    style: poppinsBold.copyWith(
                      fontSize: Dimensions.fontSizeLarge,
                      color: ColorResources.colorNero,
                    ),
                  ): SizedBox(),
                  widget.tenantId.isEmptyOrNull?
                  SearchFilterRow(
                    searchController: _searchController,
                    searchFocusNode: _searchFocusNode,
                    onFilter: _onFilter,
                    propertyIdNotifier: propertyIdNotifierNew,
                    isPaymentFilter: true,
                  ): SizedBox(),
                  DashboardListItemView(isHeader: true),
                ],
              ),
            ),
            PagedSliverList<int, Payment>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<Payment>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isFooter: false,
                  isRecentTransaction: true,
                ),
                itemBuilder: (context, payment, index) => GestureDetector(
                  onTap: () {
                    setState(() {
                      Navigator.pushNamed(
                        context,
                        AppRoutes.getPaymentDetailPageRoute(),
                        arguments: {
                          'paymentRef': payment.paymentRrn.toString(),
                        },
                      );
                    });
                  },
                  child: Container(
                    width: MediaQuery.of(context).size.width - 32,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      color: Colors.grey[index % 2 == 0 ? 100 : 200],
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                payment.paymentRrn,
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                "KES ${payment.rentOwed.toString()}",
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.normal,
                                ),
                              ),
                            ],
                          ),
                        ),Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                payment.houseName,
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                "KES ${payment.rentPaid.toString()}",
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
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                payment.paidBy,
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                payment!.paidOn.toString(),
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
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