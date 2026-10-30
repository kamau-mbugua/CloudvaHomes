import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config.dart';
import 'api_error.dart';
import 'logging_interceptor.dart';

/// Thin client for `/api/v1`, after the web app's `client.ts`. No general retries: a retried
/// POST could record a payment twice. The one retry is `401 TOKEN_EXPIRED` → one shared
/// refresh → the request again, once (the server refused it before doing anything).
class ApiClient {
  ApiClient({
    required String baseUrl,
    Dio? dio,
    bool? enableLogging,
    void Function(String message)? logPrint,
  }) : _dio =
           dio ??
           Dio(
             BaseOptions(
               baseUrl: baseUrl,
               connectTimeout: const Duration(seconds: 15),
               receiveTimeout: const Duration(seconds: 45),
             ),
           ) {
    if (enableLogging ??
        (dio == null && (!kReleaseMode || !AppConfig.isProd))) {
      final hasLogger = _dio.interceptors.any((i) => i is LoggingInterceptor);
      if (!hasLogger) {
        _dio.interceptors.add(
          LoggingInterceptor(logPrint: logPrint ?? debugPrint),
        );
      }
    }
  }

  final Dio _dio;

  /// In memory only. The refresh token lives in secure storage (see TokenStore).
  String? accessToken;

  /// Gets a new access token (and sets [accessToken]); false when the session is gone.
  Future<bool> Function()? onRefresh;

  /// The session couldn't be refreshed: sign the person out.
  void Function()? onAuthLost;

  /// Every refused write while suspended, so the app can re-read the session (banner).
  void Function()? onSuspended;

  Future<bool>? _refreshing;

  Future<bool> _refreshOnce() {
    final running = _refreshing;
    if (running != null) return running;
    final next = (onRefresh?.call() ?? Future.value(false))
        .catchError((Object _) => false)
        .whenComplete(() => _refreshing = null);
    _refreshing = next;
    return next;
  }

  /// A key for one money-moving action; reuse it when retrying that same action.
  static String newIdempotencyKey() {
    final r = Random.secure();
    return List.generate(
      16,
      (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, Object?>? query,
  }) async => _json(await _send('GET', path, query: query));

  Future<Map<String, dynamic>> post(
    String path, {
    Object? body,
    Map<String, String>? headers,
  }) async => _json(
    await _send('POST', path, body: body ?? const {}, headers: headers),
  );

  Future<Map<String, dynamic>> patch(String path, {Object? body}) async =>
      _json(await _send('PATCH', path, body: body ?? const {}));

  Future<Map<String, dynamic>> put(String path, {Object? body}) async =>
      _json(await _send('PUT', path, body: body ?? const {}));

  Future<void> delete(String path) async => _send('DELETE', path);

  /// A file (PDF) as bytes.
  Future<Uint8List> bytes(String path, {Map<String, Object?>? query}) async {
    final res = await _send(
      'GET',
      path,
      query: query,
      responseType: ResponseType.bytes,
    );
    return Uint8List.fromList(res.data as List<int>);
  }

  /// Multipart upload (photos, receipts).
  Future<Map<String, dynamic>> upload(
    String path,
    FormData Function() form,
  ) async => _json(await _send('POST', path, form: form));

  Map<String, dynamic> _json(Response<dynamic> res) {
    final d = res.data;
    return d is Map<String, dynamic> ? d : <String, dynamic>{};
  }

  Future<Response<dynamic>> _send(
    String method,
    String path, {
    Object? body,
    FormData Function()? form,
    Map<String, Object?>? query,
    Map<String, String>? headers,
    ResponseType? responseType,
    bool retried = false,
  }) async {
    final cleanQuery = query == null
        ? null
        : {
            for (final e in query.entries)
              if (e.value != null && e.value != '') e.key: e.value,
          };
    try {
      return await _dio.request<dynamic>(
        path,
        data: form != null ? form() : body,
        queryParameters: cleanQuery,
        options: Options(
          method: method,
          responseType: responseType,
          headers: {
            if (accessToken != null) 'Authorization': 'Bearer $accessToken',
            ...?headers,
          },
        ),
      );
    } on DioException catch (e) {
      final res = e.response;
      if (res == null) throw ApiError.network();
      Object? data = res.data;
      // A bytes request's error body is JSON bytes: decode it to read the envelope.
      if (data is List<int>) {
        try {
          data = jsonDecode(utf8.decode(data));
        } on FormatException {
          data = null;
        }
      }
      final error = ApiError.fromResponse(
        res.statusCode ?? 0,
        data,
        requestId: res.headers.value('x-request-id'),
      );
      if (error.status == 401 &&
          error.code == ApiError.tokenExpired &&
          !retried) {
        if (await _refreshOnce()) {
          return _send(
            method,
            path,
            body: body,
            form: form,
            query: query,
            headers: headers,
            responseType: responseType,
            retried: true,
          );
        }
        onAuthLost?.call();
      } else if (error.status == 401) {
        onAuthLost?.call();
      } else if (error.code == ApiError.orgSuspended) {
        onSuspended?.call();
      }
      throw error;
    }
  }
}
