import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:hodi_app/logger.dart';
import 'package:hodi_app/models/data/getHouses/meter_houses.dart';
import 'package:hodi_app/models/data/properties/properties.dart';
import 'package:hodi_app/providers/authenticated_app_providers.dart';
import 'package:hodi_app/utils/color_resources.dart';
import 'package:hodi_app/utils/dimensions.dart';
import 'package:hodi_app/utils/images.dart';
import 'package:hodi_app/utils/styles.dart';
import 'package:hodi_app/widgets/base/custom_snackbar.dart';
import 'package:image_picker/image_picker.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';

import '../../../models/data/utility_bills/utility_bill.dart';
import '../../../widgets/base/custom_text_field.dart';
import 'image_picker_bottom_sheet.dart';

class AddMeterPage extends StatefulWidget {
  final Function(bool) isMeterAdded;

  const AddMeterPage({Key? key, required this.isMeterAdded}) : super(key: key);

  @override
  _AddMeterPageState createState() => _AddMeterPageState();
}

class _AddMeterPageState extends State<AddMeterPage> {
  int currStep = 0;
  List<Property> properties = [];
  List<Property> filteredProperties = [];

  List<UtilityBill> utilityBill = [];
  String selectedMeterdId = "";

  int selectedPropertyId = 0;
  String selectedPropertyNames = "";

  MeterHousesResponse? meterHousesResponse;
  String houseId = "";

  TextEditingController searchController = TextEditingController();
  final FocusNode _meterNumberFocus = FocusNode();
  final FocusNode _meterReadingFocus = FocusNode();

  TextEditingController? _meterReadingController;
  TextEditingController? _meterNumberController;
  GlobalKey<FormState>? _formKeyAddMeter;

  XFile? _selectedImage;
  String ImageBase64 = "";

  @override
  void initState() {
    Future.microtask(() => {
          fetchProperties(), // fetchHouses()
        });
    searchController.addListener(_onSearchChanged);
    _formKeyAddMeter = GlobalKey<FormState>();
    _meterReadingController = TextEditingController();
    _meterNumberController = TextEditingController();
    super.initState();
  }

  @override
  void dispose() {
    searchController.removeListener(_onSearchChanged);
    searchController.dispose();
    _meterReadingController!.dispose();
    _meterNumberController!.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    setState(() {
      filteredProperties = properties.where((property) {
        return property.name
            .toLowerCase()
            .contains(searchController.text.toLowerCase());
      }).toList();
    });
  }

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

  void fetchHouses() async {
    debugPrint(">>>>>>>>>fetchHouses<<<<<<<<<<");
    // if (selectedPropertyId != 0) {
    //   List<House> fetchedHouses =
    //       await Provider.of<AuthenticatedAppProviders>(context, listen: false)
    //           .getHouses(0, 1000, "", selectedPropertyId.toString(), "");
    //   setState(() {
    //     // houses = fetchedHouses;
    //   });
    // }
  }

  void getMeterHouses({required String billId}) async {
    debugPrint(">>>>>>>>>getMeterHouses<<<<<<<<<<");
    if (selectedPropertyId != 0) {
      MeterHousesResponse? getMeterHouses =
          await Provider.of<AuthenticatedAppProviders>(context, listen: false)
              .getMeterHouses(selectedPropertyId.toString(), billId);
      setState(() {
        meterHousesResponse = getMeterHouses!;
      });
    }
  }

