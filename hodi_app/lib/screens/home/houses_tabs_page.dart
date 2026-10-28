import 'package:flutter/material.dart';
import 'package:hodi_app/screens/properties/houses/tabs/houses_ocupied_page.dart';
import 'package:hodi_app/screens/properties/houses/tabs/houses_un_occupied_page.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_bf_page.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_paid_page.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_unpaid_page.dart';

import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';

class HousesTabsPage extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;
  bool isAppBar;
  HousesTabsPage({super.key, required this.propertyIdNotifier,this.isAppBar = false});

  @override
  State<HousesTabsPage> createState() => _HousesTabsPageState();
}

class _HousesTabsPageState extends State<HousesTabsPage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.isAppBar ? AppBar(
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
      ) : null,
      body: DefaultTabController(
        length: 2,
        child: Column(
          children: <Widget>[
            Container(
              constraints: BoxConstraints.expand(height: 50),
              child: TabBar(
                labelColor: Theme.of(context).primaryColor,
                unselectedLabelColor: Colors.black,
                tabs: const [
                  Tab(text: 'Occupied'),
                  Tab(text: 'Unoccupied'),
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  Center(
                      child: OccupiedHousesPage(propertyIdNotifier: widget.propertyIdNotifier)
                  ),
                  Center(
                      child: UnoccupiedHousesPage(propertyIdNotifier: widget.propertyIdNotifier)
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}