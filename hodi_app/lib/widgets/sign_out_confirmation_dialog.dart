import 'package:flutter/material.dart';
import 'package:hodi_app/route/routes.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../utils/dimensions.dart';
import '../utils/styles.dart';

class SignOutConfirmationDialog extends StatelessWidget {
  const SignOutConfirmationDialog({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: SizedBox(
        width: 300,
        child: Consumer<AuthProvider>(builder: (context, auth, child) {
          return Column(mainAxisSize: MainAxisSize.min, children: [

            const SizedBox(height: 20),
            CircleAvatar(
              radius: 30,
              backgroundColor: Theme.of(context).primaryColor,
              child: const Icon(Icons.contact_support, size: 50),
            ),

            Padding(
              padding: const EdgeInsets.all(Dimensions.paddingSizeLarge),
              child: Text("Are you sure you want to sign out?", style: rubikBold, textAlign: TextAlign.center),
            ),

            Container(height: 0.5, color: Theme.of(context).hintColor),

            !auth.isLoading ? Row(children: [

              Expanded(child: InkWell(
                onTap: () {
                  Provider.of<AuthProvider>(context, listen: false).clearSharedData(context).then((condition) {
                    Navigator.pushNamedAndRemoveUntil(context, AppRoutes.getSplashPageRoute(), (route) => false);
                  });
                },
                child: Container(
                  padding: const EdgeInsets.all(Dimensions.paddingSizeSmall),
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(borderRadius: BorderRadius.only(bottomLeft: Radius.circular(10))),
                  child: Text("YES", style: rubikBold.copyWith(color: Theme.of(context).primaryColor)),
                ),
              )),

              Expanded(child: InkWell(
                onTap: () => Navigator.pop(context),
                child: Container(
                  padding: const EdgeInsets.all(Dimensions.paddingSizeSmall),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Theme.of(context).primaryColor,
                    borderRadius: const BorderRadius.only(bottomRight: Radius.circular(10)),
                  ),
                  child: Text("NO", style: rubikBold.copyWith(color: Colors.white)),
                ),
              )),

            ]) : Padding(
              padding: const EdgeInsets.all(Dimensions.paddingSizeSmall),
              child: CircularProgressIndicator(valueColor: AlwaysStoppedAnimation<Color>(Theme.of(context).primaryColor)),
            ),
          ]);
        }),
      ),
    );
  }
}
