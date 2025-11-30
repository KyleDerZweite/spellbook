import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/storage_service.dart';
import 'api_constants.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: ApiConstants.baseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ),
  );

  dio.interceptors.addAll([
    AuthInterceptor(ref),
    LoggingInterceptor(),
  ]);

  return dio;
});

class AuthInterceptor extends Interceptor {
  final Ref _ref;

  AuthInterceptor(this._ref);

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await StorageService.getAuthToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      // Try to refresh token
      final refreshToken = await StorageService.getRefreshToken();
      if (refreshToken != null) {
        try {
          final dio = Dio(BaseOptions(baseUrl: ApiConstants.baseUrl));
          final response = await dio.post(
            '/api/v1/auth/refresh',
            data: {'refresh_token': refreshToken},
          );

          final newToken = response.data['access_token'];
          final newRefreshToken = response.data['refresh_token'];

          await StorageService.saveAuthToken(newToken);
          await StorageService.saveRefreshToken(newRefreshToken);

          // Retry the original request
          final options = err.requestOptions;
          options.headers['Authorization'] = 'Bearer $newToken';

          final retryResponse = await Dio().fetch(options);
          handler.resolve(retryResponse);
          return;
        } catch (_) {
          // Refresh failed, clear auth data
          await StorageService.clearAuthData();
        }
      }
    }
    handler.next(err);
  }
}

class LoggingInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    print('REQUEST[${options.method}] => PATH: ${options.path}');
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    print('RESPONSE[${response.statusCode}] => PATH: ${response.requestOptions.path}');
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    print('ERROR[${err.response?.statusCode}] => PATH: ${err.requestOptions.path}');
    handler.next(err);
  }
}
