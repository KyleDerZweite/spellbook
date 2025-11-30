import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:equatable/equatable.dart';

import '../../../services/storage_service.dart';
import '../data/auth_repository.dart';
import '../data/models/user_model.dart';

// Auth State
class AuthState extends Equatable {
  final User? user;
  final bool isAuthenticated;
  final bool isLoading;
  final String? errorMessage;

  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isLoading = false,
    this.errorMessage,
  });

  AuthState copyWith({
    User? user,
    bool? isAuthenticated,
    bool? isLoading,
    String? errorMessage,
  }) {
    return AuthState(
      user: user ?? this.user,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage,
    );
  }

  @override
  List<Object?> get props => [user, isAuthenticated, isLoading, errorMessage];
}

// Auth Notifier
class AuthNotifier extends StateNotifier<AuthState> {
  final AuthRepository _repository;

  AuthNotifier(this._repository) : super(const AuthState()) {
    _checkAuthStatus();
  }

  Future<void> _checkAuthStatus() async {
    final token = await StorageService.getAuthToken();
    if (token != null) {
      try {
        state = state.copyWith(isLoading: true);
        final user = await _repository.getCurrentUser();
        state = state.copyWith(
          user: user,
          isAuthenticated: true,
          isLoading: false,
        );
      } catch (_) {
        await StorageService.clearAuthData();
        state = state.copyWith(isAuthenticated: false, isLoading: false);
      }
    }
  }

  Future<bool> login(String email, String password) async {
    try {
      state = state.copyWith(isLoading: true, errorMessage: null);
      
      final tokens = await _repository.login(email, password);
      await StorageService.saveAuthToken(tokens.accessToken);
      await StorageService.saveRefreshToken(tokens.refreshToken);
      
      final user = await _repository.getCurrentUser();
      state = state.copyWith(
        user: user,
        isAuthenticated: true,
        isLoading: false,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  Future<bool> register(String username, String email, String password, {String? inviteCode}) async {
    try {
      state = state.copyWith(isLoading: true, errorMessage: null);
      
      final tokens = await _repository.register(username, email, password, inviteCode: inviteCode);
      await StorageService.saveAuthToken(tokens.accessToken);
      await StorageService.saveRefreshToken(tokens.refreshToken);
      
      final user = await _repository.getCurrentUser();
      state = state.copyWith(
        user: user,
        isAuthenticated: true,
        isLoading: false,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  Future<void> logout() async {
    try {
      await _repository.logout();
    } catch (_) {}
    
    await StorageService.clearAuthData();
    state = const AuthState();
  }

  void clearError() {
    state = state.copyWith(errorMessage: null);
  }
}

// Providers
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(ref);
});

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authRepositoryProvider));
});
