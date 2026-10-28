import 'package:flutter/material.dart';
import 'package:hodi_app/models/data/expenditure/recurrent_expenditure.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:provider/provider.dart';

import '../../../controller/pagination_controller.dart';
import '../../../logger.dart';
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

class RecurrentExpenditurePage extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;
  final isShowToolbar;
  const RecurrentExpenditurePage(
      {super.key, required this.propertyIdNotifier, this.isShowToolbar = true});

  @override
  _RecurrentExpenditurePageState createState() =>
      _RecurrentExpenditurePageState();
}

class _RecurrentExpenditurePageState extends State<RecurrentExpenditurePage> {
  late PaginationController<ReccurentExpenseData> _paginationController;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchTerm = "";

  @override
  void initState() {
    super.initState();
    _paginationController = PaginationController<ReccurentExpenseData>(
      fetchItems: (page, pageSize) async {
        // Fetch user groups from your provider
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getReccurrentExpenditure(page, pageSize, _searchTerm,
                widget.propertyIdNotifier.value, "");
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
                .reccurentExpenseData ??
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

  void _isExpenditureAdded(bool isAdded) {
    if (isAdded) {
      _paginationController.refresh();
    }
  }

  void _deleteUserGroup(String id) {
    Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .updateRecurringExpenditureStatus(id, "delete")
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
        .updateRecurringExpenditureStatus(id, "deactivate")
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
        .updateRecurringExpenditureStatus(id, "activate")
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
      appBar: widget.isShowToolbar
          ? AppBar(
              title: Text(
                'Recurrent Expenditure',
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
      floatingActionButton: Visibility(
        visible: true,
        child: FloatingActionButton(
          onPressed: () {
            if (AuthorityService()
                .hasAuthority(AuthoritiesConstants.ROLE_EXPENDITURES_VIEW)) {
              Navigator.pushNamed(
                  context, AppRoutes.getAddExpenditurePageRoute(),
                  arguments: _isExpenditureAdded);
            } else {
              showCustomSnackBar(
                  "You do not have permission to deactivate onboarding fee",
                  isError: true);
            }
          },
          backgroundColor: ColorResources.textBlue,
          child: Icon(Icons.add),
          tooltip: 'Add Recurrent Expenditure',
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
                    'Recurrent Expenditure',
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
                    isExpenditureFilter: true,
                  ),
                  const MeterListItemView(isRecurrentExpenditure: true),
                ],
              ),
            ),
            PagedSliverList<int, ReccurentExpenseData>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<ReccurentExpenseData>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isRecurrentExpenditure: true,
                ),
                itemBuilder: (context, reccurentExpenseData, index) =>
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
                                "${reccurentExpenseData.name.toString()}-${reccurentExpenseData.property}",
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                reccurentExpenseData.frequencyName.toString(),
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
                                "KES ${reccurentExpenseData.amount.toString()}",
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                reccurentExpenseData.status == 1
                                    ? 'Active'
                                    : 'Inactive',
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: reccurentExpenseData.status == 1
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
                                            .ROLE_EXPENDITURES_DELETE)) {
                                      showDialog(
                                        context: context,
                                        barrierDismissible: false,
                                        builder: (BuildContext context) {
                                          return CustomConfirmationDialog(
                                            title: "Delete Recurrent Expense",
                                            content:
                                                "Are you sure you want to delete this ${reccurentExpenseData.name}?",
                                            confirmText: "YES",
                                            cancelText: "NO",
                                            onConfirm: () {
                                              // Handle confirm action
                                              Navigator.pop(context);
                                              _deleteUserGroup(
                                                  reccurentExpenseData.id
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
                                            .ROLE_EXPENDITURES_EDIT)) {
                                      showDialog(
                                        context: context,
                                        barrierDismissible: false,
                                        builder: (BuildContext context) {
                                          return CustomConfirmationDialog(
                                            title:
                                                "Deactivate Recurrent Expense",
                                            content:
                                                "Are you sure you want to Deactivate this ${reccurentExpenseData.name}?",
                                            confirmText: "YES",
                                            cancelText: "NO",
                                            onConfirm: () {
                                              // Handle confirm action
                                              Navigator.pop(context);
                                              _deactivateUserGroup(
                                                  reccurentExpenseData.id
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
                                            .ROLE_EXPENDITURES_EDIT)) {
                                      showDialog(
                                        context: context,
                                        barrierDismissible: false,
                                        builder: (BuildContext context) {
                                          return CustomConfirmationDialog(
                                            title: "Activate Recurrent Expense",
                                            content:
                                                "Are you sure you want to Activate this ${reccurentExpenseData.name}?",
                                            confirmText: "YES",
                                            cancelText: "NO",
                                            onConfirm: () {
                                              // Handle confirm action
                                              Navigator.pop(context);
                                              _activateUserGroup(
                                                  reccurentExpenseData.id
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
                                  }
                                },
                                menuItems: [
                                  reccurentExpenseData.status == 1
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
