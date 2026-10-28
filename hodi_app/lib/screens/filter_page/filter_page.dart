import 'package:flutter/material.dart';
import 'package:hodi_app/models/data/authentication/login_response.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../logger.dart';
import '../../models/data/payment_types/payment_types.dart';
import '../../models/data/properties/properties.dart';
import '../../models/data/property_category/property_category.dart';
import '../../providers/auth_provider.dart';
import '../../providers/authenticated_app_providers.dart';
import '../../utils/color_resources.dart';
import '../../utils/dimensions.dart';
import '../../utils/styles.dart';
import '../../widgets/base/custom_button.dart';
import '../../widgets/base/custom_divider.dart';
import '../../widgets/date_range_picker.dart';

class FilterPage extends StatefulWidget {
  final Function(
    String selectedPropertyMonthNo,
    String selectedYear,
    String selectedPropertyId,
    String selectedPropertyCategoryId,
    String fromDate,
    String toDate,
    String selectedUsedStatus,
    String selectedPaymentType,
  ) onFilter;
  String propertyId;
  bool isHousesFilter;
  bool isCategoryFilter;
  bool isTenantsFilter;
  bool isInvoiceFilter;
  bool isExpenditureFilter;
  bool isExpenseFilter;
  bool isPaymentFilter;
  bool isPropertyFilter;
  bool isPaymentStatementFilter;
  bool isUtilityBillFilter;
  bool isEstateInvoiceFilter;
  bool isEstateInvoicePaymentFilter;

  FilterPage({
    Key? key,
    required this.propertyId,
    required this.onFilter,
    this.isCategoryFilter = false,
    this.isHousesFilter = false,
    this.isTenantsFilter = false,
    this.isInvoiceFilter = false,
    this.isExpenditureFilter = false,
    this.isExpenseFilter = false,
    this.isPaymentFilter = false,
    this.isPropertyFilter = false,
    this.isEstateInvoicePaymentFilter = false,
    this.isPaymentStatementFilter = false,
    this.isUtilityBillFilter = false,
    this.isEstateInvoiceFilter = false,
  }) : super(key: key);

  @override
  State<FilterPage> createState() => _FilterPageState();
}

class _FilterPageState extends State<FilterPage> {
  String selectedPropertyMonthName = "";
  String? selectedPropertyMonthNo;

  String selectedYear = "";
  String selectedPaymentType = "";
  String selectedUsedStatus = "";

  String selectedPropertyId = "";

  String selectedPropertyCategoryId = "";

  List<Property> properties = [];
  List<EstatePropertyCategory> estatePropertyCategory = [];
  List<PaymentTypeList> paymentTypeListItems = [];

  String selectedVacancyStatus = "";

  String fromDate = "";
  String toDate = "";

  LoginResponse? loginResponse;

  final List<Map<String, dynamic>> occupationList = [
    {'id': 0, 'name': 'Vacant'},
    {'id': 1, 'name': 'Occupied'}
  ];

  final List<Map<String, dynamic>> usedPaymentList = [
    {'isUsed': true, 'name': 'Used'},
    {'isUsed': false, 'name': 'Not Used'}
  ];

  final List<Map<String, dynamic>> monthList = [
    {'id': 1, 'name': 'January'},
    {'id': 2, 'name': 'February'},
    {'id': 3, 'name': 'March'},
    {'id': 4, 'name': 'April'},
    {'id': 5, 'name': 'May'},
    {'id': 6, 'name': 'June'},
    {'id': 7, 'name': 'July'},
    {'id': 8, 'name': 'August'},
    {'id': 9, 'name': 'September'},
    {'id': 10, 'name': 'October'},
    {'id': 11, 'name': 'November'},
    {'id': 12, 'name': 'December'}
  ];

  final List<String> yearList = [];

  TextEditingController? startDateController;
  TextEditingController? endDateController;

  void fetchProperties() async {
    List<Property> fetchedProperties =
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getBusinessProperties("");

    setState(() {
      properties = [
        Property(
            id: 0,
            name: "All Properties",
            email: "",
            estateId: 0,
            location: ""),
        ...fetchedProperties
      ];
    });
  }

  void getHouseCategoriesUnpaginated() async {
    List<EstatePropertyCategory> fetchedEstatePropertyCategory =
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getHouseCategoriesUnpaginated(
                loginResponse!.data.userDetails.estateId);

    setState(() {
      estatePropertyCategory = [
        EstatePropertyCategory(id: 0, name: "All Categories"),
        ...fetchedEstatePropertyCategory
      ];
    });
  }

