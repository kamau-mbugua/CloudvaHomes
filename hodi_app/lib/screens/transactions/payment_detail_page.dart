import 'dart:io';

import 'package:flutter/material.dart';
import 'package:hodi_app/logger.dart';
import 'package:hodi_app/services/pdf/payment_api.dart';
import 'package:hodi_app/utils/images.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:provider/provider.dart';

import '../../../models/data/invoice/invoice_details.dart';
import '../../../providers/authenticated_app_providers.dart';
import '../../../route/routes.dart';
import '../../../utils/color_resources.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../models/data/payment_types/payment_detail.dart';
import '../../services/pdf/pdf_api.dart';
import '../../services/pdf/pdf_invoice_api.dart';

class PaymentDetailPage extends StatefulWidget {
  final String paymentRef;
  PaymentDetailPage({super.key, required this.paymentRef});
  @override
  State<PaymentDetailPage> createState() => _PaymentDetailPageState();
}

class _PaymentDetailPageState extends State<PaymentDetailPage> {
  PaymentDetailData? invoiceDataResponse;

  @override
  void initState() {
    Future.microtask(() {
      fetchDetails(widget.paymentRef);
    });
    super.initState();
  }

  Future<void> fetchDetails(String paymentRef) async{
   await Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .getPaymentDetail(paymentRef)
        .then((value) {
      if(value != null){
        setState(() {
          invoiceDataResponse = value;
        });
      }
    });
  }


  Future<File> generatePdf(PaymentDetailData invoiceDataResponse) async {
    final pdf = pw.Document();

    pdf.addPage(
      pw.Page(
        build: (pw.Context context) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text("Payment Detail", style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold)),
              pw.SizedBox(height: 20),
              pw.Text("INVOICE TO: ${invoiceDataResponse.tenantName}", style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
              pw.Text("Mobile: ${invoiceDataResponse.tenantPhone}"),
              pw.Text("Email: ${invoiceDataResponse.tenantEmail}"),
              pw.Text("House #: ${invoiceDataResponse.houseNumber}"),
              pw.SizedBox(height: 20),
              pw.Text("Estate: ${invoiceDataResponse.estateName}"),
              pw.Text("Property: ${invoiceDataResponse.propertyName}"),
              pw.Text("Location: ${invoiceDataResponse.location}"),
              pw.Text("INVOICE #: ${invoiceDataResponse.rrn}", style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
              pw.Text("Status: ${invoiceDataResponse.status}", style: pw.TextStyle(color: PdfColors.red)),
              pw.Text("Issued On: ${invoiceDataResponse.date}"),
              pw.SizedBox(height: 20),
              pw.Table.fromTextArray(
                headers: ["Item Description", "Amount"],
                data: invoiceDataResponse.bills.map((bill) => [bill.narration, bill.value]).toList(),
              ),
              pw.SizedBox(height: 10),
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Text("Balance", style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                  pw.Text(invoiceDataResponse.rentOwed, style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                ],
              ),
            ],
          );
        },
      ),
    );

    final output = await getTemporaryDirectory();
    final file = File("${output.path}/invoice.pdf");
    await file.writeAsBytes(await pdf.save());
    logger.d("PDF Generated at ${file.path}");
    return file;
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthenticatedAppProviders>(
      builder: (context, provider, child) {
        return Scaffold(
          appBar: AppBar(
            title: Text(
              'Payment Detail',
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
              : RefreshIndicator(
            onRefresh: () async {
              await fetchDetails(widget.paymentRef);
            },
            child: Padding(
              padding: const EdgeInsets.all(10.0),
              child: invoiceDataResponse == null
                  ? Center(child: Text('No data available'))
                  : SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header and Download Button
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          "Payment Detail",
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 24,
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: () async{
                            final pdfFile = await PDFPaymentApi.generatePayment(invoiceDataResponse!);
                            PdfApi.openFile(pdfFile);
                          },
                          icon: Icon(Icons.download),
                          label: Text(
                            "Download",
                            style: poppinsBold.copyWith(
                              color: Theme.of(context).primaryColor,
                              fontSize: Dimensions.fontSizeDefault,
                            ),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 20),

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
                              Image.asset(
                                Images.logo, // Replace with your logo path
                                height: 100,
                                width: 100,
                              ),
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
                                  color: Colors.green,
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

                    // Table Section
                    Table(
                      border: TableBorder.all(color: Colors.grey),
                      columnWidths: const {
                        0: FlexColumnWidth(2),
                        1: FlexColumnWidth(1),
                      },
                      children: [
                        const TableRow(
                          decoration: BoxDecoration(color: ColorResources.graphLightBlue),
                          children: [
                            Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Text(
                                "Item Description",
                                style: TextStyle(fontWeight: FontWeight.bold,
                                color: ColorResources.textRed),
                              ),
                            ),
                            Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Text(
                                "Amount",
                                textAlign: TextAlign.right,
                                style: TextStyle(fontWeight: FontWeight.bold,
                                    color:ColorResources.textRed),
                              ),
                            ),
                          ],
                        ),
                        ...invoiceDataResponse?.bills.map((bill) {
                          return TableRow(
                            children: [
                              Padding(
                                padding: const EdgeInsets.all(8.0),
                                child: Text(bill.narration,style: TextStyle(fontWeight: FontWeight.normal,
                                    color: ColorResources.textBlue)),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(8.0),
                                child: Text(
                                  bill.value,
                                  textAlign: TextAlign.right
                          ,style: TextStyle(fontWeight: FontWeight.normal,
                          color: ColorResources.textBlue)
                                ),
                              ),
                            ],
                          );
                        }).toList() ?? [],
                        TableRow(
                          decoration: BoxDecoration(color: Colors.grey[100]),
                          children: [
                            const Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Text(
                                "Balance",
                                style: TextStyle(fontWeight: FontWeight.bold, color: ColorResources.textBlue),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(8.0),
                              child: Text(
                                invoiceDataResponse?.rentOwed?? '0',
                                textAlign: TextAlign.right,
                                style: const TextStyle(fontWeight: FontWeight.bold, color: ColorResources.textBlue),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),

                    SizedBox(height: 20),

                    // Pay Button
                    // invoiceDataResponse?.status.toLowerCase() != 'paid'
                    //     ? Center(
                    //   child: ElevatedButton.icon(
                    //     onPressed: () {
                    //       // Implement payment functionality
                    //     },
                    //     icon: const Icon(Icons.money),
                    //     label: const Text("Pay"),
                    //     style: ElevatedButton.styleFrom(
                    //       padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 10),
                    //     ),
                    //   ),
                    // )
                    //     : Container(),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
