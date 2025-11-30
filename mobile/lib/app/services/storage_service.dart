import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class StorageService {
  static late Box _settingsBox;
  static late Box _cacheBox;
  static const _secureStorage = FlutterSecureStorage();

  static const String _authTokenKey = 'auth_token';
  static const String _refreshTokenKey = 'refresh_token';
  static const String _userIdKey = 'user_id';

  static Future<void> init() async {
    _settingsBox = await Hive.openBox('settings');
    _cacheBox = await Hive.openBox('cache');
  }

  // Secure Storage Methods (for sensitive data)
  static Future<void> saveAuthToken(String token) async {
    await _secureStorage.write(key: _authTokenKey, value: token);
  }

  static Future<String?> getAuthToken() async {
    return await _secureStorage.read(key: _authTokenKey);
  }

  static Future<void> saveRefreshToken(String token) async {
    await _secureStorage.write(key: _refreshTokenKey, value: token);
  }

  static Future<String?> getRefreshToken() async {
    return await _secureStorage.read(key: _refreshTokenKey);
  }

  static Future<void> saveUserId(String userId) async {
    await _secureStorage.write(key: _userIdKey, value: userId);
  }

  static Future<String?> getUserId() async {
    return await _secureStorage.read(key: _userIdKey);
  }

  static Future<void> clearAuthData() async {
    await _secureStorage.delete(key: _authTokenKey);
    await _secureStorage.delete(key: _refreshTokenKey);
    await _secureStorage.delete(key: _userIdKey);
  }

  // Settings Box Methods
  static Future<void> saveSetting(String key, dynamic value) async {
    await _settingsBox.put(key, value);
  }

  static T? getSetting<T>(String key, {T? defaultValue}) {
    return _settingsBox.get(key, defaultValue: defaultValue) as T?;
  }

  static bool getBool(String key, {bool defaultValue = false}) {
    return _settingsBox.get(key, defaultValue: defaultValue) as bool;
  }

  static String getString(String key, {String defaultValue = ''}) {
    return _settingsBox.get(key, defaultValue: defaultValue) as String;
  }

  static int getInt(String key, {int defaultValue = 0}) {
    return _settingsBox.get(key, defaultValue: defaultValue) as int;
  }

  // Cache Methods
  static Future<void> cacheData(String key, dynamic data, {Duration? expiry}) async {
    final entry = {
      'data': data,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      'expiry': expiry?.inMilliseconds,
    };
    await _cacheBox.put(key, entry);
  }

  static T? getCachedData<T>(String key) {
    final entry = _cacheBox.get(key);
    if (entry == null) return null;

    final timestamp = entry['timestamp'] as int;
    final expiry = entry['expiry'] as int?;

    if (expiry != null) {
      final expiryTime = DateTime.fromMillisecondsSinceEpoch(timestamp + expiry);
      if (DateTime.now().isAfter(expiryTime)) {
        _cacheBox.delete(key);
        return null;
      }
    }

    return entry['data'] as T?;
  }

  static Future<void> clearCache() async {
    await _cacheBox.clear();
  }

  // Clear all storage
  static Future<void> clearAll() async {
    await clearAuthData();
    await _settingsBox.clear();
    await _cacheBox.clear();
  }
}
