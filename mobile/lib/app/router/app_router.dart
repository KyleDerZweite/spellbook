import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/presentation/pages/login_page.dart';
import '../features/auth/presentation/pages/register_page.dart';
import '../features/auth/providers/auth_provider.dart';
import '../features/collections/presentation/pages/collection_detail_page.dart';
import '../features/collections/presentation/pages/collections_page.dart';
import '../features/home/presentation/pages/home_page.dart';
import '../features/scanner/presentation/pages/scan_page.dart';
import '../features/scanner/presentation/pages/scan_results_page.dart';
import '../features/scanner/presentation/pages/scan_review_page.dart';
import '../features/search/presentation/pages/search_page.dart';
import '../features/settings/presentation/pages/settings_page.dart';
import '../shared/widgets/main_scaffold.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: true,
    redirect: (context, state) {
      final isLoggedIn = authState.isAuthenticated;
      final isLoginRoute = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register';

      if (!isLoggedIn && !isLoginRoute) {
        return '/login';
      }
      if (isLoggedIn && isLoginRoute) {
        return '/';
      }
      return null;
    },
    routes: [
      // Auth routes
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: '/register',
        name: 'register',
        builder: (context, state) => const RegisterPage(),
      ),

      // Main app with bottom navigation
      ShellRoute(
        builder: (context, state, child) => MainScaffold(child: child),
        routes: [
          GoRoute(
            path: '/',
            name: 'home',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: HomePage(),
            ),
          ),
          GoRoute(
            path: '/collections',
            name: 'collections',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: CollectionsPage(),
            ),
            routes: [
              GoRoute(
                path: ':id',
                name: 'collection-detail',
                builder: (context, state) {
                  final id = state.pathParameters['id']!;
                  return CollectionDetailPage(collectionId: id);
                },
              ),
            ],
          ),
          GoRoute(
            path: '/scan',
            name: 'scan',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: ScanPage(),
            ),
            routes: [
              GoRoute(
                path: 'results',
                name: 'scan-results',
                builder: (context, state) => const ScanResultsPage(),
              ),
              GoRoute(
                path: 'review/:batchId',
                name: 'scan-review',
                builder: (context, state) {
                  final batchId = state.pathParameters['batchId']!;
                  return ScanReviewPage(batchId: batchId);
                },
              ),
            ],
          ),
          GoRoute(
            path: '/search',
            name: 'search',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: SearchPage(),
            ),
          ),
          GoRoute(
            path: '/settings',
            name: 'settings',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: SettingsPage(),
            ),
          ),
        ],
      ),
    ],
  );
});
