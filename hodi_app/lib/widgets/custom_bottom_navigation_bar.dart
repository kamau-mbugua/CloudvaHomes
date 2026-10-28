import 'package:flutter/material.dart';
import 'package:hodi_app/utils/authorities_constant.dart';
import 'package:hodi_app/utils/dimensions.dart';
import 'package:hodi_app/utils/styles.dart';
import 'package:provider/provider.dart';

import '../models/data/authentication/login_response.dart';
import '../providers/auth_provider.dart';
import '../services/authority_service.dart';

class CustomBottomNavigationBar extends StatefulWidget {
  final int selectedIndex;
  final Function(int) onItemTapped;


  CustomBottomNavigationBar({
    required this.selectedIndex,
    required this.onItemTapped,
  });

  @override
  State<CustomBottomNavigationBar> createState() => _CustomBottomNavigationBarState();
}

class _CustomBottomNavigationBarState extends State<CustomBottomNavigationBar> {
  List<BottomNavigationBarItem> items = [];

  @override
  void initState() {
    super.initState();
    loadItems();
  }

  void loadItems() {
    items.add(
      const BottomNavigationBarItem(
        icon: Icon(Icons.home),
        label: 'Home',
      )
    );

    if (AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_HOUSES)) {
      items.add(const BottomNavigationBarItem(
        icon: Icon(Icons.house),
        label: 'Houses',
      ));
    }

    if (AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_TENANTS)) {
      items.add(const BottomNavigationBarItem(
        icon: Icon(Icons.people),
        label: 'Tenants',
      ));
    }

    if (AuthorityService().hasAuthority(AuthoritiesConstants.ROLE_METRES)) {
      items.add(const BottomNavigationBarItem(
        icon: Icon(Icons.water),
        label: 'Meters',
      ));
    }

  }


  @override
  Widget build(BuildContext context) {



    return BottomNavigationBar(
      items: items,
      currentIndex: widget.selectedIndex,
      selectedItemColor: Colors.blue,
      unselectedItemColor: Colors.grey,
      selectedIconTheme: const IconThemeData(size: 30),
      selectedFontSize: Dimensions.fontSizeDefault,
      selectedLabelStyle: poppinsRegular.copyWith(fontSize: Dimensions.fontSizeDefault),
      unselectedIconTheme: const IconThemeData(size: 25),
      unselectedLabelStyle: poppinsRegular.copyWith(fontSize: Dimensions.fontSizeDefault),
      showSelectedLabels: true,
      unselectedFontSize: Dimensions.fontSizeDefault,
      showUnselectedLabels: true,
      landscapeLayout: BottomNavigationBarLandscapeLayout.centered,
      type: BottomNavigationBarType.shifting,
      backgroundColor: Colors.red,
      iconSize: 30,
      onTap: widget.onItemTapped,
    );
  }
}