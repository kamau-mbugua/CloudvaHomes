import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';
import 'package:hodi_app/providers/authenticated_app_providers.dart';
import 'package:hodi_app/screens/home/meters_page.dart';
import 'package:hodi_app/screens/properties/houses/house_details_tabs/house_history_page.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_paid_page.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_unpaid_page.dart';
import 'package:hodi_app/utils/color_resources.dart';
import 'package:hodi_app/widgets/base/custom_divider.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../controller/pagination_controller.dart';
import '../../../models/data/getMetres/get_metres.dart';
import '../../../models/data/houses/added_house_features.dart';
import '../../../models/data/houses/house_details.dart';
import '../../../models/data/payments/payments.dart';
import '../../../models/data/tenants/tenants_data_class.dart';
import '../../../models/data/tenants_invoices/invoice_types.dart';
import '../../../models/data/tenants_invoices/tenants_invoices.dart';
import '../../../route/routes.dart';
import '../../../services/authority_service.dart';
import '../../../utils/authorities_constant.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';
import '../../../widgets/base/custom_snackbar.dart';
import '../../../widgets/base/no_data_screen.dart';

class HouseDetailsPage extends StatefulWidget {
  String houseId;
  HouseDetailsPage({Key? key, required this.houseId}) : super(key: key);

  @override
  _HouseDetailsPageState createState() => _HouseDetailsPageState();
}

class _HouseDetailsPageState extends State<HouseDetailsPage> {
  HouseDetails? houseDetails;
  List<AddedHouseFeaturesList>? addedHouseFeaturesList;
  late PaginationController<TenantInvoiceData> _paidInvoicesPaginationController;
  late PaginationController<TenantInvoiceData> _unpaidInvoicesPaginationController;
  late PaginationController<MetrePaymentContent> _metersPaginationController;

  Future<void> fetchHouseDetails() async {
    await Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .getHouseDetails(widget.houseId)
        .then((value) {
      if (value != null) {
        setState(() {
          houseDetails = value;
        });
      }
    });

    await Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .getHouseAddedFeatures(widget.houseId)
        .then((value) {
      if (value!.isNotEmpty) {
        setState(() {
          addedHouseFeaturesList = value;
        });
      }
    });
  }


  void fetchTabsData() async {
    _paidInvoicesPaginationController = PaginationController<TenantInvoiceData>(
      fetchItems: (page, pageSize) async {
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getTenantsInvoices(page, pageSize, InvoiceStatus.PAID, "", "", "", "", "", "", false, widget.houseId, "");
        return Provider.of<AuthenticatedAppProviders>(context, listen: false).tenantInvoiceData ?? [];
      },
    );

    _unpaidInvoicesPaginationController = PaginationController<TenantInvoiceData>(
      fetchItems: (page, pageSize) async {
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getTenantsInvoices(page, pageSize, InvoiceStatus.UNPAID, "", "", "", "", "", "", false, widget.houseId, "");
        return Provider.of<AuthenticatedAppProviders>(context, listen: false).tenantInvoiceData ?? [];
      },
    );

    _metersPaginationController =  PaginationController<MetrePaymentContent>(
      fetchItems: (page, pageSize) async {
        // Fetch tenants from your provider
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getMetres(
            page,
            pageSize,
            "",
            "",
                "",
            null,
            "",
            widget.houseId);
        return Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .meterPaymentResponse
            ?.content ??
            [];
      },
    );
  }

  @override
  void initState() {
    Future.microtask(() {
      fetchHouseDetails();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      fetchTabsData();
    });
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthenticatedAppProviders>(
      builder: (context, provider, child) {
        return Scaffold(
            backgroundColor: Colors.white,
            appBar: AppBar(
              title: Text(
                'House Details',
                style: poppinsBold.copyWith(
                  color: ColorResources.colorBlack,
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
            body: provider.isLoading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: () async {
                      await fetchHouseDetails();
                    },
                    child: SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      child: Padding(
                          padding: const EdgeInsets.all(8.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              DefaultTabController(
                                  length: 3,
                                  child: Column(
                                    children: [
                                      const TabBar(
                                        labelColor: ColorResources.textBlue,
                                        unselectedLabelColor:
                                        ColorResources.colorNero,
                                        indicatorColor: ColorResources.textBlue,
                                        tabs: [
                                          Tab(
                                            text: 'House Details',
                                          ),
                                          Tab(
                                            text: 'Occupancy',
                                          ),
                                          Tab(
                                            text: 'Features',
                                          ),
                                        ],
                                      ),
                                      Container(
                                        height: 200,
                                        child: TabBarView(
                                          children: [
                                            _showHouseDetails(),
                                            _showOccupancy(),
                                            _showFeatures(),

                                          ],
                                        ),
                                      ),
                                    ],
                                  )),
                              DefaultTabController(
                                  length: 4,
                                  child: Column(
                                    children: [
                                      const TabBar(
                                        labelColor: ColorResources.textBlue,
                                        unselectedLabelColor:
                                            ColorResources.colorNero,
                                        indicatorColor: ColorResources.textBlue,
                                        tabs: [
                                          Tab(
                                            text: 'Paid Inv',
                                          ),
                                          Tab(
                                            text: 'Un-Paid Inv',
                                          ),
                                          Tab(
                                            text: 'Metres',
                                          ),
                                          Tab(
                                            text: 'History',
                                          ),
                                        ],
                                      ),
                                      Container(
                                        height: MediaQuery.of(context).size.height * 1,
                                        child: TabBarView(
                                          children: [
                                            _tenantsInvoicesPaid(),
                                            _tenantsInvoicesUnpaid(),
                                            _houseMeters(),
                                            HouseHistoryPage(houseId: widget.houseId),
                                          ],
                                        ),
                                      ),
                                    ],
                                  )),
                            ],
                          )),
                    ),
                  ));
      },
    );
  }



