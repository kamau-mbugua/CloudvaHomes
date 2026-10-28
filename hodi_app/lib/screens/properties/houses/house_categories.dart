import 'package:flutter/material.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../../controller/pagination_controller.dart';
import '../../../../providers/authenticated_app_providers.dart';
import '../../../../utils/color_resources.dart';
import '../../../../utils/dimensions.dart';
import '../../../../utils/styles.dart';
import '../../../../widgets/base/custom_snackbar.dart';
import '../../../../widgets/base/no_data_screen.dart';
import '../../../../widgets/custom_confirmation_dialog.dart';
import '../../../../widgets/custom_popup_menu.dart';
import '../../../../widgets/meter_list_item_view.dart';
import '../../../logger.dart';
import '../../../models/data/house_categories/house_ccategories.dart';
import '../../../widgets/search_filter_row.dart';

class HouseCategoriesPage extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;

  const HouseCategoriesPage({super.key, required this.propertyIdNotifier});
  @override
  _HouseCategoriesPageState createState() => _HouseCategoriesPageState();
}

class _HouseCategoriesPageState extends State<HouseCategoriesPage> {
  late PaginationController<HouseCategoryData> _paginationController;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchTerm = "";

  @override
  void initState() {
    super.initState();
    _paginationController = PaginationController<HouseCategoryData>(
      fetchItems: (page, pageSize) async {
        // Fetch user groups from your provider
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getHouseCategories(page, pageSize, _searchTerm,
                widget.propertyIdNotifier.value, "");
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
                .houseCategoryData ??
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
          'House Categories',
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
                    'House Categories',
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
                    isCategoryFilter: true,
                  ),
                  const MeterListItemView(isHouseCategoryHeader: true),
                ],
              ),
            ),
            PagedSliverList<int, HouseCategoryData>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<HouseCategoryData>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isHouseCategoryHeader: true,
                ),
                itemBuilder: (context, houseCategoryData, index) =>
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
                                houseCategoryData.name.toString(),
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                houseCategoryData.property.toString(),
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
                                houseCategoryData.units.toString(),
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                houseCategoryData.status == 1
                                    ? 'Active'
                                    : 'Inactive',
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: houseCategoryData.status == 1
                                      ? Colors.green
                                      : Colors.red,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: houseCategoryData.units > 0
                              ? Container()
                              : Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    //menu icon
                                    CustomPopupMenu(
                                      key: GlobalKey(),
                                      onSelected: (value) {
                                        if (value == 'delete') {
                                          showDialog(
                                            context: context,
                                            barrierDismissible: false,
                                            builder: (BuildContext context) {
                                              return CustomConfirmationDialog(
                                                title: "Delete House Category",
                                                content:
                                                    "Are you sure you want to delete this ${houseCategoryData.name}?",
                                                confirmText: "YES",
                                                cancelText: "NO",
                                                onConfirm: () {
                                                  // Handle confirm action
                                                  Navigator.pop(context);
                                                  _deleteUserGroup(
                                                      houseCategoryData.id
                                                          .toString());
                                                },
                                                onCancel: () {
                                                  // Handle cancel action
                                                  Navigator.pop(context);
                                                },
                                              );
                                            },
                                          );
                                        } else if (value == 'deactivate') {
                                          showDialog(
                                            context: context,
                                            barrierDismissible: false,
                                            builder: (BuildContext context) {
                                              return CustomConfirmationDialog(
                                                title:
                                                    "Deactivate House Category",
                                                content:
                                                    "Are you sure you want to Deactivate this ${houseCategoryData.name}?",
                                                confirmText: "YES",
                                                cancelText: "NO",
                                                onConfirm: () {
                                                  // Handle confirm action
                                                  Navigator.pop(context);
                                                  _deactivateUserGroup(
                                                      houseCategoryData.id
                                                          .toString());
                                                },
                                                onCancel: () {
                                                  // Handle cancel action
                                                  Navigator.pop(context);
                                                },
                                              );
                                            },
                                          );
                                        }else if (value == 'activate') {
                                          showDialog(
                                            context: context,
                                            barrierDismissible: false,
                                            builder: (BuildContext context) {
                                              return CustomConfirmationDialog(
                                                title:
                                                    "Activate House Category",
                                                content:
                                                    "Are you sure you want to Activate this ${houseCategoryData.name}?",
                                                confirmText: "YES",
                                                cancelText: "NO",
                                                onConfirm: () {
                                                  // Handle confirm action
                                                  Navigator.pop(context);
                                                  _activateUserGroup(
                                                      houseCategoryData.id
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
                                      },
                                      menuItems: [
                                        houseCategoryData.status == 1
                                            ? PopupMenuItem(
                                                value: 'deactivate',
                                                child: Text('Deactivate'),
                                              )
                                            : PopupMenuItem(
                                                value: 'activate',
                                                child: Text('Activate'),
                                              ),
                                        PopupMenuItem(
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
