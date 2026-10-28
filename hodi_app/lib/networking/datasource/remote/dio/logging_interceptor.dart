import 'package:dio/dio.dart';
import 'package:flutter/cupertino.dart';
import 'package:hodi_app/logger.dart';

class LoggingInterceptor extends InterceptorsWrapper {
  int maxCharactersPerLine = 200;

  @override
  Future onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    loggerNoStack.i("--> ${options.method} ${options.path}");
    loggerNoStack.i("Headers: ${options.headers.toString()}");
    loggerNoStack.i("<-- END HTTP");


    return super.onRequest(options, handler);
  }

  @override
  Future onResponse(Response response, ResponseInterceptorHandler handler) async {
    String responseAsString = response.data.toString();
    loggerNoStack.i(
        "<----onResponse---->\n"
            "===> Status Code ${response.statusCode} \n"
            "===> Request ${response.requestOptions.method} \n "
            "===> path: ${response.requestOptions.path} \n "
            "===> respose: ${responseAsString}"
    );


    if (responseAsString.length > maxCharactersPerLine) {
      int iterations = (responseAsString.length / maxCharactersPerLine).floor();
      for (int i = 0; i <= iterations; i++) {
        int endingIndex = i * maxCharactersPerLine + maxCharactersPerLine;
        if (endingIndex > responseAsString.length) {
          endingIndex = responseAsString.length;
        }
        // loggerNoStack.i(responseAsString.substring(i * maxCharactersPerLine, endingIndex));
      }
    } else {
      // logger.i(response.data);
    }

    logger.i("<-- END HTTP");

    return super.onResponse(response, handler);
  }

  @override
  Future onError(DioError err, ErrorInterceptorHandler handler) async {
    logger.i("ERROR[${err.response?.statusCode}] => PATH: ${err.requestOptions.path}");
    return super.onError(err, handler);
  }
}
