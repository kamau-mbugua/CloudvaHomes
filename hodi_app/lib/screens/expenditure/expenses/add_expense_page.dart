import 'package:flutter/material.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../../models/data/properties/properties.dart';
import '../../../providers/authenticated_app_providers.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';
import '../../../widgets/base/custom_button.dart';
import '../../../widgets/base/custom_snackbar.dart';
import '../../../widgets/base/custom_text_field.dart';

class AddExpensePage extends StatefulWidget {
  final Function(bool) isExpenseAdded;

  const AddExpensePage({Key? key, required this.isExpenseAdded})
      : super(key: key);

  @override
  _AddExpensePageState createState() => _AddExpensePageState();
}

class _AddExpensePageState extends State<AddExpensePage> {
  List<Property> properties = [];
  List<Property> filteredProperties = [];

  String selectedPropertyId = "";
  String selectedEstateId = "";
  String selectedPropertyNames = "";

  TextEditingController? _nameController;
  TextEditingController? _descriptionController;
  TextEditingController? _amountController;
  final FocusNode _nameFocus = FocusNode();
  final FocusNode _descriptionFocus = FocusNode();
  final FocusNode _amountFocus = FocusNode();

  void fetchProperties([String query = ""]) async {
    debugPrint(">>>>>>>>>fetchProperties<<<<<<<<<< and query is $query");
    List<Property> fetchedProperties =
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getBusinessProperties("");

    setState(() {
      properties = fetchedProperties;
      filteredProperties = fetchedProperties;
    });
  }

  @override
  void initState() {
    Future.microtask(() => {
          fetchProperties(), // fetchHouses()
        });
    _nameController = TextEditingController();
    _descriptionController = TextEditingController();
    _amountController = TextEditingController();
    super.initState();
  }

  @override
  void dispose() {
    _nameController!.dispose();
    _descriptionController!.dispose();
    _amountController!.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthenticatedAppProviders>(
        builder: (context, provider, child) {
      return Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          title: Text(
            'Add Expense',
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
        body: provider.isLoading
            ? const Center(child: CircularProgressIndicator())
            : Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Select Property",
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ),
                    DropdownButton<String>(
                      value:
                          selectedPropertyId == "" ? null : selectedPropertyId,
                      items: properties.map((Property property) {
                        return DropdownMenuItem<String>(
                          value: property.id.toString(),
                          child: Text(property.name),
                        );
                      }).toList(),
                      onChanged: (String? newValue) {
                        setState(() {
                          selectedPropertyId = newValue!;
                          selectedEstateId = properties
                              .firstWhere((element) =>
                                  element.id.toString() == selectedPropertyId)
                              .estateId
                              .toString();
                        });
                      },
                      hint: const Text("Select Property"),
                      isExpanded: true,
                    ).paddingBottom(16),
                    Text(
                      "Expense Name",
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ).paddingBottom(5),
                    CustomTextField(
                      hintText: "Enter Expense Name",
                      isShowBorder: true,
                      focusNode: _nameFocus,
                      nextFocus: _descriptionFocus,
                      controller: _nameController,
                      inputType: TextInputType.name,
                    ).paddingBottom(16),
                    Text(
                      "Expense Description",
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ).paddingBottom(5),
                    CustomTextField(
                      hintText: "Enter Expense Description",
                      isShowBorder: true,
                      focusNode: _descriptionFocus,
                      nextFocus: _amountFocus,
                      controller: _descriptionController,
                    ).paddingBottom(16),
                    Text(
                      "Expense Amount",
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ).paddingBottom(5),
                    CustomTextField(
                      hintText: "Enter Amount Description",
                      isShowBorder: true,
                      focusNode: _amountFocus,
                      controller: _amountController,
                      inputType: TextInputType.number,
                    ).paddingBottom(16),
                    CustomButton(
                      btnTxt: "Save Expense",
                      backgroundColor: Theme.of(context).primaryColorDark,
                      onTap: () async {
                        String nameConroller = _nameController!.text.trim();
                        String description =
                            _descriptionController!.text.trim();
                        String amount = _amountController!.text.trim();

                        if (selectedPropertyId.isEmpty) {
                          showCustomSnackBar("Select Property");
                        } else if (nameConroller.isEmpty) {
                          showCustomSnackBar("Enter Expense Name");
                        } else if (description.isEmpty) {
                          showCustomSnackBar("Enter Expense Description");
                        } else if (amount.isEmpty) {
                          showCustomSnackBar("Enter Expense Amount");
                        } else {
                          await provider
                              .addExpense(
                            selectedPropertyId,
                            selectedEstateId,
                            nameConroller,
                            description,
                            amount,
                          )
                              .then((status) async {
                            if (status.isSuccess) {
                              widget.isExpenseAdded(true);
                              showCustomSnackBar(status.message,
                                  isError: false);
                              finish(context);
                            } else {
                              showCustomSnackBar(status.message);
                            }
                          });
                        }
                      },
                    )
                  ],
                ),
              ),
      );
    });
  }
}
