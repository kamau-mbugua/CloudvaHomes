import 'package:flutter_test/flutter_test.dart';
import 'package:hodi/core/api/api_error.dart';

import '../helpers/fake_http.dart';

void main() {
  test(
    'maps the error envelope, with field errors and the suspended wording',
    () async {
      final adapter = FakeAdapter(
        (c) => switch (c.path) {
          '/v' => (
            422,
            errorBody('VALIDATION', 'Check the form', [
              {'field': 'amount', 'message': 'Too big'},
              {'field': 'amount', 'message': 'Second'},
            ]),
          ),
          _ => (403, errorBody('ORG_SUSPENDED', 'server words')),
        },
      );
      final api = fakeClient(adapter);
      var suspended = 0;
      api.onSuspended = () => suspended++;

      final v = await api
          .post('/v')
          .then<ApiError?>((_) => null, onError: (Object e) => e as ApiError);
      expect(v!.code, 'VALIDATION');
      expect(v.fieldErrors, {'amount': 'Too big'});
      expect(v.requestId, 'req-1');

      final s = await api
          .post('/s')
          .then<ApiError?>((_) => null, onError: (Object e) => e as ApiError);
      expect(s!.message, ApiError.orgSuspendedMessage);
      expect(suspended, 1);
    },
  );

  test('non-envelope errors get HTTP_<status>', () {
    final e = ApiError.fromResponse(502, '<html>bad gateway</html>');
    expect(e.code, 'HTTP_502');
    expect(e.message, contains('trouble'));
  });

  test(
    'an expired token is refreshed once for concurrent requests, then retried',
    () async {
      var token = 'old';
      final adapter = FakeAdapter((c) {
        final auth = c.headers['Authorization'];
        return auth == 'Bearer new'
            ? (200, {'data': c.path})
            : (401, errorBody('TOKEN_EXPIRED', 'expired'));
      });
      final api = fakeClient(adapter)..accessToken = token;
      var refreshes = 0;
      api.onRefresh = () async {
        refreshes++;
        await Future<void>.delayed(const Duration(milliseconds: 10));
        token = 'new';
        api.accessToken = token;
        return true;
      };
      final results = await Future.wait([
        api.get('/a'),
        api.get('/b'),
        api.get('/c'),
      ]);
      expect(results.map((r) => r['data']), ['/a', '/b', '/c']);
      expect(refreshes, 1);
    },
  );

  test('a failed refresh signs out and surfaces the 401', () async {
    final adapter = FakeAdapter(
      (_) => (401, errorBody('TOKEN_EXPIRED', 'expired')),
    );
    final api = fakeClient(adapter)..accessToken = 'old';
    var lost = 0;
    api.onRefresh = () async => false;
    api.onAuthLost = () => lost++;
    await expectLater(
      api.get('/a'),
      throwsA(isA<ApiError>().having((e) => e.status, 'status', 401)),
    );
    expect(lost, 1);
    expect(adapter.calls, hasLength(1));
  });

  test('POSTs are never retried on other errors', () async {
    final adapter = FakeAdapter((_) => (500, errorBody('INTERNAL', 'boom')));
    final api = fakeClient(adapter);
    await expectLater(
      api.post('/payments', body: {'amount': 100}),
      throwsA(isA<ApiError>()),
    );
    expect(adapter.calls, hasLength(1));
  });
}
