import 'package:flutter/material.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:provider/provider.dart';

import '../../../controller/pagination_controller.dart';
import '../../../logger.dart';
import '../../../models/data/utility_bills/utility_bills_list.dart';
import '../../../providers/authenticated_app_providers.dart';
import '../../../route/routes.dart';
import '../../../services/authority_service.dart';
import '../../../utils/authorities_constant.dart';
import '../../../utils/color_resources.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';
import '../../../widgets/base/custom_snackbar.dart';
import '../../../widgets/base/no_data_screen.dart';
import '../../../widgets/custom_confirmation_dialog.dart';
import '../../../widgets/custom_popup_menu.dart';
import '../../../widgets/meter_list_item_view.dart';
import '../../../widgets/search_filter_row.dart';

class UtilityBillListPage extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;

  const UtilityBillListPage({super.key, required this.propertyIdNotifier});

  @override
  _UtilityBillListPageState createState() => _UtilityBillListPageState();
}

class _UtilityBillListPageState extends State<UtilityBillListPage> {
  late PaginationController<UtilityBillListData> _paginationController;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchTerm = "";

  @override
  void initState() {
    super.initState();
    _paginationController = PaginationController<UtilityBillListData>(
      fetchItems: (page, pageSize) async {
        // Fetch user groups from your provider
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getUtilityBillList(page, pageSize, _searchTerm,
                widget.propertyIdNotifier.value, "");
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
                .utilityBillListData ??
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

  void _isUtilityBillAdded(bool isAdded) {
    if (isAdded) {
      _paginationController.refresh();
    }
  }

  void _deleteUserGroup(String id) {
    Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .updateUtilityBillStatus(id, "delete")
        .then((value) {
      if (value.isSuccess) {
        showCustomSnackBar(value.message, isError: false);
        _paginationController.refresh();
      } else {}
    });
  }

  void _deactivateUserGroup(String id) {
    Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .updateUtilityBillStatus(id, "deactivate")
        .then((value) {
      if (value.isSuccess) {
        showCustomSnackBar(value.message, isError: false);
        _paginationController.refresh();
      } else {}
    });
  }

  void _activateUserGroup(String id) {
    Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .updateUtilityBillStatus(id, "activate")
        .then((value) {
      if (value.isSuccess) {
        showCustomSnackBar(value.message, isError: false);
        _paginationController.refresh();
      } else {}
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
    setState(() {
      widget.propertyIdNotifier.value = selectedPropertyId;
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
          'Utility Bills',
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
      floatingActionButton: Visibility(
        visible: true,
        child: FloatingActionButton(
          onPressed: () {
            if (AuthorityService()
                .hasAuthority(AuthoritiesConstants.ROLE_UTILITY_BILLS_NEW)) {
              Navigator.pushNamed(
                  context, AppRoutes.getAddUtilityBillPageRoute(),
                  arguments: _isUtilityBillAdded);
            } else {
              showCustomSnackBar(
                  "You do not have permission to deactivate onboarding fee",
                  isError: true);
            }
          },
          backgroundColor: ColorResources.textBlue,
          child: Icon(Icons.add),
          tooltip: 'Add Utility Bill',
          elevation: 5,
        ),
      ),
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
                    'Utility Bills',
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
                    isUtilityBillFilter: true,
                  ),
                  const MeterListItemView(isUtilityBillList: true),
                ],
              ),
            ),
            PagedSliverList<int, UtilityBillListData>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<UtilityBillListData>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isUtilityBillList: true,
                ),
                itemBuilder: (context, utilityBillListData, index) =>
                    GestureDetector(
                  onTap: () {
                    setState(() {});
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
                                "${utilityBillListData.name.toString()} - ${utilityBillListData.property.toString()}",
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                utilityBillListData.typeName.toString(),
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
                                "KES ${utilityBillListData.amount ?? "N/A"}",
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                utilityBillListData.status == 1
                                    ? 'Active'
                                    : 'Inactive',
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: utilityBillListData.status == 1
                                      ? Colors.green
                                      : Colors.red,
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
                              //menu icon
                              CustomPopupMenu(
                                key: GlobalKey(),
                                onSelected: (value) {
                                  if (value == 'delete') {
                                    if (AuthorityService().hasAuthority(
                                        AuthoritiesConstants
                                            .ROLE_UTILITY_BILLS_DELETE)) {
                                      showDialog(
                                        context: context,
                                        barrierDismissible: false,
                                        builder: (BuildContext context) {
                                          return CustomConfirmationDialog(
                                            title: "Delete Utility Bill",
                                            content:
                                                "Are you sure you want to delete this ${utilityBillListData.name}?",
                                            confirmText: "YES",
                                            cancelText: "NO",
                                            onConfirm: () {
                                              // Handle confirm action
                                              Navigator.pop(context);
                                              _deleteUserGroup(
                                                  utilityBillListData.id
                                                      .toString());
                                            },
                                            onCancel: () {
                                              // Handle cancel action
                                              Navigator.pop(context);
                                            },
                                          );
                                        },
                                      );
                                    } else {
                                      return showCustomSnackBarWidget(
                                          "You do not have permission to deactivate onboarding fee",
                                          isError: true);
                                    }
                                  } else if (value == 'deactivate') {
                                    if (AuthorityService().hasAuthority(
                                        AuthoritiesConstants
                                            .ROLE_UTILITY_BILLS_EDIT)) {
                                      showDialog(
                                        context: context,
                                        barrierDismissible: false,
                                        builder: (BuildContext context) {
                                          return CustomConfirmationDialog(
                                            title: "Deactivate Utility Bill",
                                            content:
                                                "Are you sure you want to Deactivate this ${utilityBillListData.name}?",
                                            confirmText: "YES",
                                            cancelText: "NO",
                                            onConfirm: () {
                                              // Handle confirm action
                                              Navigator.pop(context);
                                              _deactivateUserGroup(
                                                  utilityBillListData.id
                                                      .toString());
                                            },
                                            onCancel: () {
                                              // Handle cancel action
                                              Navigator.pop(context);
                                            },
                                          );
                                        },
                                      );
                                    } else {
                                      return showCustomSnackBarWidget(
                                          "You do not have permission to deactivate onboarding fee",
                                          isError: true);
                                    }
                                  } else if (value == 'activate') {
                                    if (AuthorityService().hasAuthority(
                                        AuthoritiesConstants
                                            .ROLE_UTILITY_BILLS_EDIT)) {
                                      showDialog(
                                        context: context,
                                        barrierDismissible: false,
                                        builder: (BuildContext context) {
                                          return CustomConfirmationDialog(
                                            title: "Activate Utility Bill",
                                            content:
                                                "Are you sure you want to Activate this ${utilityBillListData.name}?",
                                            confirmText: "YES",
                                            cancelText: "NO",
                                            onConfirm: () {
                                              // Handle confirm action
                                              Navigator.pop(context);
                                              _activateUserGroup(
                                                  utilityBillListData.id
                                                      .toString());
                                            },
                                            onCancel: () {
                                              // Handle cancel action
                                              Navigator.pop(context);
                                            },
                                          );
                                        },
                                      );
                                    }
                                  } else {
                                    return showCustomSnackBarWidget(
                                        "You do not have permission to deactivate onboarding fee",
                                        isError: true);
                                  }
                                },
                                menuItems: [
                                  utilityBillListData.status == 1
                                      ? const PopupMenuItem(
                                          value: 'deactivate',
                                          child: Text('Deactivate'),
                                        )
                                      : const PopupMenuItem(
                                          value: 'activate',
                                          child: Text('Activate'),
                                        ),
                                  const PopupMenuItem(
                                    value: 'delete',
                                    child: Text('Delete'),
                                  ),
                                ],
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
