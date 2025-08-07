'use client';

import { useAuth } from '../../../lib/auth';
import { Settings, User, Shield } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-xl p-6">
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Settings
        </h1>
        <p className="text-text-secondary">
          Manage your account and preferences
        </p>
      </div>

      {/* User Information */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <User className="text-primary" size={24} />
          <h2 className="text-xl font-semibold text-text-primary">
            Account Information
          </h2>
        </div>
        
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Username
              </label>
              <div className="bg-surface-variant border border-border rounded-lg px-3 py-2 text-text-muted">
                {user?.username}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Email
              </label>
              <div className="bg-surface-variant border border-border rounded-lg px-3 py-2 text-text-muted">
                {user?.email}
              </div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Account Status
              </label>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  user?.status === 'APPROVED' ? 'bg-green-500' : 'bg-yellow-500'
                }`} />
                <span className="text-text-primary">
                  {user?.status?.toLowerCase().replace('_', ' ')}
                </span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Role
              </label>
              <div className="flex items-center gap-2">
                {user?.is_admin && <Shield size={16} className="text-primary" />}
                <span className="text-text-primary">
                  {user?.is_admin ? 'Administrator' : 'User'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Settings className="text-primary" size={24} />
          <h2 className="text-xl font-semibold text-text-primary">
            Preferences
          </h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <p className="text-text-secondary">
              More preference options coming soon...
            </p>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="glass rounded-xl p-6 border-red-500/20 bg-red-500/5">
        <h2 className="text-xl font-semibold text-red-400 mb-4">
          Danger Zone
        </h2>
        
        <div className="space-y-4">
          <p className="text-text-secondary">
            Account management options will be available here.
          </p>
          
          {/* Future: Change password, delete account, etc. */}
        </div>
      </div>
    </div>
  );
}