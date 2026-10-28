import 'package:flutter/material.dart';
import 'package:hodi_app/models/data/tenants_invoices/tenants_invoices.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../../../controller/pagination_controller.dart';
import '../../../../../logger.dart';
import '../../../../../models/data/tenants_invoices/invoice_types.dart';
import '../../../../../providers/authenticated_app_providers.dart';
import '../../../../../route/routes.dart';
import '../../../../../utils/color_resources.dart';
import '../../../../../utils/dimensions.dart';
import '../../../../../utils/styles.dart';
import '../../../../../widgets/base/custom_snackbar.dart';
import '../../../../../widgets/base/no_data_screen.dart';
import '../../../../../widgets/meter_list_item_view.dart';
import '../../../../../widgets/search_filter_row.dart';
import '../../../../models/data/houses/house_history.dart';


class HouseHistoryPage extends StatefulWidget {
  final ValueNotifier<String>? propertyIdNotifier;
  bool isSelf;
  String houseId;
  HouseHistoryPage({super.key,this.propertyIdNotifier = null, this.isSelf= false, this.houseId = ""});
  @override
  _HouseHistoryPageState createState() => _HouseHistoryPageState();
}

class _HouseHistoryPageState extends State<HouseHistoryPage> {
  late PaginationController<HouseHistoryData> _paginationController;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchTerm = "";

  @override
  void initState() {
    super.initState();
    _paginationController = PaginationController<HouseHistoryData>(
      fetchItems: (page, pageSize) async {
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getHouseHistory(page,
            pageSize,
            widget.houseId
        );
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .houseHistoryData ??
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

  void _deleteUserGroup(String id) {
    Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .updateHouseCategoryStatus(id, "delete")
        .then((value) {
      if (value.isSuccess) {
        showCustomSnackBar(value.message, isError: false);
        _paginationController.refresh();
      } else {
        showCustomSnackBar(
          value.message,
        );
      }
    });
  }

  void _deactivateUserGroup(String id) {
    Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .updateHouseCategoryStatus(id,"deactivate")
        .then((value) {
      if (value.isSuccess) {
        showCustomSnackBar(value.message, isError: false);
        _paginationController.refresh();
      } else {
        showCustomSnackBar(
          value.message,
        );
      }
    });
  }

  void _activateUserGroup(String id) {
    Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .updateHouseCategoryStatus(id,"activate")
        .then((value) {
      if (value.isSuccess) {
        showCustomSnackBar(value.message, isError: false);
        _paginationController.refresh();
      } else {
        showCustomSnackBar(
          value.message,
        );
      }
    });
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
                  widget.houseId.isEmptyOrNull?
                  Text(
                    'Paid Invoices',
                    style: poppinsBold.copyWith(
                      fontSize: Dimensions.fontSizeLarge,
                      color: ColorResources.colorNero,
                    ),
                  ):Container(),
                  widget.houseId.isEmptyOrNull?
                  SearchFilterRow(
                    searchController: _searchController,
                    searchFocusNode: _searchFocusNode,
                    onFilter: _onFilter,
                    propertyIdNotifier: widget.propertyIdNotifier,
                    isInvoiceFilter: true,
                  ):Container(),
                  const MeterListItemView(isHouseHistory: true),
                ],
              ),
            ),
            PagedSliverList<int, HouseHistoryData>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<HouseHistoryData>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isHouseHistory: true,
                ),
                itemBuilder: (context, houseHistoryData, index) =>
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
                                    houseHistoryData.tenantName.toString(),
                                    textAlign: TextAlign.start,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    houseHistoryData.tenantPhone.toString(),
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
                                    houseHistoryData.occupiedOn.toString(),
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    houseHistoryData.vacatedOn ?? "N/A",
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
                                    "KES ${houseHistoryData.rentOwed.toString()}",
                                    textAlign: TextAlign.end,
                                    style: poppinsRegular.copyWith(
                                      fontSize: Dimensions.fontSizeSmall,
                                      color: Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    "${houseHistoryData.vacatorName ?? "N/A"}",
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
