import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'auth/token_store.dart';
import 'config.dart';

/// App-wide singletons; tests override them.
final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(baseUrl: AppConfig.apiUrl),
);
final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

/// How often payment-prompt sheets poll; tests shorten it.
final stkPollIntervalProvider = Provider<Duration>(
  (ref) => const Duration(seconds: 3),
);
