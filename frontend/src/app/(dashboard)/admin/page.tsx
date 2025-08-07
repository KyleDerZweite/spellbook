'use client';

import { useAuth } from '../../../lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useForm } from 'react-hook-form';
import { Shield, Users, UserPlus, Key, Loader2 } from 'lucide-react';

export default function AdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: api.admin.users,
    enabled: !!user?.is_admin,
  });

  const statsQuery = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: api.admin.stats,
    enabled: !!user?.is_admin,
  });

  const createUserMutation = useMutation({
    mutationFn: api.admin.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: api.admin.createInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });
    },
  });

  if (!user?.is_admin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="elevated p-8 text-center max-w-md">
          <Shield className="mx-auto mb-4 text-text-muted" size={48} />
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Access Denied
          </h2>
          <p className="text-text-secondary">
            You need administrator privileges to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="elevated p-5">
        <h2 className="font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Admin Panel
        </h2>
        <p className="text-text-secondary text-sm">Manage users and invites</p>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="elevated p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/20">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.total_users || 0}</p>
              <p className="text-text-secondary text-sm">Total Users</p>
            </div>
          </div>
        </div>
        
        <div className="elevated p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-500/20">
              <UserPlus className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.approved_users || 0}</p>
              <p className="text-text-secondary text-sm">Approved</p>
            </div>
          </div>
        </div>

        <div className="elevated p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-yellow-500/20">
              <Key className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.pending_users || 0}</p>
              <p className="text-text-secondary text-sm">Pending</p>
            </div>
          </div>
        </div>

        <div className="elevated p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary-variant/20">
              <Shield className="h-5 w-5 text-primary-variant" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.admin_users || 0}</p>
              <p className="text-text-secondary text-sm">Admins</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create Forms */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="elevated p-5">
          <h3 className="font-medium mb-3">Create User</h3>
          <CreateUserForm onSubmit={(v) => createUserMutation.mutate(v)} loading={createUserMutation.isPending} />
          {createUserMutation.isError && <p className="text-red-400 text-sm mt-2">Failed to create user</p>}
          {createUserMutation.isSuccess && <p className="text-green-400 text-sm mt-2">User created successfully</p>}
        </div>

        <div className="elevated p-5">
          <h3 className="font-medium mb-3">Create Invite</h3>
          <CreateInviteForm onSubmit={(v) => createInviteMutation.mutate(v)} loading={createInviteMutation.isPending} />
          {createInviteMutation.isSuccess && <p className="text-green-400 text-sm mt-2">Invite created successfully</p>}
          {createInviteMutation.isError && <p className="text-red-400 text-sm mt-2">Failed to create invite</p>}
        </div>
      </div>

      {/* Users List */}
      <div className="elevated p-5 overflow-auto">
        <h3 className="font-medium mb-3">Users</h3>
        {usersQuery.isLoading ? (
          <p className="text-text-secondary">Loading users...</p>
        ) : (
          <div className="space-y-2">
            {usersQuery.data?.map((u) => (
              <div key={u.id} className="flex justify-between border-b border-border/60 pb-2">
                <span>{u.username} — {u.email}</span>
                <span className="text-xs text-text-secondary">
                  {u.status}{u.is_admin ? ' · admin' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Form Components
function CreateUserForm({ 
  onSubmit, 
  loading 
}: { 
  onSubmit: (v: { email: string; username: string; password: string; is_admin?: boolean }) => void; 
  loading: boolean 
}) {
  const { register, handleSubmit, reset } = useForm<{ 
    email: string; 
    username: string; 
    password: string; 
    is_admin?: boolean 
  }>();
  
  return (
    <form onSubmit={handleSubmit((data) => {
      onSubmit(data);
      reset();
    })} className="space-y-3">
      <input 
        placeholder="Email" 
        {...register('email', { required: true })} 
        className="w-full bg-surface-variant border border-border rounded-md px-3 py-2" 
      />
      <input 
        placeholder="Username" 
        {...register('username', { required: true })} 
        className="w-full bg-surface-variant border border-border rounded-md px-3 py-2" 
      />
      <input 
        placeholder="Password" 
        type="password" 
        {...register('password', { required: true })} 
        className="w-full bg-surface-variant border border-border rounded-md px-3 py-2" 
      />
      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input type="checkbox" {...register('is_admin')} /> 
        Admin
      </label>
      <button 
        disabled={loading} 
        className="px-4 py-2 rounded-md btn-primary flex items-center justify-center w-full"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
      </button>
    </form>
  );
}

function CreateInviteForm({ 
  onSubmit, 
  loading 
}: { 
  onSubmit: (v: { email_restriction?: string; max_uses?: number; expires_at?: string }) => void; 
  loading: boolean 
}) {
  const { register, handleSubmit, reset } = useForm<{ 
    email_restriction?: string; 
    max_uses?: number; 
    expires_at?: string 
  }>();
  
  return (
    <form onSubmit={handleSubmit((data) => {
      onSubmit(data);
      reset();
    })} className="space-y-3">
      <input 
        placeholder="Email restriction (optional)" 
        {...register('email_restriction')} 
        className="w-full bg-surface-variant border border-border rounded-md px-3 py-2" 
      />
      <input 
        placeholder="Max uses" 
        type="number" 
        {...register('max_uses', { valueAsNumber: true })} 
        className="w-full bg-surface-variant border border-border rounded-md px-3 py-2" 
      />
      <input 
        placeholder="Expires at (YYYY-MM-DD)" 
        type="date"
        {...register('expires_at')} 
        className="w-full bg-surface-variant border border-border rounded-md px-3 py-2" 
      />
      <button 
        disabled={loading} 
        className="px-4 py-2 rounded-md btn-primary flex items-center justify-center w-full"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Invite'}
      </button>
    </form>
  );
}