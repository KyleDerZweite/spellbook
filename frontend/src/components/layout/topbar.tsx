'use client';

import Link from 'next/link';
import { useAuthStore } from '../../stores/auth';
import { LogOut, Search, Library, Settings, Shield, User, Layers } from 'lucide-react';

export function Topbar() {
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    logout();
    // Note: We're doing a simple logout here without API call to avoid React Query dependency
    // The full logout with API call can be handled elsewhere if needed
  };

  return (
    <div className="sticky top-0 z-40 glass px-4 py-3 flex items-center justify-between">
      <Link href="/" className="font-semibold tracking-wide text-lg">
        <span className="text-primary">{process.env.NEXT_PUBLIC_APP_NAME || 'Spellbook'}</span>
      </Link>
      
      <div className="flex items-center gap-4 text-sm text-text-secondary">
        {user && (
          <>
            <Link 
              href="/search" 
              className="hover:text-white hover:accent-ring rounded-md px-2 py-1 flex items-center gap-1 transition-all"
            >
              <Search size={16} />
              <span className="hidden sm:inline">Search</span>
            </Link>
            
            <Link 
              href="/collection" 
              className="hover:text-white hover:accent-ring rounded-md px-2 py-1 flex items-center gap-1 transition-all"
            >
              <Library size={16} />
              <span className="hidden sm:inline">Collection</span>
            </Link>
            
            <Link 
              href="/decks" 
              className="hover:text-white hover:accent-ring rounded-md px-2 py-1 flex items-center gap-1 transition-all"
            >
              <Layers size={16} />
              <span className="hidden sm:inline">Decks</span>
            </Link>
            
            <Link 
              href="/settings" 
              className="hover:text-white hover:accent-ring rounded-md px-2 py-1 flex items-center gap-1 transition-all"
            >
              <Settings size={16} />
              <span className="hidden sm:inline">Settings</span>
            </Link>
            
            {user?.is_admin && (
              <Link 
                href="/admin" 
                className="hover:text-white hover:accent-ring rounded-md px-2 py-1 flex items-center gap-1 transition-all"
              >
                <Shield size={16} />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}
            
            <div className="flex items-center gap-2 text-text-muted">
              <User size={14} />
              <span className="hidden md:inline">{user.username}</span>
            </div>
            
            <button 
              onClick={handleLogout} 
              className="ml-2 hover:text-white flex items-center gap-2 transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </>
        )}
        
        {!user && (
          <>
            <Link 
              href="/login" 
              className="hover:text-white transition-colors"
            >
              Login
            </Link>
            <Link 
              href="/register" 
              className="px-3 py-1 rounded-md bg-primary hover:bg-primary/90 text-white transition-colors"
            >
              Register
            </Link>
          </>
        )}
      </div>
    </div>
  );
}