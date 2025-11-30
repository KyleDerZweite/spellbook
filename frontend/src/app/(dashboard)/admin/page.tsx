'use client';

import { useAuth } from '../../../lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useForm } from 'react-hook-form';
import { Shield, Users, UserPlus, Key, Loader2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils'; // Assuming cn utility is available

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
        <Card className="p-8 text-center max-w-md"> 
          <Shield className="mx-auto mb-4 text-foreground-muted" size={48} /> 
          <CardTitle className="text-xl font-semibold mb-2"> 
            Access Denied
          </CardTitle>
          <p className="text-foreground-muted"> 
            You need administrator privileges to access this page.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-5"> {/* Replaced elevated with Card */}
        <CardTitle className="font-semibold flex items-center gap-2"> 
          <Shield className="h-5 w-5 text-primary" />
          Admin Panel
        </CardTitle>
        <p className="text-foreground-muted text-sm">Manage users and invites</p> 
      </Card>

      {/* Stats */}
        <Card className="p-4"> 
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/20">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.total_users || 0}</p>
              <p className="text-foreground-muted text-sm">Total Users</p> 
            </div>
          </div>
        </Card>
        
        <Card className="p-4"> {/* Replaced elevated with Card */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-success/20"> 
              <UserPlus className="h-5 w-5 text-success" /> 
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.approved_users || 0}</p>
              <p className="text-foreground-muted text-sm">Approved</p> 
            </div>
          </div>
        </Card>

        <Card className="p-4"> {/* Replaced elevated with Card */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-warning/20"> 
              <Key className="h-5 w-5 text-warning" /> 
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.pending_users || 0}</p>
              <p className="text-foreground-muted text-sm">Pending</p> 
            </div>
          </div>
        </Card>

        <Card className="p-4"> {/* Replaced elevated with Card */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-mana-gold/20"> 
              <Shield className="h-5 w-5 text-mana-gold" /> 
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.admin_users || 0}</p>
              <p className="text-foreground-muted text-sm">Admins</p> 
            </div>
          </div>
        </Card>
      </div>

      {/* Create Forms */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5"> {/* Replaced elevated with Card */}
          <CardTitle className="font-medium mb-3">Create User</CardTitle> {/* Replaced h3 with CardTitle */}
          <CreateUserForm onSubmit={(v) => createUserMutation.mutate(v)} loading={createUserMutation.isPending} />
          {createUserMutation.isError && <p className="text-error text-sm mt-2">Failed to create user</p>} {/* Replaced red-400 with error */}
          {createUserMutation.isSuccess && <p className="text-success text-sm mt-2">User created successfully</p>} {/* Replaced green-400 with success */}
        </Card>

        <Card className="p-5"> {/* Replaced elevated with Card */}
          <CardTitle className="font-medium mb-3">Create Invite</CardTitle> {/* Replaced h3 with CardTitle */}
          <CreateInviteForm onSubmit={(v) => createInviteMutation.mutate(v)} loading={createInviteMutation.isPending} />
          {createInviteMutation.isSuccess && <p className="text-success text-sm mt-2">Invite created successfully</p>} {/* Replaced green-400 with success */}
          {createInviteMutation.isError && <p className="text-error text-sm mt-2">Failed to create invite</p>} {/* Replaced red-400 with error */}
        </Card>
      </div>

      {/* Users List */}
      <Card className="p-5 overflow-auto"> {/* Replaced elevated with Card */}
        <CardTitle className="font-medium mb-3">Users</CardTitle> {/* Replaced h3 with CardTitle */}
        {usersQuery.isLoading ? (
          <p className="text-foreground-muted">Loading users...</p> {/* Replaced text-text-secondary */}
        ) : (
          <div className="space-y-2">
            {usersQuery.data?.map((u) => (
              <div key={u.id} className="flex justify-between border-b border-border/60 pb-2">
                <span>{u.username} — {u.email}</span>
                <span className="text-xs text-foreground-muted"> {/* Replaced text-text-secondary */}
                  {u.status}{u.is_admin ? ' · admin' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
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
      <Input
        placeholder="Email" 
        {...register('email', { required: true })} 
        className="w-full bg-background border border-border rounded-md px-3 py-2" // Used Input component
      />
      <Input
        placeholder="Username" 
        {...register('username', { required: true })} 
        className="w-full bg-background border border-border rounded-md px-3 py-2" // Used Input component
      />
      <Input
        placeholder="Password" 
        type="password" 
        {...register('password', { required: true })} 
        className="w-full bg-background border border-border rounded-md px-3 py-2" // Used Input component
      />
      <Label className="flex items-center gap-2 text-sm text-foreground-muted"> {/* Used Label, replaced text-text-secondary */}
        <Input type="checkbox" {...register('is_admin')} className="w-4 h-4" />
        Admin
      </Label>
      <Button 
        type="submit"
        disabled={loading} 
        className="w-full" // Used Button component, removed btn-primary
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
      </Button>
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
      <Input
        placeholder="Email restriction (optional)" 
        {...register('email_restriction')} 
        className="w-full bg-background border border-border rounded-md px-3 py-2" // Used Input component
      />
      <Input
        placeholder="Max uses" 
        type="number" 
        {...register('max_uses', { valueAsNumber: true })} 
        className="w-full bg-background border border-border rounded-md px-3 py-2" // Used Input component
      />
      <Input
        placeholder="Expires at (YYYY-MM-DD)" 
        type="date"
        {...register('expires_at')} 
        className="w-full bg-background border border-border rounded-md px-3 py-2" // Used Input component
      />
      <Button 
        type="submit"
        disabled={loading} 
        className="w-full" // Used Button component, removed btn-primary
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Invite'}
      </Button>
    </form>
  );
}