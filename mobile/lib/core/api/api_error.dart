/// An API failure in the shape every screen can show: the server's code and message, plus
/// per-field messages from a 422.
class ApiError implements Exception {
  ApiError({
    required this.status,
    required this.code,
    required this.message,
    this.details = const [],
    this.requestId,
  });

  final int status;
  final String code;
  final String message;
  final List<({String field, String message})> details;
  final String? requestId;

  static const networkError = 'NETWORK_ERROR';
  static const tokenExpired = 'TOKEN_EXPIRED';
  static const orgSuspended = 'ORG_SUSPENDED';

  /// Same wording as the web app, whatever the server said.
  static const orgSuspendedMessage =
      'Your organisation is read-only until its Hodi bill is paid, so this change wasn’t saved. '
      'Tenants can still pay rent, and rent payments can still be recorded. '
      'Pay the bill under More → Plan & billing.';

  bool get isNetworkError => code == networkError;

  /// First message per field.
  Map<String, String> get fieldErrors {
    final out = <String, String>{};
    for (final d in details) {
      out.putIfAbsent(d.field, () => d.message);
    }
    return out;
  }

  /// Turns a failed response into an ApiError. `body` is the decoded JSON, or anything else
  /// when the response wasn't ours (a proxy's HTML page).
  factory ApiError.fromResponse(int status, Object? body, {String? requestId}) {
    if (body is Map && body['error'] is Map) {
      final e = body['error'] as Map;
      final code = e['code'];
      final message = e['message'];
      if (code is String && message is String) {
        final details = <({String field, String message})>[];
        if (e['details'] is List) {
          for (final d in e['details'] as List) {
            if (d is Map && d['field'] is String && d['message'] is String) {
              details.add((
                field: d['field'] as String,
                message: d['message'] as String,
              ));
            }
          }
        }
        return ApiError(
          status: status,
          code: code,
          message: code == orgSuspended ? orgSuspendedMessage : message,
          details: details,
          requestId: body['requestId'] is String
              ? body['requestId'] as String
              : requestId,
        );
      }
    }
    return ApiError(
      status: status,
      code: 'HTTP_$status',
      message: status >= 500
          ? 'Hodi is having trouble right now. Please try again in a moment.'
          : 'Something went wrong (HTTP $status). Please try again.',
      requestId: requestId,
    );
  }

  factory ApiError.network() => ApiError(
    status: 0,
    code: networkError,
    message: 'Can’t reach Hodi. Check your internet connection and try again.',
  );

  @override
  String toString() => 'ApiError($status $code: $message)';
}

/// What to show for any error a screen catches.
String messageOf(Object error) => error is ApiError
    ? error.message
    : 'Something went wrong. Please try again.';
