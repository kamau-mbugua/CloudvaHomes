import 'package:flutter/material.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../controller/pagination_controller.dart';
import '../../../models/data/user_group/user_groups_response.dart';
import '../../../providers/authenticated_app_providers.dart';
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

class ListUserGroupsPage extends StatefulWidget {
  @override
  _ListUserGroupsPageState createState() => _ListUserGroupsPageState();
}

class _ListUserGroupsPageState extends State<ListUserGroupsPage> {
  late PaginationController<UserGroup> _paginationController;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchTerm = "";


  @override
  void initState() {
    super.initState();
    _paginationController = PaginationController<UserGroup>(
      fetchItems: (page, pageSize) async {
        // Fetch user groups from your provider
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getUserGroups(page, pageSize, _searchTerm);
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
                .userGroupData ??
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
        .deleteUserGroup(id)
        .then((value) {
      if (value.isSuccess) {
        showCustomSnackBar(value.message,isError:false);
        _paginationController.refresh();
      } else {
        showCustomSnackBar(value.message,);
      }
    });
  }

  void _deactivateUserGroup(String id) {
    Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .deactivateUserGroup(id)
        .then((value) {
      if (value.isSuccess) {
        showCustomSnackBar(value.message,isError:false);
        _paginationController.refresh();
      } else {
        showCustomSnackBar(value.message,);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'User Groups',
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
        visible: false,
        child: FloatingActionButton(
          onPressed: () {},
          backgroundColor: ColorResources.textBlue,
          child: Icon(Icons.add),
          tooltip: 'Add User Group',
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
                    'User Groups',
                    style: poppinsBold.copyWith(
                      fontSize: Dimensions.fontSizeLarge,
                      color: ColorResources.colorNero,
                    ),
                  ),
                  TextField(
                    controller: _searchController,
                    focusNode: _searchFocusNode,
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: context.cardColor,
                      hintText: "Search",
                      hintStyle: primaryTextStyle(color: Colors.grey.shade400),
                      prefixIcon: Icon(
                        Icons.search_rounded,
                        color: Colors.grey.shade400,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(15),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ).paddingOnly(bottom: 5, top: 10),
                  const MeterListItemView(isUserGroupsHeader: true),
                ],
              ),
            ),
            PagedSliverList<int, UserGroup>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<UserGroup>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isUserGroupsHeader: true,
                ),
                itemBuilder: (context, userGroup, index) => GestureDetector(
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
                                userGroup.name.toString(),
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                userGroup.userType.toString(),
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
                                userGroup.estate.toString(),
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                userGroup.flag,
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: userGroup.status == 1
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

                              if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_USER_GROUPS_DELETE) || AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_USER_GROUPS_EDIT)) ...[
                              CustomPopupMenu(
                                key: GlobalKey(),
                                onSelected: (value) {
                                  if (value == 'delete') {
                                    showDialog(
                                      context: context,
                                      barrierDismissible: false,
                                      builder: (BuildContext context) {
                                        return CustomConfirmationDialog(
                                          title: "Delete User Group",
                                          content:
                                              "Are you sure you want to delete this user group?",
                                          confirmText: "YES",
                                          cancelText: "NO",
                                          onConfirm: () {
                                            // Handle confirm action
                                            Navigator.pop(context);
                                            _deleteUserGroup(userGroup.id.toString());
                                          },
                                          onCancel: () {
                                            // Handle cancel action
                                            Navigator.pop(context);
                                          },
                                        );
                                      },
                                    );
                                  }
                                  else if (value == 'deactivate') {
                                    showDialog(
                                      context: context,
                                      barrierDismissible: false,
                                      builder: (BuildContext context) {
                                        return CustomConfirmationDialog(
                                          title: "Deactivate User Group",
                                          content:
                                              "Are you sure you want to Deactivate this user group?",
                                          confirmText: "YES",
                                          cancelText: "NO",
                                          onConfirm: () {
                                            // Handle confirm action
                                            Navigator.pop(context);
                                            _deactivateUserGroup(userGroup.id.toString());
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
                                  if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_USER_GROUPS_DELETE)) PopupMenuItem(
                                    value: 'deactivate',
                                    child: Text('Deactivate'),
                                  ),
                                  if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_USER_GROUPS_EDIT)) PopupMenuItem(
                                    value: 'delete',
                                    child: Text('Delete'),
                                  ),
                                ],
                              ),
              ],
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