  Widget _tenantsInvoicesUnpaid(){
    return Container(
      padding: const EdgeInsets.all(8),
      child: CustomScrollView(
        slivers: [
          PagedSliverList<int, TenantInvoiceData>(
            pagingController: _unpaidInvoicesPaginationController.pagingController,
            builderDelegate: PagedChildBuilderDelegate<TenantInvoiceData>(
              noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                isPaidInvoices: true,
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
    );
  }
  Widget _tenantsInvoicesPaid(){
    return Container(
      padding: const EdgeInsets.all(8),
      child: CustomScrollView(
        slivers: [
          PagedSliverList<int, TenantInvoiceData>(
            pagingController: _paidInvoicesPaginationController.pagingController,
            builderDelegate: PagedChildBuilderDelegate<TenantInvoiceData>(
              noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                isPaidInvoices: true,
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
    );
  }

  Widget _houseMeters(){
    return Container(
      padding: const EdgeInsets.all(8),
      child: CustomScrollView(
        slivers: [
          PagedSliverList<int, MetrePaymentContent>(
            pagingController: _metersPaginationController.pagingController,
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
                            // _onMeterItemClick(
                            //     metrePaymentContent.id,
                            //     metrePaymentContent.houseName,
                            //     metrePaymentContent.metreNo,
                            //     metrePaymentContent);
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
          )
        ],
      ),
    );
  }

  Widget _showFeatures(){
    return   addedHouseFeaturesList == null || addedHouseFeaturesList!.isEmpty
        ? Center(
      child: Text(
        "No features added",
        style: poppinsRegular.copyWith(
          color: ColorResources.colorNero,
          fontSize: Dimensions.fontSizeDefault,
        ),
      ),
    )
        : ListView.builder(
      itemCount: addedHouseFeaturesList!.length,
      shrinkWrap: true,
      physics:
      const NeverScrollableScrollPhysics(),
      itemBuilder: (context, index) {
        return Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: ColorResources.graphLightBlue,
            borderRadius:
            BorderRadius.circular(10),
            boxShadow: [
              BoxShadow(
                color:
                Colors.grey.withOpacity(0.1),
                spreadRadius: 0,
                blurRadius: 7,
                offset: const Offset(0,
                    3), // changes position of shadow
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment:
            MainAxisAlignment.start,
            children: [
              Text(
                "${index+1}. ${addedHouseFeaturesList![index].name}",
                style: poppinsRegular.copyWith(
                  color:
                  ColorResources.colorBlack,
                  fontSize:
                  Dimensions.fontSizeDefault,
                ),
              ),
            ],
          ),
        ).paddingBottom(5);
      },
    );
  }

  Widget _showOccupancy(){
    return !houseDetails!.tenant.name.isEmptyOrNull ?
    Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: ColorResources.graphLightBlue,
        borderRadius: BorderRadius.circular(10),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            spreadRadius: 0,
            blurRadius: 7,
            offset: const Offset(
                0, 3), // changes position of shadow
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment:
        MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment:
            CrossAxisAlignment.start,
            children: [
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: "Tenant. \n",
                      style: poppinsRegular.copyWith(
                        color:
                        ColorResources.colorBlack,
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                    TextSpan(
                      text: houseDetails?.tenant.phone,
                      style: poppinsRegular.copyWith(
                        color: ColorResources.textBlue,
                        // Change this to your desired color
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                  ],
                ),
              ),
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: "Mobile Number. \n",
                      style: poppinsRegular.copyWith(
                        color:
                        ColorResources.colorBlack,
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                    TextSpan(
                      text: houseDetails?.tenant.phone,
                      style: poppinsRegular.copyWith(
                        color: ColorResources.textBlue,
                        // Change this to your desired color
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                  ],
                ),
              ),
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: "Occupied On. \n",
                      style: poppinsRegular.copyWith(
                        color:
                        ColorResources.colorBlack,
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                    TextSpan(
                      text: houseDetails?.tenant.occupiedOn
                          .toString(),
                      style: poppinsRegular.copyWith(
                        color: ColorResources.textBlue,
                        // Change this to your desired color
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          Column(
            crossAxisAlignment:
            CrossAxisAlignment.start,
            children: [
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: "Invoice Month \n",
                      style: poppinsRegular.copyWith(
                        color:
                        ColorResources.colorBlack,
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                    TextSpan(
                      text: houseDetails?.tenant.invoiceMonth,
                      style: poppinsRegular.copyWith(
                        color: ColorResources.textBlue,
                        // Change this to your desired color
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                  ],
                ),
              ),
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: "Arrears \n",
                      style: poppinsRegular.copyWith(
                        color:
                        ColorResources.colorBlack,
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                    TextSpan(
                      text: "KES ${houseDetails?.tenant.rentOwed.toString()}",
                      style: poppinsRegular.copyWith(
                        color: ColorResources.textBlue,
                        // Change this to your desired color
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                  ],
                ),
              ),
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: "Max Refundable \n",
                      style: poppinsRegular.copyWith(
                        color:
                        ColorResources.colorBlack,
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                    TextSpan(
                      text: "KES ${houseDetails?.tenant.refundableAmount.toString()}",
                      style: poppinsRegular.copyWith(
                        color: ColorResources.textBlue,
                        // Change this to your desired color
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          )
        ],
      ),
    ) : Container(
      child: Center(
        child: Text(
          "House is not occupied",
          style: poppinsRegular.copyWith(
            color: ColorResources.colorNero,
            fontSize: Dimensions.fontSizeDefault,
          ),
        ),

      ),
    );
  }

  Widget _showHouseDetails(){
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: ColorResources.graphLightBlue,
        borderRadius: BorderRadius.circular(10),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            spreadRadius: 0,
            blurRadius: 7,
            offset: const Offset(
                0, 3), // changes position of shadow
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment:
        MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment:
            CrossAxisAlignment.start,
            children: [
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: "House No. \n",
                      style: poppinsRegular.copyWith(
                        color:
                        ColorResources.colorBlack,
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                    TextSpan(
                      text: houseDetails?.houseNumber,
                      style: poppinsRegular.copyWith(
                        color: ColorResources.textBlue,
                        // Change this to your desired color
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                  ],
                ),
              ),
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: "House Property. \n",
                      style: poppinsRegular.copyWith(
                        color:
                        ColorResources.colorBlack,
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                    TextSpan(
                      text: houseDetails?.property,
                      style: poppinsRegular.copyWith(
                        color: ColorResources.textBlue,
                        // Change this to your desired color
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                  ],
                ),
              ),
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: "House Sqr-ft. \n",
                      style: poppinsRegular.copyWith(
                        color:
                        ColorResources.colorBlack,
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                    TextSpan(
                      text: houseDetails?.squareFt
                          .toString(),
                      style: poppinsRegular.copyWith(
                        color: ColorResources.textBlue,
                        // Change this to your desired color
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          Column(
            crossAxisAlignment:
            CrossAxisAlignment.start,
            children: [
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: "House Category \n",
                      style: poppinsRegular.copyWith(
                        color:
                        ColorResources.colorBlack,
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                    TextSpan(
                      text: houseDetails?.category,
                      style: poppinsRegular.copyWith(
                        color: ColorResources.textBlue,
                        // Change this to your desired color
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                  ],
                ),
              ),
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: "House Location \n",
                      style: poppinsRegular.copyWith(
                        color:
                        ColorResources.colorBlack,
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                    TextSpan(
                      text: houseDetails?.location,
                      style: poppinsRegular.copyWith(
                        color: ColorResources.textBlue,
                        // Change this to your desired color
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                  ],
                ),
              ),
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: "House Rent \n",
                      style: poppinsRegular.copyWith(
                        color:
                        ColorResources.colorBlack,
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                    TextSpan(
                      text: "KES ${houseDetails?.rent}",
                      style: poppinsRegular.copyWith(
                        color: ColorResources.textBlue,
                        // Change this to your desired color
                        fontSize:
                        Dimensions.fontSizeDefault,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          )
        ],
      ),
    );
  }
}
