import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:hodi_app/logger.dart';
import 'package:hodi_app/models/data/getHouses/house_data.dart';
import 'package:hodi_app/models/data/getHouses/meter_houses.dart';
import 'package:hodi_app/models/data/properties/properties.dart';
import 'package:hodi_app/providers/authenticated_app_providers.dart';
import 'package:hodi_app/utils/color_resources.dart';
import 'package:hodi_app/utils/dimensions.dart';
import 'package:hodi_app/utils/images.dart';
import 'package:hodi_app/utils/styles.dart';
import 'package:hodi_app/viewmodel/meter_added_view_model.dart';
import 'package:image_picker/image_picker.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';

import '../../../models/data/getMetres/get_metres.dart';
import '../../../models/data/utility_bills/utility_bill.dart';
import '../../../widgets/base/custom_button.dart';
import '../../../widgets/base/custom_snackbar.dart';
import '../../../widgets/base/custom_text_field.dart';
import 'image_picker_bottom_sheet.dart';

class UpdateMeterReadingPage extends StatefulWidget {
  final String? metreId;
  final String? houseName;
  final String? metreNo;
  final MetrePaymentContent? metrePaymentContent;

  const UpdateMeterReadingPage(
      {Key? key,
      required this.metreId,
      required this.houseName,
      required this.metreNo,
      required this.metrePaymentContent
      })
      : super(key: key);

  @override
  _UpdateMeterReadingPageState createState() => _UpdateMeterReadingPageState();
}

class _UpdateMeterReadingPageState extends State<UpdateMeterReadingPage> {
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
  final FocusNode _meterDescrtiptionFocus = FocusNode();
  final FocusNode _meterReadingFocus = FocusNode();

  TextEditingController? _meterReadingController;
  TextEditingController? _previousMeterReadingController;
  TextEditingController? _meterDescrtiptionController;
  GlobalKey<FormState>? _formKeyAddMeter;

  XFile? _selectedImage;
  String ImageBase64 = "";
  double consumed = 0.0;
  double totalAmount = 0.0;

  @override
  void initState() {
    _formKeyAddMeter = GlobalKey<FormState>();
    _meterReadingController = TextEditingController();
    _meterDescrtiptionController = TextEditingController();
    _previousMeterReadingController = TextEditingController(text: widget.metrePaymentContent!.previousReading.toString());
    logger.d(
        "_UpdateMeterReadingPageState: Item clicked and data is ${widget.metreId}");
    super.initState();
  }

