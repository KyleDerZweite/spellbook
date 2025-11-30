import 'package:json_annotation/json_annotation.dart';

part 'user_model.g.dart';

@JsonSerializable()
class User {
  final String id;
  final String username;
  final String email;
  @JsonKey(name: 'is_active')
  final bool isActive;
  @JsonKey(name: 'is_admin')
  final bool isAdmin;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  @JsonKey(name: 'updated_at')
  final DateTime updatedAt;
  @JsonKey(name: 'last_login')
  final DateTime? lastLogin;
  @JsonKey(name: 'avatar_url')
  final String? avatarUrl;

  const User({
    required this.id,
    required this.username,
    required this.email,
    required this.isActive,
    required this.isAdmin,
    required this.createdAt,
    required this.updatedAt,
    this.lastLogin,
    this.avatarUrl,
  });

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);
}

@JsonSerializable()
class AuthTokens {
  @JsonKey(name: 'access_token')
  final String accessToken;
  @JsonKey(name: 'refresh_token')
  final String refreshToken;
  @JsonKey(name: 'token_type')
  final String tokenType;

  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    this.tokenType = 'bearer',
  });

  factory AuthTokens.fromJson(Map<String, dynamic> json) => _$AuthTokensFromJson(json);
  Map<String, dynamic> toJson() => _$AuthTokensToJson(this);
}
