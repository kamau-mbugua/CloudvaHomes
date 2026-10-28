import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

class CustomConfirmationDialog extends StatelessWidget {
  final String title;
  final String content;
  final String confirmText;
  final String cancelText;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;
  final bool isSingleAction;
  final bool isNoAction;

  const CustomConfirmationDialog({
    Key? key,
    required this.title,
    required this.content,
    required this.confirmText,
    required this.cancelText,
    required this.onConfirm,
    required this.onCancel,
    this.isSingleAction = false,
    this.isNoAction = false,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: SizedBox(
        width: 400,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: 20),
          CircleAvatar(
            radius: 30,
            backgroundColor: Theme.of(context).primaryColor,
            child: const Icon(Icons.contact_support, size: 50),
          ),
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Text(title, style: TextStyle(fontWeight: FontWeight.bold), textAlign: TextAlign.center),
          ),
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Text(content, textAlign: TextAlign.center),
          ),
          Container(height: 0.5, color: Theme.of(context).hintColor),

          if(!isNoAction) ...[
            !isSingleAction ? Row(children: [
              Expanded(child: InkWell(
                onTap: onConfirm,
                child: Container(
                  padding: const EdgeInsets.all(16.0),
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(borderRadius: BorderRadius.only(bottomLeft: Radius.circular(10))),
                  child: Text(confirmText, style: TextStyle(color: Theme.of(context).primaryColor, fontWeight: FontWeight.bold)),
                ),
              )),

              Expanded(child: InkWell(
                onTap: onCancel,
                child: Container(
                  padding: const EdgeInsets.all(16.0),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Theme.of(context).primaryColor,
                    borderRadius: const BorderRadius.only(bottomRight: Radius.circular(10)),
                  ),
                  child: Text(cancelText, style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              )),
            ])
                : Padding(
              padding: const EdgeInsets.all(16.0),
              child: InkWell(
                onTap: onConfirm,
                child: Container(
                  padding: const EdgeInsets.all(16.0),
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(borderRadius: BorderRadius.only(bottomLeft: Radius.circular(10), bottomRight: Radius.circular(10))),
                  child: Text(confirmText, style: TextStyle(color: Theme.of(context).primaryColor, fontWeight: FontWeight.bold)),
                ),
              ),
            ),
          ]

        ]),
      ),
    );
  }
}