'use client';

import { useAuth } from '../../lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Shell } from '../../components/layout/shell';

export default function DashboardLayout({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 text-text-secondary">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (!user || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass rounded-xl p-6">
          <p className="text-text-secondary">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return <Shell>{children}</Shell>;
}