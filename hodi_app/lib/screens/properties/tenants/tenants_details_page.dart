import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';
import 'package:hodi_app/providers/authenticated_app_providers.dart';
import 'package:hodi_app/screens/home/meters_page.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_paid_page.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_unpaid_page.dart';
import 'package:hodi_app/screens/properties/houses/house_details_tabs/house_history_page.dart';
import 'package:hodi_app/utils/color_resources.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../controller/pagination_controller.dart';
import '../../../models/data/houses/added_house_features.dart';
import '../../../models/data/payments/payments.dart';
import '../../../models/data/tenants/tenants_data_class.dart';
import '../../../models/data/tenants/tenants_details.dart';
import '../../../models/data/tenants_invoices/invoice_types.dart';
import '../../../models/data/tenants_invoices/tenants_invoices.dart';
import '../../../route/routes.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/helpers.dart';
import '../../../utils/images.dart';
import '../../../utils/styles.dart';
import '../../../widgets/base/no_data_screen.dart';
import '../../../widgets/dashboard_summary_view.dart';
import '../../../widgets/summary_card.dart';
import '../../home/tenants_page.dart';
import '../../transactions/transactions_page.dart';

class TenantsDetailsPage extends StatefulWidget {
  String tenantId;
  TenantsDetailsPage({Key? key, required this.tenantId}) : super(key: key);

  @override
  _TenantsDetailsPageState createState() => _TenantsDetailsPageState();
}

class _TenantsDetailsPageState extends State<TenantsDetailsPage> with SingleTickerProviderStateMixin {
  TenantsDetailsData? tenantsDetails;
  late PaginationController<Tenant> _tenantPaginationController;
  late PaginationController<TenantInvoiceData> _paidInvoicesPaginationController;
  late PaginationController<TenantInvoiceData> _unpaidInvoicesPaginationController;
  late PaginationController<Payment> _paymentPaginationController;
  final height = 120.0;
  TabController? _tabController;

  String firstDate = '';
  String lastDate = '';
  MyHelpers helpers = MyHelpers();

