import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useForm } from 'react-hook-form'
import { 
  Shield, 
  Users, 
  UserPlus, 
  Key, 
  Loader2, 
  Trash2, 
  Ban, 
  CheckCircle, 
  Lock,
  MoreVertical,
  X,
  AlertTriangle
} from 'lucide-react'
import { Card, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AdminUser } from '@/lib/types'

export function AdminPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [modalType, setModalType] = useState<'suspend' | 'password' | 'delete' | null>(null)

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

  const suspendMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) => 
      api.admin.suspendUser(userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
      closeModal()
    },
  })

  const unsuspendMutation = useMutation({
    mutationFn: (userId: string) => api.admin.unsuspendUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: ({ userId, newPassword }: { userId: string; newPassword: string }) => 
      api.admin.changeUserPassword(userId, newPassword),
    onSuccess: () => {
      closeModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => api.admin.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] })
      closeModal()
    },
  })

  const openModal = (u: AdminUser, type: 'suspend' | 'password' | 'delete') => {
    setSelectedUser(u)
    setModalType(type)
  }

  const closeModal = () => {
    setSelectedUser(null)
    setModalType(null)
  }

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
            <div className="p-2 rounded-full bg-error/20">
              <Ban className="h-5 w-5 text-error" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsQuery.data?.suspended_users || 0}</p>
              <p className="text-muted-foreground text-sm">Suspended</p>
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
          <div className="space-y-3">
            {(usersQuery.data as AdminUser[] | undefined)?.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                currentUserId={user?.id}
                onSuspend={() => openModal(u, 'suspend')}
                onUnsuspend={() => unsuspendMutation.mutate(u.id)}
                onChangePassword={() => openModal(u, 'password')}
                onDelete={() => openModal(u, 'delete')}
                isUnsuspending={unsuspendMutation.isPending}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Modals */}
      {modalType === 'suspend' && selectedUser && (
        <SuspendModal
          user={selectedUser}
          onClose={closeModal}
          onConfirm={(reason) => suspendMutation.mutate({ userId: selectedUser.id, reason })}
          loading={suspendMutation.isPending}
        />
      )}

      {modalType === 'password' && selectedUser && (
        <ChangePasswordModal
          user={selectedUser}
          onClose={closeModal}
          onConfirm={(newPassword) => changePasswordMutation.mutate({ userId: selectedUser.id, newPassword })}
          loading={changePasswordMutation.isPending}
          error={changePasswordMutation.isError}
        />
      )}

      {modalType === 'delete' && selectedUser && (
        <DeleteModal
          user={selectedUser}
          onClose={closeModal}
          onConfirm={() => deleteMutation.mutate(selectedUser.id)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  )
}

function UserRow({
  user,
  currentUserId,
  onSuspend,
  onUnsuspend,
  onChangePassword,
  onDelete,
  isUnsuspending,
}: {
  user: AdminUser
  currentUserId?: string
  onSuspend: () => void
  onUnsuspend: () => void
  onChangePassword: () => void
  onDelete: () => void
  isUnsuspending: boolean
}) {
  const [showActions, setShowActions] = useState(false)
  const isSelf = user.id === currentUserId
  const isSuspended = user.status === 'SUSPENDED'

  const getStatusBadge = () => {
    switch (user.status) {
      case 'SUSPENDED':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-error/20 text-error">Suspended</span>
      case 'PENDING':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-warning/20 text-warning">Pending</span>
      case 'REJECTED':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">Rejected</span>
      case 'APPROVED':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-success/20 text-success">Active</span>
      default:
        return null
    }
  }

  return (
    <div className="flex justify-between items-center border-b border-border/60 pb-3 last:border-b-0">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{user.username}</span>
          {user.is_admin && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-primary/20 text-primary">Admin</span>
          )}
          {getStatusBadge()}
        </div>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        {isSuspended && user.suspension_reason && (
          <p className="text-xs text-error mt-1">
            <Ban className="h-3 w-3 inline mr-1" />
            Reason: {user.suspension_reason}
          </p>
        )}
      </div>
      
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowActions(!showActions)}
          disabled={isSelf}
          title={isSelf ? "Cannot modify your own account" : "Actions"}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
        
        {showActions && !isSelf && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowActions(false)} 
            />
            <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-md shadow-lg min-w-[160px]">
              <button
                className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2"
                onClick={() => { onChangePassword(); setShowActions(false) }}
              >
                <Lock className="h-4 w-4" />
                Change Password
              </button>
              
              {isSuspended ? (
                <button
                  className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2 text-success"
                  onClick={() => { onUnsuspend(); setShowActions(false) }}
                  disabled={isUnsuspending}
                >
                  {isUnsuspending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Unsuspend
                </button>
              ) : !user.is_admin ? (
                <button
                  className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2 text-warning"
                  onClick={() => { onSuspend(); setShowActions(false) }}
                >
                  <Ban className="h-4 w-4" />
                  Suspend
                </button>
              ) : null}
              
              {!user.is_admin && (
                <button
                  className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2 text-error"
                  onClick={() => { onDelete(); setShowActions(false) }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete User
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Modal({ 
  children, 
  onClose 
}: { 
  children: React.ReactNode
  onClose: () => void 
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <button
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  )
}

function SuspendModal({
  user,
  onClose,
  onConfirm,
  loading,
}: {
  user: AdminUser
  onClose: () => void
  onConfirm: (reason?: string) => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')

  return (
    <Modal onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-warning/20">
            <Ban className="h-6 w-6 text-warning" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Suspend User</h3>
            <p className="text-sm text-muted-foreground">
              Suspend <span className="font-medium">{user.username}</span>?
            </p>
          </div>
        </div>
        
        <div>
          <Label htmlFor="reason" className="text-sm">
            Suspension Reason (optional)
          </Label>
          <textarea
            id="reason"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            rows={3}
            placeholder="Enter reason for suspension..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            This reason will be shown to the user when they try to log in.
          </p>
        </div>
        
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button 
            onClick={() => onConfirm(reason || undefined)} 
            disabled={loading}
            className="flex-1 bg-warning hover:bg-warning/90"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Suspend User'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ChangePasswordModal({
  user,
  onClose,
  onConfirm,
  loading,
  error,
}: {
  user: AdminUser
  onClose: () => void
  onConfirm: (newPassword: string) => void
  loading: boolean
  error: boolean
}) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validationError, setValidationError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match')
      return
    }
    setValidationError('')
    onConfirm(password)
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-primary/20">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Change Password</h3>
            <p className="text-sm text-muted-foreground">
              Set new password for <span className="font-medium">{user.username}</span>
            </p>
          </div>
        </div>
        
        <div className="space-y-3">
          <div>
            <Label htmlFor="new-password" className="text-sm">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              className="mt-1"
              minLength={8}
              required
            />
          </div>
          <div>
            <Label htmlFor="confirm-password" className="text-sm">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="mt-1"
              required
            />
          </div>
        </div>
        
        {(validationError || error) && (
          <p className="text-sm text-error">
            {validationError || 'Failed to change password'}
          </p>
        )}
        
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Change Password'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteModal({
  user,
  onClose,
  onConfirm,
  loading,
}: {
  user: AdminUser
  onClose: () => void
  onConfirm: () => void
  loading: boolean
}) {
  const [confirmText, setConfirmText] = useState('')
  const isConfirmed = confirmText === user.username

  return (
    <Modal onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-error/20">
            <AlertTriangle className="h-6 w-6 text-error" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Delete User</h3>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone!
            </p>
          </div>
        </div>
        
        <p className="text-sm">
          Deleting <span className="font-medium">{user.username}</span> will permanently remove 
          their account and all associated data including collections and decks.
        </p>
        
        <div>
          <Label htmlFor="confirm" className="text-sm">
            Type <span className="font-mono font-bold">{user.username}</span> to confirm
          </Label>
          <Input
            id="confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Enter username to confirm"
            className="mt-1"
          />
        </div>
        
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={loading || !isConfirmed}
            variant="destructive"
            className="flex-1"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete User'}
          </Button>
        </div>
      </div>
    </Modal>
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
