import 'package:flutter/material.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:provider/provider.dart';

import '../../../controller/pagination_controller.dart';
import '../../../logger.dart';
import '../../../models/data/expenses/expense_list_response.dart';
import '../../../providers/authenticated_app_providers.dart';
import '../../../route/routes.dart';
import '../../../services/authority_service.dart';
import '../../../utils/authorities_constant.dart';
import '../../../utils/color_resources.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/helpers.dart';
import '../../../utils/styles.dart';
import '../../../widgets/base/custom_snackbar.dart';
import '../../../widgets/base/no_data_screen.dart';
import '../../../widgets/custom_confirmation_dialog.dart';
import '../../../widgets/custom_popup_menu.dart';
import '../../../widgets/meter_list_item_view.dart';
import '../../../widgets/search_filter_row.dart';

class ExpensesListPage extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;
  final isShowToolbar;

  const ExpensesListPage(
      {super.key, required this.propertyIdNotifier, this.isShowToolbar = true});

  @override
  _ExpensesListPageState createState() => _ExpensesListPageState();
}

class _ExpensesListPageState extends State<ExpensesListPage> {
  late PaginationController<ExpenseListData> _paginationController;
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

    _paginationController = PaginationController<ExpenseListData>(
      fetchItems: (page, pageSize) async {
        // Fetch user groups from your provider
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getExpenseList(page, pageSize, _searchTerm,
                widget.propertyIdNotifier.value, "", firstDate, lastDate);
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
                .expenseListData ??
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

  void _isExpenseAdded(bool isAdded) {
    if (isAdded) {
      _paginationController.refresh();
    }
  }

  void _deleteUserGroup(String id) {
    Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .updateExpenseStatus(id)
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
      appBar: widget.isShowToolbar
          ? AppBar(
              title: Text(
                'Expenses',
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
                .hasAuthority(AuthoritiesConstants.ROLE_EXPENSES_NEW)) {
              Navigator.pushNamed(context, AppRoutes.getAddExpensePageRoute(),
                  arguments: _isExpenseAdded);
            } else {
              showCustomSnackBar(
                "You do not have permission to add expense",
              );
            }
          },
          backgroundColor: ColorResources.textBlue,
          child: Icon(Icons.add),
          tooltip: 'Add Expense',
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
                    'Expenses',
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
                    isExpenseFilter: true,
                  ),
                  const MeterListItemView(isExpensesList: true),
                ],
              ),
            ),
            PagedSliverList<int, ExpenseListData>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<ExpenseListData>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isExpensesList: true,
                ),
                itemBuilder: (context, expenseListData, index) =>
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
                                expenseListData.name.toString(),
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                "KES ${expenseListData.amount.toString()}",
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
                                expenseListData.recurrentName.toString(),
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: expenseListData.recurrentName == 'Yes'
                                      ? Colors.green
                                      : expenseListData.recurrentName == 'No'
                                          ? Colors.red
                                          : Colors.orange,
                                  fontWeight: FontWeight.normal,
                                ),
                              ),
                              Text(
                                expenseListData.updatedOn.toString(),
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
                        expenseListData.recurrent == false &&
                                expenseListData.status == 1
                            ? Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    //menu icon
                                    CustomPopupMenu(
                                      key: GlobalKey(),
                                      onSelected: (value) {
                                        if (AuthorityService().hasAuthority(
                                            AuthoritiesConstants
                                                .ROLE_EXPENSES_DELETE)) {
                                          if (value == 'delete') {
                                            showDialog(
                                              context: context,
                                              barrierDismissible: false,
                                              builder: (BuildContext context) {
                                                return CustomConfirmationDialog(
                                                  title: "Delete Expense",
                                                  content:
                                                      "Are you sure you want to delete this ${expenseListData.name}?",
                                                  confirmText: "YES",
                                                  cancelText: "NO",
                                                  onConfirm: () {
                                                    // Handle confirm action
                                                    Navigator.pop(context);
                                                    _deleteUserGroup(
                                                        expenseListData.id
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
                                        const PopupMenuItem(
                                          value: 'delete',
                                          child: Text('Delete'),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              )
                            : Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      "N/A",
                                      textAlign: TextAlign.center,
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
