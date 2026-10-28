import 'dart:io';

import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'api/api_client.dart';

/// Downloads a PDF from the API to the app's temporary folder and opens it in the system
/// viewer; falls back to the share sheet when no viewer is installed. Temporary files are
/// the OS's to clean, so personal documents don't pile up on the device.
Future<void> openApiPdf(ApiClient api, String path, String filename) async {
  final bytes = await api.bytes(path);
  final dir = await getTemporaryDirectory();
  final safe = filename.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
  final file = File('${dir.path}/$safe');
  await file.writeAsBytes(bytes, flush: true);
  final result = await OpenFilex.open(file.path, type: 'application/pdf');
  if (result.type != ResultType.done) {
    await SharePlus.instance.share(
      ShareParams(files: [XFile(file.path)], title: filename),
    );
  }
}
