import 'dart:io';

import 'package:flutter/material.dart';
import 'package:hodi_app/logger.dart';
import 'package:hodi_app/utils/images.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:provider/provider.dart';

import '../../../models/data/estate_invoices/estate_invoice_detail.dart';
import '../../../models/data/invoice/invoice_details.dart';
import '../../../providers/authenticated_app_providers.dart';
import '../../../route/routes.dart';
import '../../../services/pdf/estate_pdf_invoice_api.dart';
import '../../../services/pdf/pdf_api.dart';
import '../../../utils/color_resources.dart';
import '../../../utils/dimensions.dart';
import '../../../utils/styles.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../../viewmodel/payment_view_model.dart';

class EstateInvoiceDetailPage extends StatefulWidget {
  final String invoiceRef;
  EstateInvoiceDetailPage({super.key, required this.invoiceRef});
  @override
  State<EstateInvoiceDetailPage> createState() => _EstateInvoiceDetailPageState();
}

class _EstateInvoiceDetailPageState extends State<EstateInvoiceDetailPage> {
  EstateInvoiceDataResponse? invoiceDataResponse;

  @override
  void initState() {
    Future.microtask(() {
      fetchDetails(widget.invoiceRef);
    });
    super.initState();
  }

  Future<void> fetchDetails(String invoiceRef) async{
   await Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .getEstateInvoiceDetail(invoiceRef)
        .then((value) {
      if(value != null){
        setState(() {
          invoiceDataResponse = value;
        });
      }
    });
  }


