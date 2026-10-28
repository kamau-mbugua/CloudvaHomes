import 'package:flutter/material.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../../controller/pagination_controller.dart';
import '../../../../logger.dart';
import '../../../../models/data/getHouses/house_data.dart';
import '../../../../providers/authenticated_app_providers.dart';
import '../../../../route/routes.dart';
import '../../../../utils/color_resources.dart';
import '../../../../utils/dimensions.dart';
import '../../../../utils/styles.dart';
import '../../../../widgets/base/no_data_screen.dart';
import '../../../../widgets/meter_list_item_view.dart';
import '../../../../widgets/search_filter_row.dart';
import '../../../filter_page/filter_page.dart';


class UnoccupiedHousesPage extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;
  final bool isAppBar;
  const UnoccupiedHousesPage(
      {super.key, required this.propertyIdNotifier, this.isAppBar = false});

  @override
  _UnoccupiedHousesPageState createState() => _UnoccupiedHousesPageState();
}

class _UnoccupiedHousesPageState extends State<UnoccupiedHousesPage> {
  late PaginationController<House> _paginationController;

  String _searchTerm = "";
  String _categoryId = "";
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();

  void _isHouseAdded(bool isAdded) {
    if (isAdded) {
      _paginationController.refresh();
    }
  }

  @override
  void initState() {
    super.initState();
    logger.e(
        ">>>>>>>>>UnoccupiedHousesPage<<<<<<<<<< and propertyIdNotifier: ${widget.propertyIdNotifier.value}");
    _paginationController = PaginationController<House>(
      fetchItems: (page, pageSize) async {
        // Fetch houses from your provider
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getHouses(page, pageSize, "", widget.propertyIdNotifier.value, _categoryId,
            _searchTerm, "0");
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .house;
      },
    );
    widget.propertyIdNotifier.addListener(_paginationController.refresh);
    Future.microtask(() => _paginationController.refresh());

    _searchFocusNode.addListener(() {
      if (!_searchFocusNode.hasFocus) {
        _searchTerm = _searchController.text;
        _paginationController.refresh();
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
      _categoryId = selectedPropertyCategoryId;
    });
    _paginationController.refresh();
    logger.d(
        ">>>>>>>>>onFilter<<<<<<<<<< selectedPropertyMonthNo: $selectedPropertyMonthNo, selectedYear: $selectedYear, selectedPropertyId: $selectedPropertyId, selectedPropertyCategoryId: $selectedPropertyCategoryId, fromDate: $fromDate, toDate: $toDate selectedUsedStatus: $selectedUsedStatus, selectedPaymentType: $selectedPaymentType");
  }

  @override
  void dispose() {
    widget.propertyIdNotifier.removeListener(_paginationController.refresh);
    _paginationController.dispose();
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.isAppBar
          ? AppBar(
        title: Text(
          'Houses',
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
        visible: true,
        child: FloatingActionButton(
          onPressed: () {
            Navigator.pushNamed(context, AppRoutes.getAddHousePageRoute(),
                arguments: _isHouseAdded);
          },
          backgroundColor: ColorResources.textBlue,
          child: Icon(Icons.add),
          tooltip: 'Add New House',
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
                  SearchFilterRow(
                    searchController: _searchController,
                    searchFocusNode: _searchFocusNode,
                    onFilter: _onFilter,
                    propertyIdNotifier: widget.propertyIdNotifier,
                    isHousesFilter: true,
                  ),
                  const MeterListItemView(isHousesHeader: true),
                ],
              ),
            ),
            PagedSliverList<int, House>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<House>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isHouses: true,
                ),
                itemBuilder: (context, house, index) => GestureDetector(
                  onTap: () {
                    setState(() {
                      Navigator.pushNamed(
                        context,
                        AppRoutes.getHousesDetailPageRoute(),
                        arguments: {
                          'houseId': house.id.toString(),
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
                                house.houseName,
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                house.property.toString(),
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
                                house.category.toString(),
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                "KES ${house.rent.toString()}",
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
