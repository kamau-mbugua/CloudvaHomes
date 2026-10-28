import 'package:flutter/material.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../controller/pagination_controller.dart';
import '../../logger.dart';
import '../../models/data/tenants/tenants_data_class.dart';
import '../../providers/authenticated_app_providers.dart';
import '../../route/routes.dart';
import '../../services/authority_service.dart';
import '../../utils/authorities_constant.dart';
import '../../utils/color_resources.dart';
import '../../utils/dimensions.dart';
import '../../utils/styles.dart';
import '../../widgets/base/no_data_screen.dart';
import '../../widgets/meter_list_item_view.dart';
import '../../widgets/search_filter_row.dart';

class TenantsPage extends StatefulWidget {
  final ValueNotifier<String>? propertyIdNotifier;
  final bool isAppBar;
  final bool self;
  String tenantId;
  final bool isMyHouses;
  TenantsPage(
      {super.key,
      this.propertyIdNotifier,
      this.isAppBar = false,
      this.self = false,
        this.tenantId = "",
        this.isMyHouses = false
      });

  @override
  _TenantsPageState createState() => _TenantsPageState();
}

class _TenantsPageState extends State<TenantsPage> {
  late PaginationController<Tenant> _paginationController;
  String _searchTerm = "";
  String _categoryId = "";
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  @override
  void initState() {
    super.initState();
    _paginationController = PaginationController<Tenant>(
      fetchItems: (page, pageSize) async {
        // Fetch tenants from your provider
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getTenants(page, pageSize, widget.propertyIdNotifier?.value ?? "", "", _categoryId,
                widget.self, _searchTerm, widget.tenantId ?? "");
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
                .tenantData
                ?.content ??
            [];
      },
    );
    widget.propertyIdNotifier?.addListener(_paginationController.refresh);
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
    widget.propertyIdNotifier?.removeListener(_paginationController.refresh);
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
    });
    _paginationController.refresh();
    logger.d(
        ">>>>>>>>>onFilter<<<<<<<<<< selectedPropertyMonthNo: $selectedPropertyMonthNo, selectedYear: $selectedYear, selectedPropertyId: $selectedPropertyId, selectedPropertyCategoryId: $selectedPropertyCategoryId, fromDate: $fromDate, toDate: $toDate selectedUsedStatus: $selectedUsedStatus, selectedPaymentType: $selectedPaymentType");
  }

  void _isTenantAdded(bool isAdded) {
    if (isAdded) {
      _paginationController.refresh();
    }
  }


  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.isAppBar
          ? AppBar(
              title: Text(
                widget.self ? 'My Houses' : 'Tenants',
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
      body: _buildMeters(),
      floatingActionButton: Visibility(
        visible: (AuthorityService().hasAuthority(
          AuthoritiesConstants
              .ROLE_TENANT_ACCESS_NEW)),
        child: FloatingActionButton(
          onPressed: () {
            Navigator.pushNamed(context, AppRoutes.getAddTenantPageRoute(),
                arguments: _isTenantAdded);
          },
          backgroundColor: ColorResources.textBlue,
          child: const Icon(Icons.add),
          tooltip: 'Add A New Tenant',
          elevation: 5,
        ),
      ),
    );
  }

  Widget _buildMeters() {
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
                  Text(
                    widget.self ? 'My Houses' : 'Tenants',
                    style: poppinsBold.copyWith(
                      fontSize: Dimensions.fontSizeLarge,
                      color: ColorResources.colorNero,
                    ),
                  ) : Container(),
                  widget.tenantId.isEmptyOrNull?
                  SearchFilterRow(
                    searchController: _searchController,
                    searchFocusNode: _searchFocusNode,
                    onFilter: _onFilter,
                    propertyIdNotifier: widget.propertyIdNotifier,
                    isTenantsFilter: true,
                  ) : Container(),
                  widget.self
                      ? const MeterListItemView(isMyHousesHeader: true)
                      : const MeterListItemView(isTenantsHeader: true),
                ],
              ),
            ),
            PagedSliverList<int, Tenant>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<Tenant>(
                noItemsFoundIndicatorBuilder: (context) => widget.self
                    ? NoDataScreen(
                        isTenantsSelf: true,
                      )
                    : NoDataScreen(
                        isTenants: true,
                      ),
                itemBuilder: (context, tenant, index) => GestureDetector(
                  onTap: () {
                    setState(() {

                      !widget.isMyHouses ?
                      Navigator.pushNamed(
                        context,
                        AppRoutes.getTenantsDetailPageRoute(),
                        arguments: {
                          'tenantId': tenant.userId.toString(),
                        },
                      ) :  Navigator.pushNamed(
                        context,
                        AppRoutes.getHousesDetailPageRoute(),
                        arguments: {
                          'houseId': tenant.id.toString(),
                        },
                      ) /*null*/;
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
                                tenant.tenantName,
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                tenant.houseName.toString(),
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
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                tenant.property,
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                tenant.category.toString(),
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
                                "KES ${tenant.rent.toString()}",
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                "KES ${tenant.rentOwed.toString()}",
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
                  ).paddingBottom(5),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