  Future<File> generatePdf(EstateInvoiceDataResponse invoiceDataResponse) async {
    final pdf = pw.Document();

    pdf.addPage(
      pw.Page(
        build: (pw.Context context) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text("Estate Invoice Detail", style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold)),
              pw.SizedBox(height: 20),
              pw.Text("INVOICE TO: ${invoiceDataResponse.tenantName}", style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
              pw.Text("Mobile: ${invoiceDataResponse.tenantPhone}"),
              pw.Text("Email: ${invoiceDataResponse.tenantEmail}"),
              pw.Text("Estate #: ${invoiceDataResponse.estateName}"),
              pw.SizedBox(height: 20),
              pw.Text("Estate: ${invoiceDataResponse.estateName}"),
              pw.Text("Property: ${invoiceDataResponse.appName}"),
              pw.Text("Location: ${invoiceDataResponse.location}"),
              pw.Text("INVOICE #: ${invoiceDataResponse.rrn}", style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
              pw.Text("Status: ${invoiceDataResponse.status}", style: pw.TextStyle(color: PdfColors.red)),
              pw.Text("Issued On: ${invoiceDataResponse.date}"),
              pw.SizedBox(height: 20),
              pw.Table.fromTextArray(
                headers: ["Property", "Total Units", "Occupied Units", "Total Rent", "Commission", "Amount"],
                data: invoiceDataResponse.bills.map((bill) => [bill.narration, bill.units, bill.occupiedUnits, bill.totalRent, bill.commission, bill.value]).toList(),
              ),
              pw.SizedBox(height: 10),
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Text("Total", style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                  pw.Text(invoiceDataResponse.bills.fold(0, (sum, bill) => sum + int.parse(bill.value)).toString(), style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                ],
              ),
            ],
          );
        },
      ),
    );

    final output = await getTemporaryDirectory();
    final file = File("${output.path}/estate_invoice.pdf");
    await file.writeAsBytes(await pdf.save());
    logger.d("PDF Generated at ${file.path}");
    return file;
  }

  @override
  Widget build(BuildContext context) {
    return Consumer2<AuthenticatedAppProviders, PaymentViewModel>(
      builder: (context, provider,paymentViewModel, child) {
        if (paymentViewModel.paymentSuccessful) {
          //refresh the invoice details
          Future.microtask(() {
            fetchDetails(widget.invoiceRef);
          });
          paymentViewModel.resetPaymentStatus();
        }

        return Scaffold(
          appBar: AppBar(
            title: Text(
              'Estate Invoice Detail',
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
              await fetchDetails(widget.invoiceRef);
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
                          "Invoice Detail",
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 24,
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: () async {
                            final pdfFile = await PdfEstateInvoiceApi.generateInvoice(invoiceDataResponse!);
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
                                      ? Colors.red
                                      : Colors.green,
                                ),
                              ),
                              Text("Issued On: ${invoiceDataResponse?.date}"),
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
                                "Property",
                                style: TextStyle(fontWeight: FontWeight.bold, color: ColorResources.textRed),
                              ),
                            ),
                            Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Text(
                                "Total Units",
                                textAlign: TextAlign.right,
                                style: TextStyle(fontWeight: FontWeight.bold, color: ColorResources.textRed),
                              ),
                            ),
                            Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Text(
                                "Occupied Units",
                                style: TextStyle(fontWeight: FontWeight.bold, color: ColorResources.textRed),
                              ),
                            ),
                            Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Text(
                                "Total Rent",
                                textAlign: TextAlign.right,
                                style: TextStyle(fontWeight: FontWeight.bold, color: ColorResources.textRed),
                              ),
                            ),
                            Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Text(
                                "Commission",
                                style: TextStyle(fontWeight: FontWeight.bold, color: ColorResources.textRed),
                              ),
                            ),
                            Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Text(
                                "Amount",
                                textAlign: TextAlign.right,
                                style: TextStyle(fontWeight: FontWeight.bold, color: ColorResources.textRed),
                              ),
                            ),
                          ],
                        ),
                        ...invoiceDataResponse?.bills.map((bill) {
                          return TableRow(
                            children: [
                              Padding(
                                padding: const EdgeInsets.all(8.0),
                                child: Text(bill.narration, style: TextStyle(fontWeight: FontWeight.normal, color: ColorResources.textBlue)),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(8.0),
                                child: Text(
                                  bill.units,
                                  textAlign: TextAlign.right,
                                  style: TextStyle(fontWeight: FontWeight.normal, color: ColorResources.textBlue),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(8.0),
                                child: Text(
                                  bill.occupiedUnits,
                                  textAlign: TextAlign.right,
                                  style: TextStyle(fontWeight: FontWeight.normal, color: ColorResources.textBlue),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(8.0),
                                child: Text(
                                  bill.totalRent,
                                  textAlign: TextAlign.right,
                                  style: TextStyle(fontWeight: FontWeight.normal, color: ColorResources.textBlue),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(8.0),
                                child: Text(
                                  bill.commission,
                                  textAlign: TextAlign.right,
                                  style: TextStyle(fontWeight: FontWeight.normal, color: ColorResources.textBlue),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(8.0),
                                child: Text(
                                  bill.value,
                                  textAlign: TextAlign.right,
                                  style: TextStyle(fontWeight: FontWeight.normal, color: ColorResources.textBlue),
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
                                "Total",
                                style: TextStyle(fontWeight: FontWeight.bold, color: ColorResources.textBlue),
                              ),
                            ),
                            const Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Text(""),
                            ),
                            const Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Text(""),
                            ),
                            const Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Text(""),
                            ),
                            const Padding(
                              padding: EdgeInsets.all(8.0),
                              child: Text(""),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(8.0),
                              child: Text(
                                invoiceDataResponse?.bills.fold(0, (sum, bill) => sum + int.parse(bill.value)).toString() ?? '0',
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
                    invoiceDataResponse?.status.toLowerCase() != 'paid'
                        ? Center(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          List<String> invoiceIds = [];
                            invoiceIds.add(invoiceDataResponse?.id.toString() ?? '');
                          var amount = invoiceDataResponse?.rentOwed ?? 0;

                          //convert amount to double
                          amount = double.parse(amount.toString());

                          var paymentPayload = {
                            "invoiceIds": invoiceIds,
                            "amount": amount,
                            "paidBy": invoiceDataResponse?.tenantName,
                            "phoneNo": invoiceDataResponse?.tenantPhone,
                          };

                          Navigator.pushNamed(context, AppRoutes.getPaymentListRoute(), arguments:{
                            "propertyId":"",
                            "originInvoice":"hodi",
                            "paymentPayload":paymentPayload
                          });

                        },
                        icon: const Icon(Icons.money),
                        label: const Text("Pay"),
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 10),
                        ),
                      ),
                    )
                        : Container(),
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