  void getPaymentsTypeListUnpaginated() async {
    List<PaymentTypeList> paymentTypeList =
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getPaymentsTypeListUnpaginated(
                loginResponse!.data.userDetails.estateId);

    setState(() {
      paymentTypeListItems = [
        PaymentTypeList(id: 0, name: "All Payments"),
        ...paymentTypeList
      ];
    });
  }

  void _loadUserData() async {
    loginResponse = await Provider.of<AuthProvider>(context, listen: false)
        .getLoginResponse();

    logger.d("UserDetails: ${loginResponse!.data.userDetails.toJson()}");
  }

  @override
  void initState() {
    for (int i = 0; i < 3; i++) {
      yearList.add((DateTime.now().year - i).toString());
    }
    startDateController = TextEditingController();
    endDateController = TextEditingController();
    _loadUserData();
    Future.microtask(() {
      fetchProperties();

      if (widget.isPaymentStatementFilter &&
          loginResponse?.data.userDetails.estateId != null) {
        getPaymentsTypeListUnpaginated();
      }
      if (widget.isHousesFilter ||
          widget.isTenantsFilter ||
          widget.isPaymentFilter ||
          widget.isInvoiceFilter &&
              loginResponse?.data.userDetails.estateId != null) {
        getHouseCategoriesUnpaginated();
      }
    });
    super.initState();
  }

