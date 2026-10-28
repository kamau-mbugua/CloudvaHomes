import 'flavors.dart';
import 'package:hodi_app/flavorizr/templates/app.dart';
import 'package:hodi_app/flavorizr/templates/main.dart' as runner;

Future<void> main() async {
  F.appFlavor = Flavor.dev;
  await runner.main();
}