  @override
  void dispose() {
    _meterReadingController!.dispose();
    _meterDescrtiptionController!.dispose();
    _previousMeterReadingController!.dispose();
    super.dispose();
  }



  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.of(context).size.width;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(
          'Record Meter Reading',
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
      body: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(Dimensions.paddingSizeLarge),
              child: Center(
                child: Container(
                  width: width > 700 ? 700 : width,
                  padding: width > 700
                      ? const EdgeInsets.all(Dimensions.paddingSizeDefault)
                      : null,
                  decoration: width > 700
                      ? BoxDecoration(
                          color: Theme.of(context).canvasColor,
                          borderRadius: BorderRadius.circular(10),
                          boxShadow: [
                            BoxShadow(
                                color: Theme.of(context).shadowColor,
                                blurRadius: 5,
                                spreadRadius: 1)
                          ],
                        )
                      : null,
                  child: Consumer<AuthenticatedAppProviders>(
                    builder: (context, authProvider, child) => Form(
                      key: _formKeyAddMeter,
                      child: Column(
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
                              text: "Enter current meter reading for ",
                              style: poppinsRegular.copyWith(
                                color: ColorResources.textGrey,
                                fontSize: Dimensions.fontSizeDefault,
                              ),
                              children: [
                                TextSpan(
                                  text:
                                      "${widget.houseName} - ${widget.metreId} - ${widget.metreNo}",
                                  style: poppinsSemiBold.copyWith(
                                    color: Colors.blue,
                                    fontSize: Dimensions.fontSizeDefault,
                                  ),
                                ),
                              ],
                            ),
                          ).paddingBottom(16),
                          const SizedBox(height: 35),
                          Text(
                            "Previous Reading",
                            style: poppinsRegular.copyWith(
                                fontSize: Dimensions.fontSizeDefault,
                                color:
                                    ColorResources.getHintColor(context)),
                          ),
                          const SizedBox(
                              height: Dimensions.paddingSizeSmall),
                          CustomTextField(
                            isShowBorder: true,
                            hintText: widget.metrePaymentContent!.previousReading.toString(),
                            controller: _previousMeterReadingController,
                            inputType: TextInputType.number,
                            isEnabled: false,
                          ).paddingBottom(16),

                          Text(
                            "Meter Reading",
                            style: poppinsRegular.copyWith(
                                fontSize: Dimensions.fontSizeDefault,
                                color:
                                    ColorResources.getHintColor(context)),
                          ),
                          const SizedBox(
                              height: Dimensions.paddingSizeSmall),
                          CustomTextField(
                            hintText: "Enter Meter Reading",
                            isShowBorder: true,
                            focusNode: _meterReadingFocus,
                            nextFocus: _meterDescrtiptionFocus,
                            controller: _meterReadingController,
                            inputType: TextInputType.number,
                            isShowSuffixIcon: true,
                            isIcon: true,
                            suffixIconUrl: Images.cameraIcon,
                            onSuffixTap: () {
                              _showImagePickerBottomSheet(context);
                            },
                              onChanged: (value) {
                                if (value.isEmpty) {
                                  setState(() {
                                    this.consumed = 0;
                                    this.totalAmount = 0;
                                  });
                                } else {
                                  var consumed = int.parse(value) - widget.metrePaymentContent!.previousReading;
                                  var totalAmount = consumed * widget.metrePaymentContent!.amount;
                                  setState(() {
                                    this.consumed = consumed;
                                    this.totalAmount = totalAmount;
                                  });
                                }
                              },
                          ).paddingBottom(16),
                          Text(
                            "Description",
                            style: poppinsRegular.copyWith(
                                fontSize: Dimensions.fontSizeDefault,
                                color:
                                    ColorResources.getHintColor(context)),
                          ),
                          const SizedBox(
                              height: Dimensions.paddingSizeSmall),
                          CustomTextField(
                            hintText: "Description (optional)",
                            isShowBorder: true,
                            focusNode: _meterDescrtiptionFocus,
                            controller: _meterDescrtiptionController,
                            inputType: TextInputType.name,
                            maxLines: 5,
                          ).paddingBottom(16),
                          if (_selectedImage != null)
                            Image.file(
                              File(_selectedImage!.path),
                              height: 200,
                              width: double.infinity,
                              fit: BoxFit.cover,
                            ).paddingBottom(16),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              authProvider
                                      .updateMeterErrorMessage!.isNotEmpty
                                  ? CircleAvatar(
                                      backgroundColor:
                                          Theme.of(context).primaryColor,
                                      radius: 5)
                                  : const SizedBox.shrink(),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  authProvider.updateMeterErrorMessage ??
                                      "",
                                  style: Theme.of(context)
                                      .textTheme
                                      .displayMedium!
                                      .copyWith(
                                        fontSize: Dimensions.fontSizeSmall,
                                        color:
                                            Theme.of(context).primaryColor,
                                      ),
                                ),
                              )
                            ],
                          ),

                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                            children: [
                              TextButton(
                                onPressed: () {
                                },
                                style: TextButton.styleFrom(
                                  backgroundColor: Colors.transparent,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(10),
                                    side: BorderSide(color: Colors.grey.shade500, width: 2),
                                  ),
                                ),
                                child:RichText(
                                  text: TextSpan(
                                    text: "Charge/Unit: ",
                                    style: poppinsRegular.copyWith(
                                      color: ColorResources.textGrey,
                                      fontSize: Dimensions.fontSizeDefault,
                                    ),
                                    children: [
                                      TextSpan(
                                        text:
                                        "KES ${widget.metrePaymentContent!.amount}",
                                        style: poppinsSemiBold.copyWith(
                                          color: Colors.blue,
                                          fontSize: Dimensions.fontSizeDefault,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              TextButton(
                                onPressed: () {

                                },
                                style: TextButton.styleFrom(
                                  backgroundColor: Colors.transparent,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(10),
                                    side: BorderSide(color: Colors.grey.shade500, width: 2),
                                  ),
                                ),
                                child:  RichText(
                                  text: TextSpan(
                                    text: "Consumed: ",
                                    style: poppinsRegular.copyWith(
                                      color: ColorResources.textGrey,
                                      fontSize: Dimensions.fontSizeDefault,
                                    ),
                                    children: [
                                      TextSpan(
                                        text:
                                        "${consumed} Units",
                                        style: poppinsSemiBold.copyWith(
                                          color: Colors.blue,
                                          fontSize: Dimensions.fontSizeDefault,
                                        ),
                                      ),
                                    ],
                                  ),
                                ) ,
                              ),
                            ],
                          ),
                          Center(
                            child: TextButton(
                              onPressed: () {

                              },
                              style: TextButton.styleFrom(
                                backgroundColor: Colors.transparent,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                  side: BorderSide(color: Colors.grey.shade500, width: 2),
                                ),
                              ),
                              child:    RichText(
                                text: TextSpan(
                                  text: "Total Amount: ",
                                  style: poppinsRegular.copyWith(
                                    color: ColorResources.textGrey,
                                    fontSize: Dimensions.fontSizeDefault,
                                  ),
                                  children: [
                                    TextSpan(
                                      text:
                                      "KES ${totalAmount}",
                                      style: poppinsSemiBold.copyWith(
                                        color: Colors.blue,
                                        fontSize: Dimensions.fontSizeDefault,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          // for login button
                          const SizedBox(height: 10),
                          !authProvider.isLoading
                              ? CustomButton(
                                  btnTxt: "Submit",
                                  backgroundColor:
                                      Theme.of(context).primaryColorDark,
                                  onTap: () async {
                                    if (_meterReadingController!
                                        .text.isEmpty) {
                                      showCustomSnackBar(
                                          "Meter Reading is required");
                                      return;
                                    }

                                    if (widget.metreId.isEmptyOrNull) {
                                      showCustomSnackBar(
                                          "Meter Id is required");
                                      return;
                                    }

                                    if (ImageBase64.isEmptyOrNull) {
                                      showCustomSnackBar(
                                          "Meter Image is required");
                                      return;
                                    }

                                    //modify ImageBase64 to include this formart "data:image/imegFileType;base64,ImageBase64"
                                    var imageType = _selectedImage!.path.split('.').last;
                                    ImageBase64 = "data:image/$imageType;base64,$ImageBase64";


                                    // if (!imageType.isEmptyOrNull) {
                                    //   logger.d("ImageBase64: $ImageBase64");
                                    //   logger.d(imageType);
                                    //   return;
                                    // }

                                    authProvider
                                        .updateMeterReading(
                                      widget.metreId!,
                                      _meterDescrtiptionController!.text,
                                      _meterReadingController!.text,
                                      ImageBase64,
                                    )
                                        .then((status) async {
                                      if (status.isSuccess) {
                                        showCustomSnackBar(status.message);
                                        Provider.of<MeterAddedViewModel>(context, listen: false).onMeterAdded();
                                        // Navigator.pop(context);
                                      } else {
                                        showCustomSnackBar(status.message);
                                      }
                                    });
                                  },
                                )
                              : Center(
                                  child: CircularProgressIndicator(
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                      Theme.of(context).primaryColor),
                                )),

                          // for create an account
                          const SizedBox(height: 20),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
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
