import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../auth/providers/auth_provider.dart';
import '../../../../theme/app_theme.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final user = authState.user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
      ),
      body: ListView(
        children: [
          // User profile section
          Container(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 32,
                  backgroundColor: AppTheme.accentColor,
                  child: Text(
                    user?.username.substring(0, 1).toUpperCase() ?? 'U',
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.username ?? 'Unknown User',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        user?.email ?? '',
                        style: TextStyle(
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.edit_outlined),
                  onPressed: () {
                    // TODO: Edit profile
                  },
                ),
              ],
            ),
          ),

          const Divider(),

          // Settings sections
          _SettingsSection(
            title: 'Collection',
            items: [
              _SettingsItem(
                icon: Icons.cloud_sync_outlined,
                title: 'Sync Settings',
                subtitle: 'Auto-sync enabled',
                onTap: () {},
              ),
              _SettingsItem(
                icon: Icons.currency_exchange,
                title: 'Currency',
                subtitle: 'USD',
                onTap: () {},
              ),
              _SettingsItem(
                icon: Icons.download_outlined,
                title: 'Export All Data',
                onTap: () {},
              ),
            ],
          ),

          _SettingsSection(
            title: 'Scanner',
            items: [
              _SettingsItem(
                icon: Icons.high_quality_outlined,
                title: 'Image Quality',
                subtitle: 'High',
                onTap: () {},
              ),
              _SettingsItem(
                icon: Icons.auto_awesome_motion_outlined,
                title: 'Auto-confirm matches',
                trailing: Switch(
                  value: false,
                  onChanged: (value) {},
                ),
              ),
              _SettingsItem(
                icon: Icons.vibration,
                title: 'Haptic Feedback',
                trailing: Switch(
                  value: true,
                  onChanged: (value) {},
                ),
              ),
            ],
          ),

          _SettingsSection(
            title: 'Appearance',
            items: [
              _SettingsItem(
                icon: Icons.dark_mode_outlined,
                title: 'Dark Mode',
                subtitle: 'System',
                onTap: () {},
              ),
              _SettingsItem(
                icon: Icons.grid_view_outlined,
                title: 'Card Display',
                subtitle: 'Grid',
                onTap: () {},
              ),
            ],
          ),

          _SettingsSection(
            title: 'About',
            items: [
              _SettingsItem(
                icon: Icons.info_outline,
                title: 'Version',
                subtitle: '2.0.0',
              ),
              _SettingsItem(
                icon: Icons.description_outlined,
                title: 'Terms of Service',
                onTap: () {},
              ),
              _SettingsItem(
                icon: Icons.privacy_tip_outlined,
                title: 'Privacy Policy',
                onTap: () {},
              ),
              _SettingsItem(
                icon: Icons.code,
                title: 'Open Source Licenses',
                onTap: () {},
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Logout button
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: OutlinedButton.icon(
              onPressed: () async {
                await ref.read(authStateProvider.notifier).logout();
                if (context.mounted) {
                  context.go('/login');
                }
              },
              icon: const Icon(Icons.logout, color: Colors.red),
              label: const Text('Sign Out', style: TextStyle(color: Colors.red)),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Colors.red),
              ),
            ),
          ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _SettingsSection extends StatelessWidget {
  final String title;
  final List<Widget> items;

  const _SettingsSection({required this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            title,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: Colors.grey[600],
            ),
          ),
        ),
        ...items,
      ],
    );
  }
}

class _SettingsItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  const _SettingsItem({
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon),
      title: Text(title),
      subtitle: subtitle != null ? Text(subtitle!) : null,
      trailing: trailing ?? (onTap != null ? const Icon(Icons.chevron_right) : null),
      onTap: onTap,
    );
  }
}
