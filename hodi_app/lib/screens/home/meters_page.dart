import 'package:flutter/material.dart';
import 'package:flutter_speed_dial/flutter_speed_dial.dart';
import 'package:hodi_app/utils/color_resources.dart';
import 'package:hodi_app/utils/dimensions.dart';
import 'package:hodi_app/utils/styles.dart';
import 'package:hodi_app/viewmodel/meter_added_view_model.dart';
import 'package:hodi_app/widgets/base/custom_snackbar.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../controller/pagination_controller.dart';
import '../../logger.dart';
import '../../models/data/getMetres/get_metres.dart';
import '../../providers/authenticated_app_providers.dart';
import '../../route/routes.dart';
import '../../services/authority_service.dart';
import '../../utils/authorities_constant.dart';
import '../../utils/helpers.dart';
import '../../widgets/base/no_data_screen.dart';
import '../../widgets/meter_list_item_view.dart';
import '../properties/meter/meter_filter.dart';

class MetersPage extends StatefulWidget {
  final ValueNotifier<String>? propertyIdNotifier;
  final bool isAppBar;
  final String houseId;
  const MetersPage(
      {super.key,
      this.propertyIdNotifier = null,
      this.isAppBar = false,
      this.houseId = ""});

  @override
  _MetersPageState createState() => _MetersPageState();
}

class _MetersPageState extends State<MetersPage> {
  late PaginationController<MetrePaymentContent> _paginationController;

  String _searchTerm = "";
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();

  MyHelpers helpers = MyHelpers();
  String firstDate = '';
  String lastDate = '';

  String? _selectedUtilityBillIndex;
  bool? _isMeterRead;

