import 'dart:io';

import 'package:hodi_app/services/pdf/pdf_api.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart';
import 'package:flutter/services.dart' show ByteData, Uint8List, rootBundle;
import '../../models/data/invoice/invoice_details.dart';
import '../../models/data/payment_types/payment_detail.dart';
import '../../utils/images.dart';


class PDFPaymentApi {
  static Future<File> generatePayment(PaymentDetailData invoice) async {
    final pdf = Document();
    final header = await buildHeader(invoice);

    pdf.addPage(
      MultiPage(
        build: (context) => [
          header,
        ],
        footer: (context) => buildFooter(invoice),
      ),
    );

    return PdfApi.saveDocument(name: '${invoice.rrn}.pdf', pdf: pdf);
  }

  static Future<Widget> buildHeader(PaymentDetailData invoiceDataResponse) async {
    final ByteData bytes = await rootBundle.load(Images.logo);
    final Uint8List logoData = bytes.buffer.asUint8List();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              "${invoiceDataResponse.month} RECEIPT",
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 24,
              ),
            ),
          ],
        ),
        SizedBox(height: 20),
        Divider(),
        // Invoice Information
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Left Column
            Expanded(
              flex: 2,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Image(MemoryImage(logoData), height: 100, width: 100),
                  SizedBox(height: 10),
                  Text(
                    "Paid By: ${invoiceDataResponse?.tenantName}",
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text("Mobile: ${invoiceDataResponse?.tenantPhone}"),
                  Text("Email: ${invoiceDataResponse?.tenantEmail}"),
                  Text("House #: ${invoiceDataResponse?.houseNumber}"),
                ],
              ),
            ),

            // Right Column
            Expanded(
              flex: 1,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "${invoiceDataResponse?.estateName}",
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text("${invoiceDataResponse?.propertyName}"),
                  Text("${invoiceDataResponse?.location}"),
                  SizedBox(height: 10),
                  Text(
                    "RECEIPT #: ${invoiceDataResponse?.rrn}",
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(
                    "Status : ${invoiceDataResponse?.status}",
                    style: TextStyle(
                      color: PdfColors.green,
                    ),
                  ),
                  Text("Paid On: ${invoiceDataResponse?.date}"),
                  Text("Payment Type: ${invoiceDataResponse?.paymentType}"),
                ],
              ),
            ),
          ],
        ),
        SizedBox(height: 20),
        Divider(),
        // Table Section
        Table(
          border: TableBorder.all(color: PdfColors.grey),
          columnWidths: const {
            0: FlexColumnWidth(2),
            1: FlexColumnWidth(1),
          },
          children: [
            TableRow(
              decoration: BoxDecoration(color: PdfColors.grey300),
              children: [
                Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(
                    "Item Description",
                    style: TextStyle(
                        fontWeight: FontWeight.bold, color: PdfColors.red),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(
                    "Amount(${invoiceDataResponse.currency})",
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontWeight: FontWeight.bold, color: PdfColors.red),
                  ),
                ),
              ],
            ),
            ...invoiceDataResponse?.bills.map((bill) {
              return TableRow(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Text(bill.narration,
                        style: TextStyle(
                            fontWeight: FontWeight.normal,
                            color: PdfColors.blue)),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Text(bill.value,
                        textAlign: TextAlign.right,
                        style: TextStyle(
                            fontWeight: FontWeight.normal,
                            color: PdfColors.blue)),
                  ),
                ],
              );
            }).toList() ??
                [],
            TableRow(
              decoration: BoxDecoration(color: PdfColors.grey300),
              children: [
                Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(
                    "Balance",
                    style: TextStyle(
                        fontWeight: FontWeight.bold, color: PdfColors.blue),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(8.0),
                  child: Text(
                    invoiceDataResponse!.rentOwed.toString() ?? '0',
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontWeight: FontWeight.bold, color: PdfColors.blue),
                  ),
                ),
              ],
            ),
          ],
        ),
        Divider(),
        SizedBox(height: 20),
        Container(
          height: 70,
          width: 70,
          child: BarcodeWidget(
            barcode: Barcode.qrCode(),
            data: invoiceDataResponse.rrn,
          ),
        )
      ],
    );
  }


  static Widget buildFooter(PaymentDetailData invoice) => Column(
    crossAxisAlignment: CrossAxisAlignment.center,
    children: [
      Divider(),
      SizedBox(height: 2 * PdfPageFormat.mm),
      buildSimpleText(title: 'Contact Phone', value: invoice.contactNo),
      SizedBox(height: 1 * PdfPageFormat.mm),
      buildSimpleText(title: 'Contact Email', value: invoice.contactEmail),
      SizedBox(height: 1 * PdfPageFormat.mm),
      buildSimpleText(title: 'Powered By' , value: "Quantumnex Solutions"),
    ],
  );

  static buildSimpleText({
    required String title,
    required String value,
  }) {
    final style = TextStyle(fontWeight: FontWeight.bold);

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(title, style: style),
        SizedBox(width: 2 * PdfPageFormat.mm),
        Text(value),
      ],
    );
  }
}