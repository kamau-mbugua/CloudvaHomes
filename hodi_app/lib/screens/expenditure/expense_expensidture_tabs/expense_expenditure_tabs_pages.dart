import 'package:flutter/material.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_bf_page.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_paid_page.dart';
import 'package:hodi_app/screens/invoices/tenants/tabs/tenants_invoices_unpaid_page.dart';

import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';
import '../expenses/expenses_page.dart';
import '../recurrent/recureent_expenditure_page.dart';

class ExpenseExpenditureTabsPage extends StatefulWidget {
  final ValueNotifier<String> propertyIdNotifier;
  ExpenseExpenditureTabsPage({super.key, required this.propertyIdNotifier});

  @override
  State<ExpenseExpenditureTabsPage> createState() => _ExpenseExpenditureTabsPageState();
}

class _ExpenseExpenditureTabsPageState extends State<ExpenseExpenditureTabsPage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
         "Expense-Expenditure",
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
                  Tab(text: 'Expense'),
                  Tab(text: 'Expenditure'),
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  Center(
                      child: ExpensesListPage(propertyIdNotifier: widget.propertyIdNotifier, isShowToolbar: false)
                  ),
                  Center(
                      child: RecurrentExpenditurePage(propertyIdNotifier: widget.propertyIdNotifier, isShowToolbar: false)
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