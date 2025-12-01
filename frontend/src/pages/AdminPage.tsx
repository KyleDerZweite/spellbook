import { useAuth } from '@/lib/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useForm } from 'react-hook-form'
import { Shield, Users, UserPlus, Key, Loader2 } from 'lucide-react'
import { Card, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AdminPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: api.admin.users,
    enabled: !!user?.is_admin,
  })

  const statsQuery = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: api.admin.stats,
    enabled: !!user?.is_admin,
  })

  const createUserMutation = useMutation({
    mutationFn: api.admin.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
    },
  })

  const createInviteMutation = useMutation({
    mutationFn: api.admin.createInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] })
    },
  })

  if (!user?.is_admin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="p-8 text-center max-w-md">
          <Shield className="mx-auto mb-4 text-muted-foreground" size={48} />
          <CardTitle className="text-xl font-semibold mb-2">
            Access Denied
          </CardTitle>
          <p className="text-muted-foreground">
            You need administrator privileges to access this page.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-5">
        <CardTitle className="font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Admin Panel
        </CardTitle>
        <p className="text-muted-foreground text-sm mt-2">Manage users and invites</p>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/20">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.total_users || 0}</p>
              <p className="text-muted-foreground text-sm">Total Users</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-success/20">
              <UserPlus className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.approved_users || 0}</p>
              <p className="text-muted-foreground text-sm">Approved</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-warning/20">
              <Key className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.pending_users || 0}</p>
              <p className="text-muted-foreground text-sm">Pending</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-mana-gold/20">
              <Shield className="h-5 w-5 text-mana-gold" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.admin_users || 0}</p>
              <p className="text-muted-foreground text-sm">Admins</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Create Forms */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <CardTitle className="font-medium mb-4">Create User</CardTitle>
          <CreateUserForm
            onSubmit={(v) => createUserMutation.mutate(v)}
            loading={createUserMutation.isPending}
          />
          {createUserMutation.isError && (
            <p className="text-error text-sm mt-2">Failed to create user</p>
          )}
          {createUserMutation.isSuccess && (
            <p className="text-success text-sm mt-2">User created successfully</p>
          )}
        </Card>

        <Card className="p-5">
          <CardTitle className="font-medium mb-4">Create Invite</CardTitle>
          <CreateInviteForm
            onSubmit={(v) => createInviteMutation.mutate(v)}
            loading={createInviteMutation.isPending}
          />
          {createInviteMutation.isSuccess && (
            <p className="text-success text-sm mt-2">Invite created successfully</p>
          )}
          {createInviteMutation.isError && (
            <p className="text-error text-sm mt-2">Failed to create invite</p>
          )}
        </Card>
      </div>

      {/* Users List */}
      <Card className="p-5 overflow-auto">
        <CardTitle className="font-medium mb-4">Users</CardTitle>
        {usersQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading users...
          </div>
        ) : (
          <div className="space-y-2">
            {usersQuery.data?.map((u) => (
              <div key={u.id} className="flex justify-between items-center border-b border-border/60 pb-2">
                <span className="font-medium">{u.username} — {u.email}</span>
                <span className="text-xs text-muted-foreground">
                  {u.status}{u.is_admin ? ' · admin' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function CreateUserForm({
  onSubmit,
  loading
}: {
  onSubmit: (v: { email: string; username: string; password: string; is_admin?: boolean }) => void
  loading: boolean
}) {
  const { register, handleSubmit, reset } = useForm<{
    email: string
    username: string
    password: string
    is_admin?: boolean
  }>()

  return (
    <form onSubmit={handleSubmit((data) => {
      onSubmit(data)
      reset()
    })} className="space-y-3">
      <Input
        placeholder="Email"
        {...register('email', { required: true })}
      />
      <Input
        placeholder="Username"
        {...register('username', { required: true })}
      />
      <Input
        placeholder="Password"
        type="password"
        {...register('password', { required: true })}
      />
      <Label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" {...register('is_admin')} className="w-4 h-4" />
        Admin
      </Label>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create User'}
      </Button>
    </form>
  )
}

function CreateInviteForm({
  onSubmit,
  loading
}: {
  onSubmit: (v: { email_restriction?: string; max_uses?: number }) => void
  loading: boolean
}) {
  const { register, handleSubmit, reset } = useForm<{
    email_restriction?: string
    max_uses?: number
  }>()

  return (
    <form onSubmit={handleSubmit((data) => {
      onSubmit(data)
      reset()
    })} className="space-y-3">
      <Input
        placeholder="Email restriction (optional)"
        {...register('email_restriction')}
      />
      <Input
        placeholder="Max uses (optional)"
        type="number"
        {...register('max_uses', { valueAsNumber: true })}
      />
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Invite'}
      </Button>
    </form>
  )
}
