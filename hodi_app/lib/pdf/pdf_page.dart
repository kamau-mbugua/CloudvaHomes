import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_pdfview/flutter_pdfview.dart';
import 'package:share_plus/share_plus.dart';

class PdfPreviewScreen extends StatefulWidget {
  final String pdfPath;

  PdfPreviewScreen({required this.pdfPath});

  @override
  State<PdfPreviewScreen> createState() => _PdfPreviewScreenState();
}

class _PdfPreviewScreenState extends State<PdfPreviewScreen> {
  void sharePdf(File file) {
    // Share.shareXFiles([file.path], text: 'Here is your invoice');
    // shareFiles([file.path], text: 'Here is your invoice');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text("PDF Preview"),
      ),
      body: PDFView(
        filePath: widget.pdfPath,
      ),
    );
  }
}