  @override
  void dispose() {
    super.dispose();
    startDateController?.dispose();
    endDateController?.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      child: Consumer<AuthenticatedAppProviders>(
        builder: (context, provider, child) {
          return provider.isLoading
              ? const SizedBox(
                  height: 100,
                  child: Center(
                    child: CircularProgressIndicator(),
                  ),
                )
              : Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    mainAxisAlignment: MainAxisAlignment.start,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Center(
                              child: Text(
                                'Filter',
                                style: poppinsBold.copyWith(
                                  fontSize: Dimensions.fontSizeLarge,
                                  color: ColorResources.colorNero,
                                ),
                              ),
                            ),
                          ),
                          IconButton(
                            icon: Icon(Icons.close),
                            onPressed: () {
                              Navigator.pop(context);
                            },
                          ),
                        ],
                      ),
                      const CustomDivider().paddingOnly(top: 16, bottom: 16),
                      widget.isCategoryFilter ||
                              widget.isHousesFilter ||
                              widget.isTenantsFilter ||
                              widget.isExpenditureFilter ||
                              widget.isExpenseFilter ||
                              widget.isPaymentFilter ||
                              widget.isPropertyFilter ||
                              widget.isUtilityBillFilter ||
                              widget.isInvoiceFilter && widget.propertyId.isNotEmpty
                          ? Visibility(
                              visible: false,
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Select Property',
                                    style: poppinsBold.copyWith(
                                      fontSize: Dimensions.fontSizeLarge,
                                      color: ColorResources.colorNero,
                                    ),
                                  ),
                                  DropdownButton<String>(
                                    value: selectedPropertyId == ""
                                        ? null
                                        : selectedPropertyId,
                                    items: properties.map((Property property) {
                                      return DropdownMenuItem<String>(
                                        value: property.id.toString(),
                                        child: Text(property.name),
                                      );
                                    }).toList(),
                                    onChanged: (String? newValue) {
                                      setState(() {
                                        selectedPropertyId = newValue!;
                                      });
                                    },
                                    hint: const Text("Select Property"),
                                    isExpanded: true,
                                  ).paddingBottom(16),
                                ],
                              ),
                          )
                          : Container(),

                      widget.isHousesFilter ||
                              widget.isTenantsFilter ||
                              widget.isPaymentFilter ||
                              widget.isInvoiceFilter
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Select Category',
                                  style: poppinsBold.copyWith(
                                    fontSize: Dimensions.fontSizeLarge,
                                    color: ColorResources.colorNero,
                                  ),
                                ),
                                DropdownButton<String>(
                                  value: selectedPropertyCategoryId == ""
                                      ? null
                                      : selectedPropertyCategoryId,
                                  items: estatePropertyCategory
                                      .map((EstatePropertyCategory category) {
                                    return DropdownMenuItem<String>(
                                      value: category.id.toString(),
                                      child: Text(category.name),
                                    );
                                  }).toList(),
                                  onChanged: (String? newValue) {
                                    setState(() {
                                      selectedPropertyCategoryId = newValue!;
                                    });
                                  },
                                  hint: const Text("Select Category"),
                                  isExpanded: true,
                                ).paddingBottom(16),
                              ],
                            )
                          : Container(),

                      //  widget.isHousesFilter
                      //      ? Column(
                      //    crossAxisAlignment: CrossAxisAlignment.start,
                      //    children: [
                      //      Text(
                      //        'Select Vacancy Status',
                      //        style: poppinsBold.copyWith(
                      //          fontSize: Dimensions.fontSizeLarge,
                      //          color: ColorResources.colorNero,
                      //        ),
                      //      ),
                      //      DropdownButton<String>(
                      //        value: selectedVacancyStatus == ""
                      //            ? null
                      //            : selectedVacancyStatus,
                      //        items: occupationList
                      //            .map((Map<String, dynamic> occupation) {
                      //          return DropdownMenuItem<String>(
                      //            value: occupation['id'].toString(),
                      //            child: Text(occupation['name']),
                      //          );
                      //        }).toList(),
                      //        onChanged: (String? newValue) {
                      //          setState(() {
                      //            selectedVacancyStatus = newValue!;
                      //          });
                      //        },
                      //        hint: const Text("Select Month"),
                      //        isExpanded: true,
                      //      ).paddingBottom(16),
                      //    ],
                      //  )
                      // : Container(),

                      widget.isInvoiceFilter
                          || widget.isPropertyFilter
                          || widget.isEstateInvoiceFilter
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                  Text(
                                    'Select Month',
                                    style: poppinsBold.copyWith(
                                      fontSize: Dimensions.fontSizeLarge,
                                      color: ColorResources.colorNero,
                                    ),
                                  ),
                                  DropdownButton<String>(
                                    value: selectedPropertyMonthName == ""
                                        ? null
                                        : selectedPropertyMonthName,
                                    items: monthList
                                        .map((Map<String, dynamic> month) {
                                      return DropdownMenuItem<String>(
                                        value: month['id'].toString(),
                                        child: Text(month['name']),
                                      );
                                    }).toList(),
                                    onChanged: (String? newValue) {
                                      setState(() {
                                        selectedPropertyMonthName = newValue!;
                                        selectedPropertyMonthNo = monthList
                                            .firstWhere((element) =>
                                                element['id'].toString() ==
                                                selectedPropertyMonthName)['id']
                                            .toString();
                                      });
                                    },
                                    hint: const Text("Select Month"),
                                    isExpanded: true,
                                  ).paddingBottom(16),
                                ])
                          : Container(),

                      widget.isInvoiceFilter
                          || widget.isPropertyFilter
                          || widget.isEstateInvoiceFilter
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                  Text(
                                    'Select year',
                                    style: poppinsBold.copyWith(
                                      fontSize: Dimensions.fontSizeLarge,
                                      color: ColorResources.colorNero,
                                    ),
                                  ),
                                  DropdownButton<String>(
                                    value: selectedYear == ""
                                        ? null
                                        : selectedYear,
                                    items: yearList.map((String year) {
                                      return DropdownMenuItem<String>(
                                        value: year,
                                        child: Text(year),
                                      );
                                    }).toList(),
                                    onChanged: (String? newValue) {
                                      setState(() {
                                        selectedYear = newValue!;
                                      });
                                    },
                                    hint: const Text("Select Year"),
                                    isExpanded: true,
                                  ).paddingBottom(16),
                                ])
                          : Container(),

                      widget.isPaymentStatementFilter
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                  Text(
                                    'Is Payment Used?',
                                    style: poppinsBold.copyWith(
                                      fontSize: Dimensions.fontSizeLarge,
                                      color: ColorResources.colorNero,
                                    ),
                                  ),
                                  DropdownButton<String>(
                                    value: selectedUsedStatus == ""
                                        ? null
                                        : selectedUsedStatus,
                                    items: usedPaymentList
                                        .map((Map<String, dynamic> payment) {
                                      return DropdownMenuItem<String>(
                                        value: payment['isUsed'].toString(),
                                        child: Text(payment['name']),
                                      );
                                    }).toList(),
                                    onChanged: (String? newValue) {
                                      setState(() {
                                        selectedUsedStatus = newValue!;
                                      });
                                    },
                                    hint: const Text("Select Status"),
                                    isExpanded: true,
                                  ).paddingBottom(16),
                                ])
                          : Container(),

                      widget.isPaymentStatementFilter
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                  Text(
                                    'Select Payment Type',
                                    style: poppinsBold.copyWith(
                                      fontSize: Dimensions.fontSizeLarge,
                                      color: ColorResources.colorNero,
                                    ),
                                  ),
                                  DropdownButton<String>(
                                    value: selectedPaymentType == ""
                                        ? null
                                        : selectedPaymentType,
                                    items: paymentTypeListItems
                                        .map((PaymentTypeList payment) {
                                      return DropdownMenuItem<String>(
                                        value: payment.id.toString(),
                                        child: Text(payment.name),
                                      );
                                    }).toList(),
                                    onChanged: (String? newValue) {
                                      setState(() {
                                        selectedPaymentType = newValue!;
                                      });
                                    },
                                    hint: const Text("Select Payment Type"),
                                    isExpanded: true,
                                  ).paddingBottom(16),
                                ])
                          : Container(),

                      widget.isExpenseFilter ||
                              widget.isPaymentStatementFilter ||
                              widget.isEstateInvoicePaymentFilter ||
                              widget.isPaymentFilter
                          ? Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                  Text(
                                    'Select Date Range',
                                    style: poppinsBold.copyWith(
                                      fontSize: Dimensions.fontSizeLarge,
                                      color: ColorResources.colorNero,
                                    ),
                                  ).paddingBottom(16),
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Column(
                                        children: [
                                          Text(
                                            'From',
                                            style: poppinsBold.copyWith(
                                              fontSize:
                                                  Dimensions.fontSizeLarge,
                                              color: ColorResources.colorNero,
                                            ),
                                          ),
                                          Container(
                                            width: MediaQuery.of(context)
                                                    .size
                                                    .width /
                                                2.5,
                                            decoration: BoxDecoration(
                                              color: ColorResources.borderColor,
                                              borderRadius:
                                                  BorderRadius.circular(10),
                                            ),
                                            child: TextField(
                                              controller: startDateController,
                                              enabled: false,
                                              textAlign: TextAlign.center,
                                              decoration: const InputDecoration(
                                                enabled: false,
                                                hintText: 'DD/MM/YYYY',
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                      Column(
                                        children: [
                                          Text(
                                            'To',
                                            style: poppinsBold.copyWith(
                                              fontSize:
                                                  Dimensions.fontSizeLarge,
                                              color: ColorResources.colorNero,
                                            ),
                                          ),
                                          Center(
                                            child: Container(
                                              width: MediaQuery.of(context)
                                                      .size
                                                      .width /
                                                  2.5,
                                              decoration: BoxDecoration(
                                                color:
                                                    ColorResources.borderColor,
                                                borderRadius:
                                                    BorderRadius.circular(10),
                                              ),
                                              child: Center(
                                                child: TextField(
                                                  controller: endDateController,
                                                  enabled: false,
                                                  textAlign: TextAlign.center,
                                                  decoration:
                                                      const InputDecoration(
                                                    hintText: 'DD/MM/YYYY',
                                                    alignLabelWithHint: true,
                                                  ),
                                                ),
                                              ),
                                            ),
                                          ),
                                        ],
                                      )
                                    ],
                                  ).paddingBottom(16).onTap(() async {
                                    var result =
                                        await CustomDateRangePicker.show(
                                            context,
                                            showEndDate: true);
                                    if (result.isNotEmpty) {
                                      setState(() {
                                        // Use the result from DateRangePicker
                                        var fromDate = result["fromDate"];
                                        var toDate = result["toDate"];
                                        this.fromDate = fromDate.toString();
                                        this.toDate = toDate.toString();
                                        startDateController?.text =
                                            fromDate.toString();
                                        endDateController?.text =
                                            toDate.toString();
                                        logger.d(
                                            "From Date: $fromDate, To Date: $toDate");
                                        // Do something with fromDate and toDate
                                      });
                                    }
                                  }),
                                ])
                          : Container(),

                      const CustomDivider().paddingOnly(top: 16, bottom: 16),
                      CustomButton(
                        btnTxt: "Filter",
                        backgroundColor: Theme.of(context).primaryColorDark,
                        onTap: () async {
                          widget.onFilter(
                            selectedPropertyMonthNo ?? "",
                            selectedYear ?? "",
                            selectedPropertyId == "0" ? "" : selectedPropertyId,
                            selectedPropertyCategoryId == "0"
                                ? ""
                                : selectedPropertyCategoryId,
                            fromDate ?? "",
                            toDate ?? "",
                            selectedUsedStatus ?? "",
                            selectedPaymentType == "0" ? "" : selectedPaymentType,
                          );
                          finish(context);
                        },
                      )
                    ],
                  ),
                );
        },
      ),
    );
  }
}
