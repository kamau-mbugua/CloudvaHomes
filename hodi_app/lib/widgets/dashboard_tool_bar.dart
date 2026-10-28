import 'package:flutter/material.dart';
import 'package:hodi_app/logger.dart';
import 'package:hodi_app/utils/images.dart';
import 'package:hodi_app/utils/styles.dart';
import 'package:intl/intl.dart';

import '../flavors.dart';
import '../route/routes.dart';
import 'package:custom_scroll_date_range_picker/custom_scroll_date_range_picker.dart';

import '../services/authority_service.dart';
import '../utils/authorities_constant.dart';
import '../utils/dimensions.dart';
import 'date_range_picker.dart';

class CustomDashboardAppBar extends StatefulWidget implements PreferredSizeWidget {
  final String selectedDropdownItem;
  final List<String> dropdownItems;
  final Function(String?) onDropdownChanged;

  CustomDashboardAppBar({
    required this.selectedDropdownItem,
    required this.dropdownItems,
    required this.onDropdownChanged,
  });

  @override
  State<CustomDashboardAppBar> createState() => _CustomDashboardAppBarState();

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);
}

class _CustomDashboardAppBarState extends State<CustomDashboardAppBar> {
  @override
  Widget build(BuildContext context) {
    return AppBar(
      leading: Builder(
        builder: (BuildContext context) {
          return IconButton(
            icon: Icon(Icons.menu), // Side nav button
            onPressed: () {
              Scaffold.of(context).openDrawer();
            },
          );
        },
      ),
      title:

      AuthorityService()
          .hasAuthority(AuthoritiesConstants.ROLE_PROPERTIES) ?Center(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(
              Images.propertyDropdown,
              width: 20,
              height: 20,
            ),
            SizedBox(width: 10),
            DropdownButton<String>(
              value: widget.selectedDropdownItem,
              onChanged: widget.onDropdownChanged,
              items: widget.dropdownItems.map<DropdownMenuItem<String>>((String value) {
                return DropdownMenuItem<String>(
                  value: value,
                  child: Text(value),
                );
              }).toList(),
            ),
          ],
        ),
      ) :
      Center(
        child: Text(F.title,   style: poppinsSemiBold.copyWith(
          color: Theme.of(context).primaryColorDark,
          fontSize: Dimensions.fontSizeLarge,
        ),),
      ),
      actions: [
        IconButton(
          icon: Image.asset(
            Images.userprofile,
            width: 30,
            height: 32,
          ), // User profile icon
          onPressed: () async {
            Navigator.pushNamed(
                context,
                AppRoutes
                    .getProfilePageRoute());

          },
        ),
      ],
    );
  }


}