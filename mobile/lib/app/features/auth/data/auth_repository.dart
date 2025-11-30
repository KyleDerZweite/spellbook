import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../network/api_constants.dart';
import '../../../network/dio_client.dart';
import 'models/user_model.dart';

class AuthRepository {
  final Ref _ref;
  
  AuthRepository(this._ref);
  
  Dio get _dio => _ref.read(dioProvider);

  Future<AuthTokens> login(String email, String password) async {
    final response = await _dio.post(
      ApiConstants.login,
      data: {
        'email': email,
        'password': password,
      },
    );
    return AuthTokens.fromJson(response.data);
  }

  Future<AuthTokens> register(
    String username,
    String email,
    String password, {
    String? inviteCode,
  }) async {
    final response = await _dio.post(
      ApiConstants.register,
      data: {
        'username': username,
        'email': email,
        'password': password,
        if (inviteCode != null) 'invite_code': inviteCode,
      },
    );
    return AuthTokens.fromJson(response.data);
  }

  Future<User> getCurrentUser() async {
    final response = await _dio.get(ApiConstants.me);
    return User.fromJson(response.data);
  }

  Future<void> logout() async {
    await _dio.post(ApiConstants.logout);
  }

  Future<AuthTokens> refreshToken(String refreshToken) async {
    final response = await _dio.post(
      ApiConstants.refresh,
      data: {'refresh_token': refreshToken},
    );
    return AuthTokens.fromJson(response.data);
  }
}
