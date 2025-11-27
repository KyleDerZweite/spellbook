'use client';

import { useAuth } from '../../../lib/auth';
import { Settings, User, Shield, AlertTriangle } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-foreground-muted mt-1">
          Manage your account and preferences
        </p>
      </div>

      {/* User Information */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <User className="w-5 h-5 text-accent" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Account Information
          </h2>
        </div>
        
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-2">
                Username
              </label>
              <div className="bg-background border border-border rounded-lg px-4 py-2.5 text-foreground">
                {user?.username}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-2">
                Email
              </label>
              <div className="bg-background border border-border rounded-lg px-4 py-2.5 text-foreground">
                {user?.email}
              </div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-2">
                Account Status
              </label>
              <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-4 py-2.5">
                <div className={`w-2 h-2 rounded-full ${
                  user?.status === 'APPROVED' ? 'bg-success' : 'bg-warning'
                }`} />
                <span className="text-foreground capitalize">
                  {user?.status?.toLowerCase().replace('_', ' ')}
                </span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-2">
                Role
              </label>
              <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-4 py-2.5">
                {user?.is_admin && <Shield size={16} className="text-accent" />}
                <span className="text-foreground">
                  {user?.is_admin ? 'Administrator' : 'User'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-background-tertiary flex items-center justify-center">
            <Settings className="w-5 h-5 text-foreground-muted" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Preferences
          </h2>
        </div>
        
        <div className="text-center py-8">
          <p className="text-foreground-muted">
            More preference options coming soon...
          </p>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-error/5 border border-error/20 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-error/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-error" />
          </div>
          <h2 className="text-lg font-semibold text-error">
            Danger Zone
          </h2>
        </div>
        
        <p className="text-foreground-muted">
          Account management options will be available here.
        </p>
      </div>
    </div>
  );
}