  Future<void> fetchTenantsDetails() async {
    await Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .getTenantsDetails(widget.tenantId)
        .then((value) {
      if (value != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            setState(() {
              tenantsDetails = value;
            });
          }
        });
      }
    });

    // await Provider.of<AuthenticatedAppProviders>(context, listen: false)
    //     .getHouseAddedFeatures(widget.tenantId)
    //     .then((value) {
    //   if (value!.isNotEmpty) {
    //     setState(() {
    //       addedHouseFeaturesList = value;
    //     });
    //   }
    // });
  }

  void fetchTabsData() async {
    _tenantPaginationController = PaginationController<Tenant>(
      fetchItems: (page, pageSize) async {
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getTenants(page, pageSize, "", "", "", false, "", widget.tenantId ?? "");
        return Provider.of<AuthenticatedAppProviders>(context, listen: false).tenantData?.content ?? [];
      },
    );

    _paidInvoicesPaginationController = PaginationController<TenantInvoiceData>(
      fetchItems: (page, pageSize) async {
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getTenantsInvoices(page, pageSize, InvoiceStatus.PAID, "", "", "", "", "", "", false, "", widget.tenantId);
        return Provider.of<AuthenticatedAppProviders>(context, listen: false).tenantInvoiceData ?? [];
      },
    );

    _unpaidInvoicesPaginationController = PaginationController<TenantInvoiceData>(
      fetchItems: (page, pageSize) async {
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getTenantsInvoices(page, pageSize, InvoiceStatus.UNPAID, "", "", "", "", "", "", false, "", widget.tenantId);
        return Provider.of<AuthenticatedAppProviders>(context, listen: false).tenantInvoiceData ?? [];
      },
    );

    _paymentPaginationController = PaginationController<Payment>(
      fetchItems: (page, pageSize) async {
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getPaymentsData(0, 10, "", "", firstDate, lastDate, false, "", widget.tenantId ?? "");
        return Provider.of<AuthenticatedAppProviders>(context, listen: false).paymentResponse?.content ?? [];
      },
    );
  }

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      fetchTenantsDetails();
    });

    firstDate = helpers.getThreeMonthsAgoDates()['firstDate']!;
    lastDate = helpers.getThreeMonthsAgoDates()['lastDate']!;


    WidgetsBinding.instance.addPostFrameCallback((_) {
      fetchTabsData();
    });



    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthenticatedAppProviders>(
      builder: (context, provider, child) {
        return Scaffold(
            backgroundColor: Colors.white,
            appBar: AppBar(
              title: Text(
                'Tenants Details',
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
                      await fetchTenantsDetails();
                    },
                    child: SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      child: Padding(
                          padding: const EdgeInsets.all(8.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              DefaultTabController(
                                  length: 2,
                                  child: Column(
                                    children: [
                                      const TabBar(
                                        labelColor: ColorResources.textBlue,
                                        unselectedLabelColor:
                                            ColorResources.colorNero,
                                        indicatorColor: ColorResources.textBlue,
                                        tabs: [
                                          Tab(
                                            text: 'Occupancy',
                                          ),
                                          Tab(
                                            text: 'Tenants Details',
                                          ),
                                        ],
                                      ),
                                      Container(
                                        height: MediaQuery.of(context).size.height *
                                            0.35,
                                        child: TabBarView(
                                          children: [
                                            _returnOccupationSummary(),
                                            _returnTenantsDetails(),
                                          ],
                                        ),
                                      ),
                                    ],
                                  )),
                              DefaultTabController(
                                  length: 4,
                                  child: Column(
                                    children: [
                                      TabBar(
                                        labelColor: ColorResources.textBlue,
                                        unselectedLabelColor:
                                            ColorResources.colorNero,
                                        indicatorColor: ColorResources.textBlue,
                                        controller: _tabController,
                                        tabs: const [
                                          Tab(
                                            text: 'Units',
                                          ),
                                          Tab(
                                            text: 'Paid Inv',
                                          ),
                                          Tab(
                                            text: 'Un-Paid Inv',
                                          ),
                                          Tab(
                                            text: 'Payment',
                                          ),
                                        ],
                                      ),
                                      Container(
                                        height:
                                            MediaQuery.of(context).size.height *
                                                1,
                                        child:  TabBarView(
                                          controller: _tabController,
                                          children: [
                                            _tenantHouses(),
                                            _tenantPaidInvoices(),
                                            _tenantUnPaidInvoices(),
                                            _tenantPayment(),
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

  Widget _tenantPayment(){
    return Container(
      padding: const EdgeInsets.all(8),
      child: CustomScrollView(
        slivers: [
          PagedSliverList<int, Payment>(
            pagingController: _paymentPaginationController.pagingController,
            builderDelegate: PagedChildBuilderDelegate<Payment>(
              noItemsFoundIndicatorBuilder: (context) => const NoDataScreen(
                isFooter: false,
                isRecentTransaction: true,
              ),
              itemBuilder: (context, payment, index) => GestureDetector(
                onTap: () {
                  setState(() {
                    Navigator.pushNamed(
                      context,
                      AppRoutes.getPaymentDetailPageRoute(),
                      arguments: {
                        'paymentRef': payment.paymentRrn.toString(),
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
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              payment.paymentRrn,
                              textAlign: TextAlign.start,
                              style: poppinsRegular.copyWith(
                                fontSize: Dimensions.fontSizeSmall,
                                color: Colors.black,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              "KES ${payment.rentOwed.toString()}",
                              textAlign: TextAlign.start,
                              style: poppinsRegular.copyWith(
                                fontSize: Dimensions.fontSizeSmall,
                                color: Colors.black,
                                fontWeight: FontWeight.normal,
                              ),
                            ),
                          ],
                        ),
                      ),Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              payment.houseName,
                              textAlign: TextAlign.start,
                              style: poppinsRegular.copyWith(
                                fontSize: Dimensions.fontSizeSmall,
                                color: Colors.black,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              "KES ${payment.rentPaid.toString()}",
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
                              payment.paidBy,
                              textAlign: TextAlign.end,
                              style: poppinsRegular.copyWith(
                                fontSize: Dimensions.fontSizeSmall,
                                color: Colors.black,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              payment!.paidOn.toString(),
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
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
  Widget _tenantUnPaidInvoices(){
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
  Widget _tenantPaidInvoices(){
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
  Widget _tenantHouses() {
    return Container(
      padding: const EdgeInsets.all(8),
      child: CustomScrollView(
        slivers: [
          PagedSliverList<int, Tenant>(
            pagingController: _tenantPaginationController.pagingController,
            builderDelegate: PagedChildBuilderDelegate<Tenant>(
              noItemsFoundIndicatorBuilder: (context) => NoDataScreen(
                isTenants: true,
              ),
              itemBuilder: (context, tenant, index) => GestureDetector(
                onTap: () {
                  setState(() {
                    Navigator.pushNamed(
                      context,
                      AppRoutes.getHousesDetailPageRoute(),
                      arguments: {
                        'houseId': tenant.id.toString(),
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
    );
  }
  Widget _returnOccupationSummary() {
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
            offset: const Offset(0, 3), // changes position of shadow
          ),
        ],
      ),
      child: tenantsDetails == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(4.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      SummaryCard(
                        height: height,
                        title: 'Units Occupied',
                        value: '${(tenantsDetails?.content.occupiedUnits.toString())}',
                        color: ColorResources.card1,
                        icon: Images.totalInvoicesIcon,
                        textColor: ColorResources.colorNero,
                      ).onTap(() {
                        // Open the invoices page
                      }),
                      SummaryCard(
                        height: height,
                        title: 'Total Arrears',
                        value: '${formatToMoney(tenantsDetails?.content.totalArrears ?? 0)}',
                        color: ColorResources.card2,
                        icon: Images.totalPaymentIcon,
                        textColor: ColorResources.textGreen,
                      ).onTap(() {
                        // Open the payment statement page
                      }),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(4.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      SummaryCard(
                        height: height,
                        title: 'Total Invoice',
                        value: '${formatToMoney(tenantsDetails?.content.totalRent ?? 0)}',
                        color: ColorResources.card3,
                        icon: Images.totalExpenditure,
                        textColor: ColorResources.textRed,
                      ).onTap(() {
                        // Open the expenditure page
                      }),
                      SummaryCard(
                        height: height,
                        title: 'Total Payment',
                        value: '${formatToMoney(tenantsDetails?.content.totalPayment ?? 0)}',
                        color: ColorResources.card4,
                        icon: Images.totalArrearsIcon,
                        textColor: ColorResources.textRed,
                      ).onTap(() {
                        // Open the unpaid invoices page
                      }),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
  Widget _returnTenantsDetails(){

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          RichText(
            text: TextSpan(
              children: [
                TextSpan(
                  text: "Name. \n",
                  style: poppinsRegular.copyWith(
                    color:
                    ColorResources.colorBlack,
                    fontSize:
                    Dimensions.fontSizeDefault,
                  ),
                ),
                TextSpan(
                  text: tenantsDetails?.name,
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
                  text: "Email. \n",
                  style: poppinsRegular.copyWith(
                    color:
                    ColorResources.colorBlack,
                    fontSize:
                    Dimensions.fontSizeDefault,
                  ),
                ),
                TextSpan(
                  text: tenantsDetails?.email,
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
                  text: "Phone. \n",
                  style: poppinsRegular.copyWith(
                    color:
                    ColorResources.colorBlack,
                    fontSize:
                    Dimensions.fontSizeDefault,
                  ),
                ),
                TextSpan(
                  text: tenantsDetails?.phone,
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
    );
  }

}
