import 'package:flutter/material.dart';
import 'package:hodi_app/logger.dart';
import 'package:hodi_app/screens/home/dashboard_page.dart';
import 'package:hodi_app/screens/home/houses_page.dart';
import 'package:hodi_app/screens/home/meters_page.dart';
import 'package:hodi_app/screens/home/tenants_page.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../models/data/authentication/login_response.dart';
import '../../models/data/estate_invoices/check_status.dart';
import '../../providers/auth_provider.dart';
import '../../providers/authenticated_app_providers.dart';
import '../../services/authority_service.dart';
import '../../services/invoice_service.dart';
import '../../services/invoice_status_handler.dart';
import '../../utils/authorities_constant.dart';
import '../../utils/color_resources.dart';
import '../../utils/dimensions.dart';
import '../../utils/styles.dart';
import '../../viewmodel/payment_view_model.dart';
import '../../widgets/custom_bottom_navigation_bar.dart';
import '../../widgets/custom_confirmation_dialog.dart';
import '../../widgets/custom_drawer.dart';
import '../../widgets/dashboard_tool_bar.dart';
import 'houses_tabs_page.dart';

class HomeScreen extends StatefulWidget {
  @override
  _HomeScreenState createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;
  // List of items for the dropdown menu
  late List<String> _dropdownItems = ['All Properties'];
  late String _selectedDropdownItem;
  Map<String, String> _propertyMap = {'All Properties': ''};
  ValueNotifier<String> _selectedPropertyIdNotifier = ValueNotifier<String>('');
  List<AuthorityData>? _authorities = [];
  // Method to handle bottom navigation bar taps
  void _onItemTapped(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  @override
  void initState() {
    super.initState();
    // _loadUserData();
    _selectedDropdownItem = _dropdownItems.first;
    if (Provider.of<AuthProvider>(context, listen: false).isLoggedIn()) {
      if (AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_PROPERTIES)) {
        Future.microtask(() async{
          await InvoiceStatusHandler(context).fetchCheckInvoiceStatus();


          await Provider.of<AuthenticatedAppProviders>(context, listen: false)
              .getBusinessProperties("")
              .then((value) {
            if (value.isNotEmpty) {
              setState(() {
                _dropdownItems.addAll(value.map((e) => e.name).toList());
                _propertyMap.addEntries(value.map((e) => MapEntry(e.name, e.id.toString())));
                _dropdownItems = _dropdownItems.toSet().toList(); // Ensure unique values
                _selectedDropdownItem = _dropdownItems.first;
              });
              // Set to a valid value
            }
          });

        });
      }

    }else{
      logger.e('User is not logged in');
    }




  }





  void _onDropdownChanged(String? newValue) {
    setState(() {
      _selectedDropdownItem = newValue!;
      _selectedPropertyIdNotifier.value = _propertyMap[newValue] ?? '';
    });
  }

  bool hasAuthority(String authority) {
    return _authorities?.any((element) => element.authority == authority) ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final LoginResponse? loginResponse = Provider.of<AuthProvider>(context, listen: false).getLoginResponse();

    // List of pages for the bottom navigation bar
    final List<Widget> _pages = [
      Center(child: DashboardPage(propertyIdNotifier: _selectedPropertyIdNotifier)),
      Center(child: HousesTabsPage(propertyIdNotifier: _selectedPropertyIdNotifier)),
      Center(child: TenantsPage(propertyIdNotifier: _selectedPropertyIdNotifier)),
      Center(child: MetersPage(propertyIdNotifier: _selectedPropertyIdNotifier)),
    ];

    return Consumer<PaymentViewModel>(
        builder: (context, paymentViewModel, child) {
          if (paymentViewModel.paymentSuccessful) {
            InvoiceStatusHandler(context).dismissDialog();
            InvoiceStatusHandler(context).fetchCheckInvoiceStatus();
            paymentViewModel.resetPaymentStatus();
          }
          return Scaffold(
            appBar: CustomDashboardAppBar(
              selectedDropdownItem: _selectedDropdownItem,
              dropdownItems: _dropdownItems,
              onDropdownChanged: _onDropdownChanged,
            ),
            drawer: CustomDrawer(propertyIdNotifier: _selectedPropertyIdNotifier),
            body: Column(
              mainAxisAlignment: MainAxisAlignment.start,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                loginResponse != null
                    ? Center(
                  child: Container(
                    child: Text(
                      loginResponse.data.userDetails.estate == "N/A" ? 'Welcome ${loginResponse.data.userDetails.username}' : loginResponse.data.userDetails.estate,
                      style: poppinsRegular.copyWith(
                          fontSize: Dimensions.fontSizeLarge,
                          color: ColorResources.textBlue,
                          fontStyle: FontStyle.normal,
                          fontWeight: FontWeight.bold
                      ),
                    ),
                  ),
                ).paddingOnly(top: 16, bottom: 16)
                    :
                Center(
                  child: Text(
                    'You are not in any estate',
                    style: poppinsRegular.copyWith(
                      fontSize: Dimensions.fontSizeLarge,
                      color: ColorResources.colorNero,
                    ),
                  ),
                ),
                Expanded(child: _pages[_selectedIndex]),
              ],
            ),
            bottomNavigationBar: CustomBottomNavigationBar(
              selectedIndex: _selectedIndex,
              onItemTapped: _onItemTapped,
            ),
          );
        }

    );
  }
}
