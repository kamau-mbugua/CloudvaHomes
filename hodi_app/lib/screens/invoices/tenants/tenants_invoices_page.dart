import 'package:flutter/material.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_bf_page.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_paid_page.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_unpaid_page.dart';

import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';

class TenantsInvoicesPage extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;
  bool isSelf;
  TenantsInvoicesPage({super.key, required this.propertyIdNotifier,this.isSelf = false});

  @override
  State<TenantsInvoicesPage> createState() => _TenantsInvoicesPageState();
}

class _TenantsInvoicesPageState extends State<TenantsInvoicesPage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.isSelf ? 'My Invoices' : 'Tenants Invoices',
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
      ),
      body: DefaultTabController(
        length: 3,
        child: Column(
          children: <Widget>[
            Container(
              constraints: BoxConstraints.expand(height: 50),
              child: TabBar(
                labelColor: Theme.of(context).primaryColor,
                unselectedLabelColor: Colors.black,
                tabs: const [
                  Tab(text: 'Unpaid'),
                  Tab(text: 'Paid'),
                  Tab(text: 'BF Invoices'),
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  Center(
                      child: TenantsInvoicesUnpaidPage(propertyIdNotifier: widget.propertyIdNotifier, isSelf: widget.isSelf)
                  ),
                  Center(
                      child: TenantsInvoicesPaidPage(propertyIdNotifier: widget.propertyIdNotifier, isSelf: widget.isSelf)
                  ),
                  Center(
                      child: TenantsInvoicesBFPage(propertyIdNotifier: widget.propertyIdNotifier, isSelf: widget.isSelf)
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