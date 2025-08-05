"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import withAuth from '@/components/auth/withAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Users, Settings, CheckCircle, XCircle, Clock, Shield, UserMinus, Trash2 } from 'lucide-react';
import { getAllUsers, getSystemSettings, updateUserStatus, updateRegistrationMode, getAdminStats, deleteUser, AdminUser, SystemSettings, AdminStats } from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/auth';

// Helper function to generate random verification string
const generateVerificationString = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

function AdminPage() {
  const [selectedTab, setSelectedTab] = useState<'users' | 'settings'>('users');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();

  // Deletion verification state
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteUsername, setDeleteUsername] = useState<string>('');
  const [verificationString, setVerificationString] = useState('');
  const [userInput, setUserInput] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);


  const { data: users, isLoading: usersLoading, isError: usersError } = useQuery({
    queryKey: ['admin-users'],
    queryFn: getAllUsers,
    enabled: !!currentUser?.is_admin,
    retry: false,
    refetchOnWindowFocus: false
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: getSystemSettings,
    enabled: !!currentUser?.is_admin,
    retry: false,
    refetchOnWindowFocus: false
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: getAdminStats,
    enabled: !!currentUser?.is_admin,
    retry: false,
    refetchOnWindowFocus: false
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: string }) => updateUserStatus(userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast({
        title: "User Updated",
        description: "User status has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.response?.data?.detail || "Could not update user status",
        variant: "destructive",
      });
    }
  });

  const updateSettingsMutation = useMutation({
    mutationFn: updateRegistrationMode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      toast({
        title: "Settings Updated",
        description: "Registration mode has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.response?.data?.detail || "Could not update settings",
        variant: "destructive",
      });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast({
        title: "User Deleted",
        description: data.message || "User has been permanently deleted.",
      });
      setIsDeleteDialogOpen(false);
      setDeleteUserId(null);
      setDeleteUsername('');
      setUserInput('');
      setVerificationString('');
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-warning/20 text-warning border-warning/30"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge variant="secondary" className="bg-success/20 text-success border-success/30"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'suspended':
        return <Badge variant="secondary" className="bg-destructive/20 text-destructive border-destructive/30"><UserMinus className="h-3 w-3 mr-1" />Suspended</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const openDeleteDialog = (user: AdminUser) => {
    const newVerificationString = generateVerificationString();
    setDeleteUserId(user.id);
    setDeleteUsername(user.username);
    setVerificationString(newVerificationString);
    setUserInput('');
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteUser = () => {
    if (userInput.toUpperCase() === verificationString && deleteUserId) {
      deleteUserMutation.mutate(deleteUserId);
    } else {
      toast({
        title: "Verification Failed",
        description: "Please type the verification string exactly as shown.",
        variant: "destructive",
      });
    }
  };

  const pendingUsers = users?.filter(user => user.status === 'pending') || [];
  const allUsersCount = stats?.total_users || 0;
  const pendingCount = stats?.pending_users || 0;
  const adminCount = stats?.admin_users || 0;

  // Show access denied message if user is not admin
  if (currentUser && !currentUser.is_admin) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You need administrator privileges to access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground flex items-center">
          <Shield className="h-8 w-8 mr-3 text-primary" />
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Manage users, configure settings, and oversee system operations
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-primary mr-4" />
              <div>
                <p className="text-2xl font-bold">{statsLoading ? '...' : allUsersCount}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-warning mr-4" />
              <div>
                <p className="text-2xl font-bold">{statsLoading ? '...' : pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pending Approval</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-success mr-4" />
              <div>
                <p className="text-2xl font-bold">{statsLoading ? '...' : adminCount}</p>
                <p className="text-sm text-muted-foreground">Administrators</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6">
        <Button
          variant={selectedTab === 'users' ? 'default' : 'ghost'}
          onClick={() => setSelectedTab('users')}
          className="flex items-center space-x-2"
        >
          <Users className="h-4 w-4" />
          <span>User Management</span>
        </Button>
        <Button
          variant={selectedTab === 'settings' ? 'default' : 'ghost'}
          onClick={() => setSelectedTab('settings')}
          className="flex items-center space-x-2"
        >
          <Settings className="h-4 w-4" />
          <span>System Settings</span>
        </Button>
      </div>

      {/* Tab Content */}
      {selectedTab === 'users' && (
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
          </CardHeader>
          <CardContent>
            {usersError && (
              <div className="text-center py-8">
                <p className="text-destructive">Failed to load users. Please try again.</p>
              </div>
            )}

            {usersLoading && (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            )}

            {!usersLoading && !usersError && users && (
              <div className="space-y-4">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div>
                          <p className="font-semibold text-foreground">{user.username}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                        {user.is_admin && (
                          <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                            <Shield className="h-3 w-3 mr-1" />Admin
                          </Badge>
                        )}
                        {getStatusBadge(user.status)}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        <span>Joined: {formatDate(user.created_at)}</span>
                        {user.last_login_at && (
                          <span className="ml-4">Last Login: {formatDate(user.last_login_at)}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {user.status === 'pending' && (
                        <>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="success" size="sm">
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Approve User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to approve {user.username}? They will gain access to the platform.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => updateUserMutation.mutate({ userId: user.id, status: 'approved' })}>
                                  Approve User
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reject User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to reject {user.username}? This action cannot be undone easily.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => updateUserMutation.mutate({ userId: user.id, status: 'rejected' })}>
                                  Reject User
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                      
                      {user.status === 'approved' && !user.is_admin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="warning" size="sm">
                              <UserMinus className="h-4 w-4 mr-1" />
                              Suspend
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Suspend User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to suspend {user.username}? They will lose access to the platform.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => updateUserMutation.mutate({ userId: user.id, status: 'suspended' })}>
                                Suspend User
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      
                      {user.status === 'suspended' && (
                        <Button 
                          variant="success" 
                          size="sm"
                          onClick={() => updateUserMutation.mutate({ userId: user.id, status: 'approved' })}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Reactivate
                        </Button>
                      )}
                      
                      {/* Delete button for all users except admins and current user */}
                      {!user.is_admin && user.id !== currentUser?.id && (
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => openDeleteDialog(user)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedTab === 'settings' && (
        <Card>
          <CardHeader>
            <CardTitle>System Settings</CardTitle>
          </CardHeader>
          <CardContent>
            {settingsLoading && <Skeleton className="h-20 w-full" />}
            
            {!settingsLoading && settings && (
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Registration Mode
                  </label>
                  <Select
                    value={settings.registration_mode}
                    onValueChange={(value) => updateSettingsMutation.mutate(value)}
                  >
                    <SelectTrigger className="w-full max-w-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">
                        <div>
                          <p className="font-medium">Open Registration</p>
                          <p className="text-xs text-muted-foreground">Anyone can register immediately</p>
                        </div>
                      </SelectItem>
                      <SelectItem value="INVITE_ONLY">
                        <div>
                          <p className="font-medium">Invite Only</p>
                          <p className="text-xs text-muted-foreground">Requires valid invite code</p>
                        </div>
                      </SelectItem>
                      <SelectItem value="ADMIN_APPROVAL">
                        <div>
                          <p className="font-medium">Admin Approval</p>
                          <p className="text-xs text-muted-foreground">Admin must approve each registration</p>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Current registration mode determines how new users can join the platform.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* User Deletion Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Account</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>This action cannot be undone. This will permanently delete <strong>{deleteUsername}</strong>&apos;s account and remove all their data from the system.</p>
                
                <div className="space-y-2">
                  <p className="font-medium">To confirm, type the following verification code:</p>
                  <div 
                    className="bg-muted p-3 rounded font-mono text-lg text-center tracking-wider select-none"
                    style={{ userSelect: 'none' }}
                  >
                    {verificationString}
                  </div>
                  <Input
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="Type the verification code here"
                    className="mt-2"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setUserInput('');
              setVerificationString('');
              setDeleteUserId(null);
              setDeleteUsername('');
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={userInput.toUpperCase() !== verificationString || deleteUserMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
            >
              {deleteUserMutation.isPending ? 'Deleting...' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default withAuth(AdminPage);