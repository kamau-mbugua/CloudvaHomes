import 'package:flutter/material.dart';
import 'package:hodi_app/screens/invoices/estate/tabs/estate_payment_page.dart';

import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';
import 'tabs/estate_paid_invoices.dart';
import 'tabs/estate_unpaid_invoices.dart';

class EstateInvoicesPage extends StatefulWidget {
  const EstateInvoicesPage({Key? key}) : super(key: key);

  @override
  State<EstateInvoicesPage> createState() => _EstateInvoicesPageState();
}

class _EstateInvoicesPageState extends State<EstateInvoicesPage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Estate Invoices',
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
                  Tab(text: 'Payment'),
                ],
              ),
            ),
            const Expanded(
              child: TabBarView(
                children: [
                  Center(
                      child: EstateUnpaidInvoices()
                  ),
                  Center(
                      child: EstatePaidInvoices()
                  ),
                  Center(
                      child: EstatePayment()
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