  void getUtilityBill() async {
    debugPrint(">>>>>>>>>fetchHouses<<<<<<<<<<");
    if (selectedPropertyId != 0) {
      List<UtilityBill> fetchedUtilityBill =
          await Provider.of<AuthenticatedAppProviders>(context, listen: false)
              .getUtilityBill(selectedPropertyId.toString());

      final uniqueUtilityBill = fetchedUtilityBill.toSet().toList();

      setState(() {
        utilityBill = uniqueUtilityBill;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    bool _isLoading = false;

    return Consumer<AuthenticatedAppProviders>(
      builder: (context, provider, child) {
        List<Step> steps = [
          Step(
            title: Text(
              "Select Property",
              style: poppinsSemiBold.copyWith(
                color: Theme.of(context).primaryColor,
                fontSize: Dimensions.fontSizeDefault,
              ),
            ),
            content: provider.isLoading
                ? const Center(child: CircularProgressIndicator())
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Select Property",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ),
                      Text(
                        "Here is a list of your properties",
                        style: poppinsRegular.copyWith(
                          color: ColorResources.textGrey,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ).paddingBottom(16),

                      DropdownButton<String>(
                        value: selectedPropertyId != 0
                            ? selectedPropertyId.toString()
                            : null,
                        items: properties.map((Property property) {
                          return DropdownMenuItem<String>(
                            value: property.id.toString(),
                            child: Text(property.name),
                          );
                        }).toList(),
                        onChanged: (String? newValue) {
                          setState(() {
                            selectedPropertyId = int.parse(newValue!);
                            selectedPropertyNames = properties
                                .firstWhere((element) =>
                                    element.id == selectedPropertyId)
                                .name;
                          });
                        },
                        hint: const Text("Select Property"),
                        isExpanded: true,
                      ).paddingBottom(16),
                    ],
                  ),
            isActive: currStep == 0,
          ),
          Step(
            title: Text(
              "Select House",
              style: poppinsSemiBold.copyWith(
                color: Theme.of(context).primaryColor,
                fontSize: Dimensions.fontSizeDefault,
              ),
            ),
            content: provider.isLoading
                ? const Center(child: CircularProgressIndicator())
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Select Meter Type",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ),
                      RichText(
                        text: TextSpan(
                          text: "Here is a list of meters in the ",
                          style: poppinsRegular.copyWith(
                            color: ColorResources.textGrey,
                            fontSize: Dimensions.fontSizeDefault,
                          ),
                          children: [
                            TextSpan(
                              text: selectedPropertyNames,
                              style: poppinsSemiBold.copyWith(
                                color: Colors.blue,
                                // Change this to your desired color
                                fontSize: Dimensions.fontSizeDefault,
                              ),
                            ),
                          ],
                        ),
                      ).paddingBottom(16),
                      utilityBill.isEmpty
                          ? const Center(
                              child:
                                  Text("No meter found added for this estate"))
                          : DropdownButton<String>(
                              value: selectedMeterdId.isNotEmpty
                                  ? selectedMeterdId
                                  : null,
                              items: utilityBill.map((UtilityBill utilityBill) {
                                return DropdownMenuItem<String>(
                                  value: utilityBill.id,
                                  child: Text(utilityBill.name),
                                );
                              }).toList(),
                              onChanged: (String? newValue) {
                                setState(() {
                                  selectedMeterdId = newValue!;
                                  getMeterHouses(billId: newValue);
                                });
                              },
                              hint: const Text("Select Meter"),
                              isExpanded: true,
                            ).paddingBottom(16),
                      if (meterHousesResponse != null) ...[
                        meterHousesResponse!.houses.isEmpty
                            ? const Center(
                                child: Text("No Houses Found / All Houses have Meters"))
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    "Select House",
                                    style: poppinsSemiBold.copyWith(
                                      color: Theme.of(context).primaryColor,
                                      fontSize: Dimensions.fontSizeDefault,
                                    ),
                                  ),

                                  DropdownButton<String>(
                                    value: houseId.isNotEmpty
                                        ? houseId.toString()
                                        : null,
                                    items: meterHousesResponse!.houses.map((MeterHousesData house) {
                                      return DropdownMenuItem<String>(
                                        value: house.id,
                                        child: Text(house.name),
                                      );
                                    }).toList(),
                                    onChanged: (String? newValue) {
                                      setState(() {
                                        houseId = newValue!;
                                      });
                                    },
                                    hint: const Text("Select House"),
                                    isExpanded: true,
                                  ).paddingBottom(16),
                                ],
                              ),
                      ]
                    ],
                  ),
            isActive: currStep == 1,
          ),
          Step(
            title: Text(
              "Meter Reading",
              style: poppinsSemiBold.copyWith(
                color: Theme.of(context).primaryColor,
                fontSize: Dimensions.fontSizeDefault,
              ),
            ),
            content: provider.isLoading
                ? const Center(child: CircularProgressIndicator())
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Meter Reading",
                        style: poppinsSemiBold.copyWith(
                          color: Theme.of(context).primaryColor,
                          fontSize: Dimensions.fontSizeDefault,
                        ),
                      ),
                      RichText(
                        text: TextSpan(
                          text: "Enter meter reading for ",
                          style: poppinsRegular.copyWith(
                            color: ColorResources.textGrey,
                            fontSize: Dimensions.fontSizeDefault,
                          ),
                          children: [
                            TextSpan(
                              text: "${selectedPropertyNames} - ${houseId}",
                              style: poppinsSemiBold.copyWith(
                                color: Colors.blue,
                                // Change this to your desired color
                                fontSize: Dimensions.fontSizeDefault,
                              ),
                            ),
                          ],
                        ),
                      ).paddingBottom(16),
                      CustomTextField(
                        hintText: "Enter Meter Number",
                        isShowBorder: true,
                        focusNode: _meterNumberFocus,
                        nextFocus: _meterReadingFocus,
                        controller: _meterNumberController,
                        inputType: TextInputType.name,
                      ).paddingBottom(16),
                      CustomTextField(
                        hintText: "Enter Initail Meter Reading",
                        isShowBorder: true,
                        focusNode: _meterReadingFocus,
                        controller: _meterReadingController,
                        inputType: TextInputType.number,
                        isShowSuffixIcon: true,
                        isIcon: true,
                        suffixIconUrl: Images.cameraIcon,
                        onSuffixTap: () {
                          _showImagePickerBottomSheet(context);
                        },
                      ).paddingBottom(16),
                      if (_selectedImage != null)
                        Image.file(
                          File(_selectedImage!.path),
                          height: 200,
                          width: double.infinity,
                          fit: BoxFit.cover,
                        ).paddingBottom(16),
                    ],
                  ),
            isActive: currStep == 2,
          ),
          // Add other steps here
        ];

        return Consumer<AuthenticatedAppProviders>(
          builder: (context, provider, child) {
            return Scaffold(
              backgroundColor: Colors.white,
              appBar: AppBar(
                title: Text(
                  'Add Meter',
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
              body: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : Stepper(
                      steps: steps,
                      physics: BouncingScrollPhysics(),
                      type: StepperType.vertical,
                      currentStep: currStep,
                      controlsBuilder: (BuildContext context, cd) {
                        return Row(
                          mainAxisSize: MainAxisSize.max,
                          mainAxisAlignment: MainAxisAlignment.start,
                          children: <Widget>[
                            TextButton(
                              onPressed: () {
                                cd.onStepContinue!();
                              },
                              style: TextButton.styleFrom(
                                backgroundColor: Theme.of(context).primaryColor,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                              child: Text(
                                'CONTINUE',
                                style: poppinsBold.copyWith(
                                  color: Theme.of(context).primaryColorLight,
                                  fontSize: Dimensions.fontSizeDefault,
                                ),
                              ),
                            ),
                            SizedBox(width: 10),
                            TextButton(
                              onPressed: cd.onStepCancel,
                              style: TextButton.styleFrom(
                                backgroundColor: Colors.transparent,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                  side: BorderSide(color: Colors.red, width: 2),
                                ),
                              ),
                              child: Text(
                                'CANCEL',
                                style: poppinsBold.copyWith(
                                  color: Colors.red,
                                  fontSize: Dimensions.fontSizeDefault,
                                ),
                              ),
                            ),
                          ],
                        ).paddingOnly(top: 20);
                      },
                      onStepContinue: () {
                        setState(() {
                          if (currStep == 0) {
                            if (selectedPropertyId == 0) {
                              showCustomSnackBar("Please select a property");
                            } else {
                              getUtilityBill();
                              currStep = currStep + 1;
                            }
                          } else if (currStep == 1) {
                            if (selectedMeterdId.isEmpty) {
                              showCustomSnackBar("Please select a meter");
                            } else if (houseId.isEmpty) {
                              showCustomSnackBar("Please select a house");
                            } else {
                              currStep = currStep + 1;
                            }
                          } else if (currStep == 2) {
                            if (_meterNumberController!.text.isEmpty) {
                              showCustomSnackBar(
                                  "Please enter the meter number");
                            } else if (_meterReadingController!.text.isEmpty) {
                              showCustomSnackBar(
                                  "Please enter the initial meter reading");
                            } else if (_selectedImage == null) {
                              showCustomSnackBar("Please capture an image");
                            } else if (meterHousesResponse!.metreNos
                                .contains(_meterNumberController!.text)) {
                              showCustomSnackBar("Meter number already exists");
                            } else {
                              setState(() {
                                _isLoading = true;
                              });

                              String metreNo = _meterNumberController!.text;
                              String billId = selectedMeterdId;
                              String previousReading = "0";
                              String currentReading =
                                  _meterReadingController!.text;
                              String houseId = this.houseId;
                              String image = ImageBase64;
                              String descrition = "Initial Meter Reading";

                              provider
                                  .addMeterReading(
                                metreNo,
                                billId,
                                previousReading,
                                currentReading,
                                houseId,
                                image,
                                descrition,
                              )
                                  .then((value) {
                                setState(() {
                                  _isLoading = false;
                                });
                                if (value) {
                                  showCustomSnackBar(
                                      "Meter reading added successfully",
                                      isError: false);
                                  widget.isMeterAdded(true);
                                  Navigator.pop(context);
                                } else {
                                  showCustomSnackBar(
                                      "Failed to add meter reading");
                                }
                              });
                            }
                          } else {
                            finish(context);
                          }
                        });
                      },
                      onStepCancel: () {
                        finish(context);
                        setState(() {
                          if (currStep > 0) {
                            currStep = currStep - 1;
                          } else {
                            currStep = 0;
                          }
                        });
                      },
                      onStepTapped: (step) {
                        setState(() {
                          currStep = step;
                        });
                      },
                    ),
            );
          },
        );
      },
    );
  }

  void _showImagePickerBottomSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (context) {
        return ImagePickerBottomSheet(
          onImageSelected: (XFile image) async {
            logger.d('Image selected: ${image.path}');
            setState(() {
              _selectedImage = image;
              compressAndConvertToBase64(image).then((value) {
                logger.d('ImageBase64: $value');
                ImageBase64 = value;
              });
            });
            // await _extractTextFromImage(image);
          },
        );
      },
    );
  }

  Future<String> compressAndConvertToBase64(XFile image) async {
    final dir = await getTemporaryDirectory();
    final targetPath = '${dir.absolute.path}/temp.jpg';

    var result = await FlutterImageCompress.compressAndGetFile(
      image.path, targetPath, quality: 85, // Adjust quality as needed
    );

    if (result != null) {
      final bytes = await result.readAsBytes();
      return base64Encode(bytes);
    } else {
      throw Exception("Image compression failed");
    }
  }

}
