import 'package:logger/logger.dart';

final Logger logger = Logger(
  printer: PrettyPrinter(),
);

final Logger loggerNoStack = Logger(
  printer: PrettyPrinter(methodCount: 0),
);