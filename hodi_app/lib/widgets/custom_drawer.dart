import 'package:flutter/material.dart';
import 'package:hodi_app/utils/styles.dart';
import 'package:hodi_app/widgets/sign_out_confirmation_dialog.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../flavors.dart';
import '../models/data/authentication/login_response.dart';
import '../providers/auth_provider.dart';
import '../route/routes.dart';
import '../services/authority_service.dart';
import '../utils/authorities_constant.dart';
import '../utils/dimensions.dart';
import '../utils/images.dart';

class CustomDrawer extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;
  const CustomDrawer({super.key, required this.propertyIdNotifier});

  @override
  State<CustomDrawer> createState() => _CustomDrawerState();
}

class _CustomDrawerState extends State<CustomDrawer> {
  String? _expandedTile;
  String _appVersion = '';
  List<AuthorityData>? _authorities = [];

  @override
  void initState() {
    super.initState();
    _initPackageInfo();
  }

  Future<void> _initPackageInfo() async {
    final info = await PackageInfo.fromPlatform();
    setState(() {
      _appVersion = '${info.version}+${info.buildNumber}';
    });
  }


  @override
  Widget build(BuildContext context) {
    final bool isLoggedIn =
        Provider.of<AuthProvider>(context, listen: false).isLoggedIn();



    return SafeArea(
      child: Drawer(
        child: ListView(
          padding: EdgeInsets.zero,
          children: <Widget>[
            _headerDrawer(),
            if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_USER_GROUPS) ||
                AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_USERS)) _adminDrawer(),
             _propertyDrawer(),
            _billDrawer(),
            if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_EXPENDITURES) ||
                AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_EXPENSES)) _expenditureDrawer(),
            _reportsDrawer(),
            if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_UTILITY_BILLS) ||
                AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_PAYMENT_TYPES))_configDrawer(),
            _aboutDrawer(),
            _logoutDrawer(isLoggedIn),
            _footerDrawer(),
          ],
        ),
      ),
    );
  }

  Widget _buildExpansionTile(String title, List<Widget> children, Icon icon) {
    return ExpansionTile(
      key: PageStorageKey<String>(title),
      // Ensures unique keys for each tile
      title: Text(
        title,
        style: poppinsBold.copyWith(
          fontSize: Dimensions.fontSizeLarge,
          color: Colors.black,
          fontWeight: FontWeight.bold,
        ),
      ),
      initiallyExpanded: _expandedTile == title,
      onExpansionChanged: (bool expanded) {
        setState(() {
          // Set the expanded tile or collapse all if none
          _expandedTile = expanded ? title : null;
        });
      },
      children: children,
      leading: icon,
    );
  }

  Widget _buildListTile(String title, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(left: 40.0),
      child: ListTile(
        title: Text(title,
            style: poppinsRegular.copyWith(
              fontSize: Dimensions.fontSizeLarge,
              color: Colors.black,
              fontWeight: FontWeight.normal,
            )),
        onTap: onTap,
      ),
    );
  }

  Widget _adminDrawer() {
    return _buildExpansionTile(
        'Admin',
        [
          if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_USER_GROUPS))  _buildListTile('User Groups', () {
            Navigator.pushNamed(
                context, AppRoutes.getUserGroupsPageRoute());
          }),
          if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_USERS))  _buildListTile('Users', () {
            Navigator.pushNamed(
                context, AppRoutes.getUsersPageRoute());
          }),
        ],
        const Icon(Icons.admin_panel_settings));
  }

  Widget _propertyDrawer() {
    return _buildExpansionTile(
      'Properties',
      [
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_PROPERTIES))  _buildListTile('Properties', () {
          Navigator.pushNamed(
              context, AppRoutes.getPropertiesPageRoute());
        }),
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_CATEGORIES)) _buildListTile('House Categories', () {
          Navigator.pushNamed(
            context,
            AppRoutes.getHousesCategoriesPageRoute(
            ),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier
            },
          );
        }),
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_HOUSES)) _buildListTile('Houses', () {
          var isAppBar = true;
          Navigator.pushNamed(
            context,
            AppRoutes.getHousesPageRoute(),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier,
              'isAppBar': isAppBar,
            },
          );
        }),
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_TENANTS)) _buildListTile('Tenants', () {
          var isAppBar = true;
          var self = false;
          Navigator.pushNamed(
            context,
            AppRoutes.getTenantsPageRoute(),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier,
              'isAppBar': isAppBar,
              'self': self
            },
          );
        }),

       _buildListTile('My Houses', () {
          var isAppBar = true;
          var self = true;
          var isMyHouses = true;
          Navigator.pushNamed(
            context,
            AppRoutes.getTenantsPageRoute(),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier,
              'isAppBar': isAppBar,
              'self': self,
              'isMyHouses': isMyHouses
            },
          );
        }),
      ],
      const Icon(Icons.other_houses_outlined),
    );
  }

  Widget _billDrawer() {
    return _buildExpansionTile(
      'Billing',
      [
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_PROPERTY_INVOICES)) _buildListTile('Tenant Invoices', () {
          var isSelf = false;
          Navigator.pushNamed(
            context,
            AppRoutes.getTenantInvoicesPageRoute(
            ),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier,
              'isSelf': isSelf
            },
          );
        }),
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_METRES)) _buildListTile('Metres', () {
          var isAppBar = true;
          Navigator.pushNamed(
            context,
            AppRoutes.getMetersPageRoute(),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier,
              'isAppBar': isAppBar,
            },
          );
        }),
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_INVOICES)) _buildListTile('Estate Invoices', () {
          Navigator.pushNamed(
              context,
              AppRoutes.getEstateInvoicesPageRoute()
          );
        }),
       _buildListTile('My Invoices', () {
          var isSelf = true;
          Navigator.pushNamed(
            context,
            AppRoutes.getTenantInvoicesPageRoute(
            ),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier,
              'isSelf': isSelf
            },
          );
        }),
      ],
      const Icon(Icons.credit_card),
    );
  }

  Widget _expenditureDrawer() {
    return _buildExpansionTile(
      'Expenditure',
      [
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_EXPENDITURES))  _buildListTile('Recurrent Expenditure', () {
          Navigator.pushNamed(
            context,
            AppRoutes.getRecureentExpenditurePageRoute(),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier
            },
          );
        }),
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_EXPENSES)) _buildListTile('Expense', () {
          Navigator.pushNamed(
            context,
            AppRoutes.getExpensesPageRoute(),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier
            },
          );
        }),
      ],
      const Icon(Icons.money),
    );
  }

  Widget _reportsDrawer() {
    return _buildExpansionTile(
      'Reports',
      [
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_PAYMENTS))  _buildListTile('Payments', () {
          Navigator.pushNamed(
            context,
            AppRoutes.getPaymentPageRoute(),
            arguments: {
              'propertyId': widget.propertyIdNotifier.value,
              'self': false
            },
          );
        }),

       _buildListTile('My Payments', () {
          Navigator.pushNamed(
            context,
            AppRoutes.getPaymentPageRoute(),
            arguments: {
              'propertyId': widget.propertyIdNotifier.value,
              'self': true
            },
          );
        }),
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_PROPERTY_INVOICES)) _buildListTile('Invoice Reports', () {
          var isSelf = false;
          Navigator.pushNamed(
            context,
            AppRoutes.getTenantInvoicesPageRoute(
            ),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier,
              'isSelf': isSelf
            },
          );
        }),
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_PROPERTY_REPORTS)) _buildListTile('Property Reports', () {
          Navigator.pushNamed(
            context,
            AppRoutes.getPropertyPageRoute(
            ),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier,
            },
          );
        }),
        if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_PAYMENTS)) _buildListTile('Payment Statements', () {
          Navigator.pushNamed(
            context,
            AppRoutes.getPaymentStatementPageRoute(
            ),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier,
            },
          );
        }),
      ],
      const Icon(Icons.inventory_outlined),
    );
  }

  Widget _configDrawer() {
    return _buildExpansionTile(
      'Configs',
      [
       if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_UTILITY_BILLS))  _buildListTile('Utility Bills', () {
          Navigator.pushNamed(
            context,
            AppRoutes.getUtilityBillListPageRoute(
            ),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier,
            },
          );
        }),
       if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_UTILITY_BILLS))  _buildListTile('New Let Fees', () {
          Navigator.pushNamed(
            context,
            AppRoutes.getOnBoardingFeeListPageRoute(
            ),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier,
            },
          );
        }),
       if(AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_PAYMENT_TYPES))  _buildListTile('Payment Types', () {
          Navigator.pushNamed(
            context,
            AppRoutes.getPaymentTypesListPageRoute(
            ),
            arguments: {
              'propertyIdNotifier': widget.propertyIdNotifier,
            },
          );
        }),
      ],
      const Icon(Icons.settings),
    );
  }

  Widget _aboutDrawer() {
    return _buildExpansionTile(
      'About',
      [
        _buildListTile('About Us', () {
          navigateToWebview(
            context,
            'https://hodi-test.qnex.io/about',
            title: 'About Us',
          );
        }),
        _buildListTile('Privacy Policy', () {
          navigateToWebview(
            context,
            'https://hodi-test.qnex.io/privacy-policy',
            title: 'Privacy Policy',
          );
        }),
        _buildListTile('Terms of use', () {
          navigateToWebview(
            context,
            'https://hodi-test.qnex.io/terms-and-conditions',
            title: 'Terms of use',
          );
        }),
      ],
      const Icon(Icons.info),
    );
  }

  Widget _logoutDrawer(bool isLoggedIn) {
    return _buildExpansionTile(
      'Logout',
      [
        _buildListTile('Logout', () {
          if (isLoggedIn) {
            showDialog(
                context: context,
                barrierDismissible: false,
                builder: (context) =>
                const SignOutConfirmationDialog());
          } else {
            Navigator.pushNamed(context, AppRoutes.getLoginPageRoute());
          }
        }),
      ],
      const Icon(Icons.exit_to_app),
    );
  }

  Widget _footerDrawer() {
    return Center(
      child: Text(
        'V${_appVersion} - ${F.title}',
        style: poppinsBold.copyWith(
            fontSize: Dimensions.fontSizeLarge,
            color: Colors.black,
            fontWeight: FontWeight.bold),
      ),
    );
  }

  Widget _headerDrawer() {
    return  DrawerHeader(
      child: Image.asset(Images.logo, height: 150),
    );
  }
}

void navigateToWebview(BuildContext context, String s, {required String title}) {
  Navigator.pushNamed(
    context,
    AppRoutes.getWebViewPageRoute(),
    arguments: {
      'url': s,
      'title': title,
    },
  );
}
