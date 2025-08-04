"use client";

import withAuth from '@/components/auth/withAuth';
import { useAuthStore } from '@/lib/store/auth';

function AccountPage() {
  const { user } = useAuthStore();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Account Settings</h1>
      <div className="bg-card border border-border rounded-lg p-6 max-w-md">
        <h2 className="text-xl font-semibold mb-4">Profile Information</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Username</label>
            <p className="text-foreground">{user?.username}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Email</label>
            <p className="text-foreground">{user?.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Account Type</label>
            <p className="text-foreground">{user?.is_admin ? 'Administrator' : 'User'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default withAuth(AccountPage);