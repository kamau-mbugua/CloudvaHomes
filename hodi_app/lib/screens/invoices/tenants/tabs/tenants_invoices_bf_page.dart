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
import '../../../../widgets/base/custom_snackbar.dart';
import '../../../../widgets/base/no_data_screen.dart';
import '../../../../widgets/meter_list_item_view.dart';
import '../../../../widgets/search_filter_row.dart';


class TenantsInvoicesBFPage extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;
  bool isSelf;
  TenantsInvoicesBFPage({super.key, required this.propertyIdNotifier, this.isSelf = false});
  @override
  _TenantsInvoicesBFPageState createState() => _TenantsInvoicesBFPageState();
}

class _TenantsInvoicesBFPageState extends State<TenantsInvoicesBFPage> {
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
    _paginationController = PaginationController<TenantInvoiceData>(
      fetchItems: (page, pageSize) async {
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getTenantsInvoices(page,
            pageSize,
            InvoiceStatus.BF,
          _monthSelected,
          _yearSelected,
          "",
          widget.propertyIdNotifier?.value ?? "",
          _searchTerm,
          _categoryId,
          widget.isSelf,
          "",
          ""
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
                    'BF Invoices',
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
                    isInvoiceFilter: true,
                  ),
                  const MeterListItemView(isBfInvoices: true),
                ],
              ),
            ),
            PagedSliverList<int, TenantInvoiceData>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<TenantInvoiceData>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isBfInvoices: true,
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
