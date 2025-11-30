'use client';

import { useAuth } from '../../../lib/auth';
import { Settings, User, Shield, AlertTriangle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
      <Card className="p-6"> {/* Replaced div with Card */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"> {/* Changed accent to primary */}
            <User className="w-5 h-5 text-primary" />
          </div>
          <CardTitle className="text-lg font-semibold text-foreground"> {/* Replaced h2 with CardTitle */}
            Account Information
          </CardTitle>
        </div>
        
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Label className="block text-sm font-medium text-foreground-muted mb-2"> {/* Replaced label with Label */}
                Username
              </Label>
              <Input value={user?.username || ''} disabled className="bg-background border-border" />
            </div>
            
            <div>
              <Label className="block text-sm font-medium text-foreground-muted mb-2"> {/* Replaced label with Label */}
                Email
              </Label>
              <Input value={user?.email || ''} disabled className="bg-background border-border" />
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Label className="block text-sm font-medium text-foreground-muted mb-2"> {/* Replaced label with Label */}
                Account Status
              </Label>
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
              <Label className="block text-sm font-medium text-foreground-muted mb-2"> {/* Replaced label with Label */}
                Role
              </Label>
              <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-4 py-2.5">
                {user?.is_admin && <Shield size={16} className="text-primary" />} {/* Changed accent to primary */}
                <span className="text-foreground">
                  {user?.is_admin ? 'Administrator' : 'User'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Preferences */}
      <Card className="p-6"> {/* Replaced div with Card */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-background-tertiary flex items-center justify-center">
            <Settings className="w-5 h-5 text-foreground-muted" />
          </div>
          <CardTitle className="text-lg font-semibold text-foreground"> {/* Replaced h2 with CardTitle */}
            Preferences
          </CardTitle>
        </div>
        
        <div className="text-center py-8">
          <p className="text-foreground-muted">
            More preference options coming soon...
          </p>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-error/5 border border-error/20 p-6"> {/* Replaced div with Card */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-error/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-error" />
          </div>
          <CardTitle className="text-lg font-semibold text-error"> {/* Replaced h2 with CardTitle */}
            Danger Zone
          </CardTitle>
        </div>
        
        <p className="text-foreground-muted">
          Account management options will be available here.
        </p>
      </Card>
    </div>
  );
}