  @override
  void initState() {
    firstDate = helpers.getCurrentMonthDates()['firstDate']!;
    lastDate = helpers.getCurrentMonthDates()['lastDate']!;

    _paginationController = PaginationController<MetrePaymentContent>(
      fetchItems: (page, pageSize) async {
        // Fetch tenants from your provider
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getMetres(
                page,
                pageSize,
                widget.propertyIdNotifier?.value ?? "",
                "",
                _selectedUtilityBillIndex ?? "",
                _isMeterRead,
                _searchTerm,
                widget.houseId);
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
                .meterPaymentResponse
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

    super.initState();
  }

  @override
  void dispose() {
    widget.propertyIdNotifier?.removeListener(_paginationController.refresh);
    _paginationController.dispose();
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  void _onMeterAdded(bool isAdded) {
    if (isAdded) {
      _paginationController.refresh();
    }
  }

  void _onFilter(String selectedUtilityBillIndex, bool? isMeterRead) {
    logger.d(
        "_onFilter: Selected Utility Bill Index is ${selectedUtilityBillIndex} and isMeterRead is ${isMeterRead}");
    _selectedUtilityBillIndex = selectedUtilityBillIndex;
    _isMeterRead = isMeterRead;
    _paginationController.refresh();
  }

  void _onMeterItemClick(String metreId, String houseName, String metreNo,
      MetrePaymentContent metrePaymentContent) {
    logger.d(
        "_onMeterItemClick: Item clicked and data is ${metreId} ${houseName} ${metreNo}");

    Navigator.pushNamed(
      context,
      AppRoutes.getEditMeterRoute(),
      arguments: {
        'metreId': metreId,
        'houseName': houseName,
        'metreNo': metreNo,
        'metrePaymentContent': metrePaymentContent,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<MeterAddedViewModel>(
      builder: (context, meterAddedViewModel, child) {
        if (meterAddedViewModel.meterAdded) {
          _paginationController.refresh();
          meterAddedViewModel.resetMeterAddedStatus();
        }
        return Scaffold(
          appBar: widget.isAppBar
              ? AppBar(
            title: Text(
              'Meters',
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
          floatingActionButton: SpeedDial(
            backgroundColor: ColorResources.textBlue,
            icon: Icons.add,
            activeIcon: Icons.close,
            children: [
              SpeedDialChild(
                child: const Icon(Icons.add_circle),
                label: 'Add Meter',
                onTap: () {
                  if (AuthorityService()
                      .hasAuthority(AuthoritiesConstants.ROLE_METRES_NEW)) {
                    Navigator.pushNamed(
                      context,
                      AppRoutes.getAddMeterRoute(),
                      arguments: {'isMeterAdded': _onMeterAdded},
                    );
                  } else {
                    showCustomSnackBar("You do not have permission to add meter");
                  }
                },
              ),
            ],
          ),
        );
      },
    );

  }

  _buildMeters() {
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
                  widget.houseId.isEmptyOrNull
                      ? Text(
                          'Meters',
                          style: poppinsBold.copyWith(
                            fontSize: Dimensions.fontSizeLarge,
                            color: ColorResources.colorNero,
                          ),
                        )
                      : Container(),
                  widget.houseId.isEmptyOrNull
                      ? Row(
                          children: [
                            16.width,
                            TextField(
                              controller: _searchController,
                              focusNode: _searchFocusNode,
                              decoration: InputDecoration(
                                filled: true,
                                fillColor: context.cardColor,
                                hintText: "Search",
                                hintStyle: primaryTextStyle(
                                    color: Colors.grey.shade400),
                                constraints: BoxConstraints(
                                    maxWidth:
                                        MediaQuery.of(context).size.width -
                                            145),
                                prefixIcon: Icon(
                                  Icons.search_rounded,
                                  color: Colors.grey.shade400,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(15),
                                  borderSide: BorderSide.none,
                                ),
                              ),
                            ),
                            16.width,
                            GestureDetector(
                              onTap: () {
                                showMeterFiltersBottomSheet(
                                  context,
                                  widget.propertyIdNotifier?.value ?? "",
                                  _onFilter,
                                );
                              },
                              child: Container(
                                height: 60,
                                width: 60,
                                margin: EdgeInsets.only(top: 16, bottom: 16),
                                decoration: BoxDecoration(
                                  color: context.cardColor,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child:
                                    Icon(Icons.filter_list, color: Colors.blue),
                              ),
                            ),
                            16.width,
                          ],
                        )
                      : Container(),
                  const MeterListItemView(isHeader: true),
                ],
              ),
            ),
            PagedSliverList<int, MetrePaymentContent>(
              pagingController: _paginationController.pagingController,
              builderDelegate: PagedChildBuilderDelegate<MetrePaymentContent>(
                noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                  isFooter: false,
                  isMeterTransaction: true,
                ),
                itemBuilder: (context, metrePaymentContent, index) =>
                    GestureDetector(
                  onTap: () {
                    setState(() {
                      if (metrePaymentContent.updatable) {
                        if (AuthorityService().hasAuthority(
                            AuthoritiesConstants.ROLE_METRES_EDIT)) {
                          _onMeterItemClick(
                              metrePaymentContent.id,
                              metrePaymentContent.houseName,
                              metrePaymentContent.metreNo,
                              metrePaymentContent);
                        } else {
                          showCustomSnackBar(
                              "You do not have permission to edit meter");
                        }
                      } else {
                        showCustomSnackBar(
                            "Meter reading already submitted for this month");
                      }
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
                                metrePaymentContent.metreNo,
                                textAlign: TextAlign.start,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                metrePaymentContent.houseName.toString(),
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
                                metrePaymentContent.currentReading.toString(),
                                textAlign: TextAlign.end,
                                style: poppinsRegular.copyWith(
                                  fontSize: Dimensions.fontSizeSmall,
                                  color: Colors.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(metrePaymentContent.consumedUnits.toString(),
                                  textAlign: TextAlign.end,
                                  style: poppinsRegular.copyWith(
                                    fontSize: Dimensions.fontSizeSmall,
                                    color: Colors.black,
                                    fontWeight: FontWeight.normal,
                                  )),
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

void showMeterFiltersBottomSheet(
    BuildContext context, String propertyId, Function(String, bool?) onFilter) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (context) {
      return MeterFiltersPage(propertyId: propertyId, onFilter: onFilter);
    },
  );
}
