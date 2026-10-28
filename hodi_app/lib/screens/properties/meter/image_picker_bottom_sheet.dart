import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../utils/color_resources.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';

class ImagePickerBottomSheet extends StatelessWidget {
  final Function(XFile) onImageSelected;

  const ImagePickerBottomSheet({required this.onImageSelected});

  Future<void> _pickImage(ImageSource source) async {
    final ImagePicker _picker = ImagePicker();
    final XFile? image = await _picker.pickImage(source: source);
    if (image != null) {
      onImageSelected(image);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.25,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Text(
              'Select Image Source',
              style: poppinsSemiBold.copyWith(
              fontSize: Dimensions.fontSizeDefault,
              color: ColorResources.textBlue,
            ),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.camera),
            title: Text(
              'Open Camera',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeDefault,
                color: ColorResources.textBlue,
              ),
            ),
            onTap: () async {
              _pickImage(ImageSource.camera);
              Navigator.pop(context);
            },
          ),
          ListTile(
            leading: Icon(Icons.photo_library),
            title: Text(
              'Open Gallery',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeDefault,
                color: ColorResources.textBlue,
              ),
            ),
            onTap: () async {
              _pickImage(ImageSource.gallery);
              Navigator.pop(context);
            },
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
            },
            child: Text(
              'Cancel',
              style: poppinsBold.copyWith(
                fontSize: Dimensions.fontSizeDefault,
                color: ColorResources.textBlue,
              ),
            ),
          ),
        ],
      ),
    );
  }
}