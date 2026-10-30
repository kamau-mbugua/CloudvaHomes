import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// Logs HTTP requests, responses, and errors made through Dio in debug/dev builds.
class LoggingInterceptor extends Interceptor {
  LoggingInterceptor({
    void Function(String message)? logPrint,
    this.maxCharactersPerLine = 800,
  }) : logPrint = logPrint ?? debugPrint;

  final void Function(String message) logPrint;
  final int maxCharactersPerLine;

  static const _startTimeKey = '_hodi_request_start_ms';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.extra[_startTimeKey] = DateTime.now().millisecondsSinceEpoch;

    final uri = options.uri;
    logPrint('┌── HTTP REQUEST ──────────────────────────────────────────────');
    logPrint('│ --> ${options.method.toUpperCase()} $uri');
    if (options.headers.isNotEmpty) {
      logPrint('│ Headers: ${_formatHeaders(options.headers)}');
    }
    if (options.queryParameters.isNotEmpty) {
      logPrint('│ Query: ${options.queryParameters}');
    }
    if (options.data != null) {
      logPrint('│ Body: ${_formatData(options.data)}');
    }
    logPrint('└──────────────────────────────────────────────────────────────');

    super.onRequest(options, handler);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    final elapsed = _elapsedMs(response.requestOptions);
    final status = response.statusCode ?? 0;
    final method = response.requestOptions.method.toUpperCase();
    final uri = response.requestOptions.uri;

    logPrint('┌── HTTP RESPONSE ─────────────────────────────────────────────');
    logPrint('│ <-- $status $method $uri ($elapsed)');
    final reqId = response.headers.value('x-request-id');
    if (reqId != null && reqId.isNotEmpty) {
      logPrint('│ Request-Id: $reqId');
    }
    _logChunked('│ Response: ', _formatData(response.data));
    logPrint('└──────────────────────────────────────────────────────────────');

    super.onResponse(response, handler);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final elapsed = _elapsedMs(err.requestOptions);
    final status = err.response?.statusCode;
    final method = err.requestOptions.method.toUpperCase();
    final uri = err.requestOptions.uri;

    logPrint('┌── HTTP ERROR ────────────────────────────────────────────────');
    logPrint(
      '│ <-- ERROR [${status ?? err.type.name}] $method $uri ($elapsed)',
    );
    if (err.message != null && err.message!.isNotEmpty) {
      logPrint('│ Message: ${err.message}');
    }
    if (err.response?.data != null) {
      _logChunked('│ Error Body: ', _formatData(err.response?.data));
    }
    logPrint('└──────────────────────────────────────────────────────────────');

    super.onError(err, handler);
  }

  String _elapsedMs(RequestOptions options) {
    final start = options.extra[_startTimeKey];
    if (start is int) {
      final diff = DateTime.now().millisecondsSinceEpoch - start;
      return '${diff}ms';
    }
    return '?ms';
  }

  Map<String, Object?> _formatHeaders(Map<String, dynamic> headers) {
    return {
      for (final e in headers.entries)
        if (e.key.toLowerCase() == 'authorization')
          e.key: _maskAuth(e.value?.toString() ?? '')
        else
          e.key: e.value,
    };
  }

  String _maskAuth(String value) {
    if (value.length <= 20) return value;
    return '${value.substring(0, 15)}...${value.substring(value.length - 4)}';
  }

  String _formatData(Object? data) {
    if (data == null) return 'null';
    if (data is Uint8List) return '<bytes: ${data.length} bytes>';
    if (data is List<int>) {
      try {
        final decoded = utf8.decode(data);
        return decoded;
      } on FormatException {
        return '<bytes: ${data.length} bytes>';
      }
    }
    if (data is FormData) {
      final fields = {for (final f in data.fields) f.key: f.value};
      final files = [
        for (final f in data.files)
          '${f.key}: ${f.value.filename ?? 'file'} (${f.value.length} bytes)',
      ];
      return 'FormData(fields: $fields, files: $files)';
    }
    if (data is Map || data is List) {
      try {
        return jsonEncode(data);
      } catch (_) {
        return data.toString();
      }
    }
    return data.toString();
  }

  void _logChunked(String prefix, String text) {
    if (text.length <= maxCharactersPerLine) {
      logPrint('$prefix$text');
      return;
    }
    final totalChunks = (text.length / maxCharactersPerLine).ceil();
    for (var i = 0; i < totalChunks; i++) {
      final start = i * maxCharactersPerLine;
      final end = (start + maxCharactersPerLine < text.length)
          ? start + maxCharactersPerLine
          : text.length;
      final head = i == 0 ? prefix : '│   ';
      logPrint('$head${text.substring(start, end)}');
    }
  }
}
