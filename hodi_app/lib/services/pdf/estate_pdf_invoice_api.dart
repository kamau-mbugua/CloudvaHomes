import 'dart:io';

import 'package:hodi_app/services/pdf/pdf_api.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart';
import 'package:flutter/services.dart' show ByteData, Uint8List, rootBundle;
import '../../models/data/estate_invoices/estate_invoice_detail.dart';
import '../../models/data/invoice/invoice_details.dart';
import '../../utils/images.dart';

class PdfEstateInvoiceApi {
  static Future<File> generateInvoice(EstateInvoiceDataResponse invoice) async {
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

  static Widget buildFooter(EstateInvoiceDataResponse invoice) => Column(
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

  static Future<Widget> buildHeader(EstateInvoiceDataResponse invoiceDataResponse) async {
    final ByteData bytes = await rootBundle.load(Images.logo);
    final Uint8List logoData = bytes.buffer.asUint8List();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              "${invoiceDataResponse.month} Estate Invoice",
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
                    "INVOICE TO: ${invoiceDataResponse?.tenantName}",
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text("Mobile: ${invoiceDataResponse?.tenantPhone}"),
                  Text("Email: ${invoiceDataResponse?.tenantEmail}"),
                  Text("Estate #: ${invoiceDataResponse?.estateName}"),
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
                  Text("${invoiceDataResponse?.appName}"),
                  Text("${invoiceDataResponse?.location}"),
                  SizedBox(height: 10),
                  Text(
                    "INVOICE #: ${invoiceDataResponse?.rrn}",
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(
                    "Status: ${invoiceDataResponse?.status}",
                    style: TextStyle(
                      color: invoiceDataResponse?.status.toLowerCase() != "paid"
                          ? PdfColors.red
                          : PdfColors.green,
                    ),
                  ),
                  Text("Issued On: ${invoiceDataResponse?.date}"),
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
              decoration: BoxDecoration(color: PdfColors.blue50),
              children: [
                Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(
                    "Property",
                    style: TextStyle(fontWeight: FontWeight.bold, color: PdfColors.red),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(
                    "Total Units",
                    textAlign: TextAlign.right,
                    style: TextStyle(fontWeight: FontWeight.bold, color: PdfColors.red),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(
                    "Occupied Units",
                    style: TextStyle(fontWeight: FontWeight.bold, color: PdfColors.red),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(
                    "Total Rent",
                    textAlign: TextAlign.right,
                    style: TextStyle(fontWeight: FontWeight.bold, color: PdfColors.red),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(
                    "Commission",
                    style: TextStyle(fontWeight: FontWeight.bold, color: PdfColors.red),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(
                    "Amount",
                    textAlign: TextAlign.right,
                    style: TextStyle(fontWeight: FontWeight.bold, color: PdfColors.red),
                  ),
                ),
              ],
            ),
            ...invoiceDataResponse?.bills.map((bill) {
              return TableRow(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Text(bill.narration, style: TextStyle(fontWeight: FontWeight.normal, color: PdfColors.blue)),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Text(
                      bill.units,
                      textAlign: TextAlign.right,
                      style: TextStyle(fontWeight: FontWeight.normal, color: PdfColors.blue),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Text(
                      bill.occupiedUnits,
                      textAlign: TextAlign.right,
                      style: TextStyle(fontWeight: FontWeight.normal, color: PdfColors.blue),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Text(
                      bill.totalRent,
                      textAlign: TextAlign.right,
                      style: TextStyle(fontWeight: FontWeight.normal, color: PdfColors.blue),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Text(
                      bill.commission,
                      textAlign: TextAlign.right,
                      style: TextStyle(fontWeight: FontWeight.normal, color: PdfColors.blue),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Text(
                      bill.value,
                      textAlign: TextAlign.right,
                      style: TextStyle(fontWeight: FontWeight.normal, color: PdfColors.blue),
                    ),
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
                    "Total",
                    style: TextStyle(fontWeight: FontWeight.bold, color: PdfColors.blue),
                  ),
                ),
                 Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(""),
                ),
                 Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(""),
                ),
                 Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(""),
                ),
                 Padding(
                  padding: EdgeInsets.all(8.0),
                  child: Text(""),
                ),
                Padding(
                  padding: const EdgeInsets.all(8.0),
                  child: Text(
                    invoiceDataResponse?.bills.fold(0, (sum, bill) => sum + int.parse(bill.value)).toString() ?? '0',
                    textAlign: TextAlign.right,
                    style:  TextStyle(fontWeight: FontWeight.bold, color: PdfColors.blue),
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
}