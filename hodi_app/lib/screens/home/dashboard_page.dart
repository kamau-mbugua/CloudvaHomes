import 'package:flutter/material.dart';
import 'package:hodi_app/logger.dart';
import 'package:hodi_app/utils/color_resources.dart';
import 'package:hodi_app/utils/dimensions.dart';
import 'package:hodi_app/widgets/gauge_chart.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../models/data/authentication/login_response.dart';
import '../../models/data/estate_invoices/check_status.dart';
import '../../providers/auth_provider.dart';
import '../../providers/authenticated_app_providers.dart';
import '../../route/routes.dart';
import '../../services/authority_service.dart';
import '../../services/custom_refresh_indicator.dart';
import '../../services/invoice_service.dart';
import '../../utils/authorities_constant.dart';
import '../../utils/helpers.dart';
import '../../utils/styles.dart';
import '../../widgets/base/no_data_screen.dart';
import '../../widgets/circle_view.dart';
import '../../widgets/custom_confirmation_dialog.dart';
import '../../widgets/customer_dashboard_summary_view.dart';
import '../../widgets/dashboard_list_items.dart';
import '../../widgets/dashboard_summary_view.dart';

class DashboardPage extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;
  const DashboardPage({super.key, required this.propertyIdNotifier});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  MyHelpers helpers = MyHelpers();
  String firstDate = '';
  String lastDate = '';
  bool hasPaymentRole = false;
  bool isSelf = false;

  Future<void> _refreshData() async {
    // Add your refresh logic here
    final String propertyId = widget.propertyIdNotifier.value;

    fetchProipertyData(propertyId);
    fetchDashboardData(propertyId);
    getPaymentsData(propertyId);


    setState(() {
      // Update your data here
    });
  }


  void fetchDashboardData(String propertyId) {
    Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .getDashboardData('', propertyId, '2', isSelf, context);
  }

  void getPaymentsData(String propertyId) {
    Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .getPaymentsData(0, 10, propertyId ?? "", "", helpers.getCurrentMonthDates()['firstDate']!, helpers.getCurrentMonthDates()['firstDate']!, isSelf, "", "");
  }







  void fetchProipertyData(String propertyId) {
    if(AuthorityService()
        .hasAuthority(AuthoritiesConstants.ROLE_PROPERTIES)){
      Provider.of<AuthenticatedAppProviders>(context, listen: false)
          .getUnitComparisons(
          '',
          propertyId,
          '4',
          getCurrentMonthNumber().toString(),
          getCurrentYearNumber().toString());
    }
  }

  int getCurrentMonthNumber() {
    DateTime now = DateTime.now();
    var month = now.month;
    logger.i("Month: $month");
    return month;
  }

  int getCurrentYearNumber() {
    DateTime now = DateTime.now();
    var year = now.year;
    logger.i("Year: $year");
    return year;
  }

  @override
  void initState() {
    super.initState();
    if (Provider.of<AuthProvider>(context, listen: false).isLoggedIn()) {
      setUpUIPermissions();
    }
    firstDate = helpers.getCurrentMonthDates()['firstDate']!;
    lastDate = helpers.getCurrentMonthDates()['lastDate']!;
    widget.propertyIdNotifier.addListener(_refreshData);
  }




  void setUpUIPermissions() async {
    hasPaymentRole = await AuthorityService()
        .hasAuthority(AuthoritiesConstants.ROLE_PAYMENTS);
    if (hasPaymentRole) {
      setState(() {
        isSelf = false;
      });
    } else {
      setState(() {
        isSelf = true;
      });
    }

    logger.d("setUpUIPermissions ${isSelf} ");

    await Future.microtask(() {
      _refreshData();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Consumer<AuthenticatedAppProviders>(
        builder: (context, provider, child) {
          return provider.isLoading
                  ? const Center(
                      child: CircularProgressIndicator(),
                    )
                  :_buildDashboard(provider);
        },
      ),
    );
  }

  _buildDashboard(AuthenticatedAppProviders provider) {
    final LoginResponse? loginResponse =
        Provider.of<AuthProvider>(context, listen: false).getLoginResponse();
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: CustomRefreshIndicator(
        onRefresh: _refreshData,
        myContext: context,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(), // Ensures scrollability
          children: [
            Column(
              mainAxisAlignment: MainAxisAlignment.start,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Summary',
                  style: poppinsBold.copyWith(
                    fontSize: Dimensions.fontSizeLarge,
                    color: ColorResources.colorPrimary,
                  ),
                ),
                AuthorityService()
                    .hasAuthority(AuthoritiesConstants.ROLE_PROPERTIES) ?
                DashboardSummaryView(
                    dashboardData: provider.dashboardData,
                    propertyIdNotifier: widget.propertyIdNotifier)
                    :  CustomerDashboardSummaryView(
                    dashboardData: provider.dashboardData,
                    propertyIdNotifier: widget.propertyIdNotifier),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Recent Payments',
                      style: poppinsBold.copyWith(
                        fontSize: Dimensions.fontSizeLarge,
                        color: ColorResources.colorPrimary,
                      ),
                    ),
                    Text(
                      'View All',
                      style: poppinsSemiBold.copyWith(
                        fontSize: Dimensions.fontSizeDefault,
                        color: ColorResources.textBlue,
                      ),
                    ).onTap( (){
                      Navigator.pushNamed(
                        context,
                        AppRoutes.getPaymentPageRoute(),
                        arguments: {
                          'propertyId': widget.propertyIdNotifier.value,
                          'self': isSelf
                        },
                      );
                    }),
                  ],
                ),
                (provider.paymentResponse?.content.isEmpty ?? true) &&
                    !provider.isLoading
                    ? const NoDataScreen(isRecentTransaction: true)
                    : Column(
                  children: [
                    const SizedBox(height: 10),
                    DashboardListItems(
                        content: provider.paymentResponse?.content ?? []),
                  ],
                ),
                const SizedBox(height: 20),
                if (AuthorityService()
                    .hasAuthority(AuthoritiesConstants.ROLE_PROPERTIES)) ...[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Units Comparison',
                        style: poppinsBold.copyWith(
                            fontSize: Dimensions.fontSizeLarge,
                            color: ColorResources.colorPrimary,
                            fontWeight: FontWeight.bold),
                      ),
                      Text(
                        '',
                        style: poppinsSemiBold.copyWith(
                          fontSize: Dimensions.fontSizeDefault,
                          color: ColorResources.textBlue,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Center(
                    child: SizedBox(
                        width: MediaQuery.of(context).size.width,
                        height: MediaQuery.of(context).size.height * 0.3,
                        child: Center(
                            child: GaugeChart(
                                unitComparisonDashboardContent:
                                provider.unitComparisonDashboardContent))),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      Center(
                        child: CircleView(
                          size: 10.0,
                          color: ColorResources.graphPink,
                          child: Text(
                            'Occupied ${provider.unitComparisonDashboardContent?.occupiedUnits ?? 0}',
                            style: TextStyle(color: Colors.black),
                          ),
                        ),
                      ),
                      Center(
                        child: CircleView(
                          size: 10.0,
                          color: ColorResources.graphGrey,
                          child: Text(
                            'Unoccupied ${getUnoccupiedUnits(provider.unitComparisonDashboardContent?.totalUnits ?? 0, provider.unitComparisonDashboardContent?.occupiedUnits ?? 0)}',
                            style: const TextStyle(color: Colors.black),
                          ),
                        ),
                      )
                    ],
                  )
                ]
              ],
            ),
          ]
        ),
      ),
    );
  }

}

getUnoccupiedUnits(int totalUnits, int ocupiedUnits) {
  var unOccupied = totalUnits - ocupiedUnits;
  if (unOccupied < 0) {
    return 0;
  } else {
    return unOccupied;
  }
}
