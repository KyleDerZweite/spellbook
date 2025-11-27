'use client';

import Link from 'next/link';
import { useAuthStore } from '../../stores/auth';
import { LogOut, Search, Library, Settings, Shield, User, Layers } from 'lucide-react';

export function Topbar() {
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    logout();
  };

  return (
    <div className="sticky top-0 z-40 glass-panel px-md py-sm flex items-center justify-between">
      <Link href="/" className="font-semibold tracking-wide text-lg">
        <span className="text-accent-primary">{process.env.NEXT_PUBLIC_APP_NAME || 'Spellbook'}</span>
      </Link>
      
      <div className="flex items-center gap-md text-sm text-text-secondary">
        {user && (
          <>
            <Link 
              href="/search" 
              className="hover:text-text-primary transition-colors flex items-center gap-xs"
            >
              <Search size={16} />
              <span className="hidden sm:inline">Search</span>
            </Link>
            
            <Link 
              href="/collection" 
              className="hover:text-text-primary transition-colors flex items-center gap-xs"
            >
              <Library size={16} />
              <span className="hidden sm:inline">Collection</span>
            </Link>
            
            <Link 
              href="/decks" 
              className="hover:text-text-primary transition-colors flex items-center gap-xs"
            >
              <Layers size={16} />
              <span className="hidden sm:inline">Decks</span>
            </Link>
            
            <Link 
              href="/settings" 
              className="hover:text-text-primary transition-colors flex items-center gap-xs"
            >
              <Settings size={16} />
              <span className="hidden sm:inline">Settings</span>
            </Link>
            
            {user?.is_admin && (
              <Link 
                href="/admin" 
                className="hover:text-text-primary transition-colors flex items-center gap-xs"
              >
                <Shield size={16} />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}
            
            <div className="flex items-center gap-xs text-text-secondary">
              <User size={14} />
              <span className="hidden md:inline">{user.username}</span>
            </div>
            
            <button 
              onClick={handleLogout} 
              className="ml-sm hover:text-text-primary flex items-center gap-xs transition-colors"
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
              className="hover:text-text-primary transition-colors"
            >
              Login
            </Link>
            <Link 
              href="/register" 
              className="px-sm py-xs rounded-md bg-accent-primary hover:bg-accent-hover text-text-primary transition-colors"
            >
              Register
            </Link>
          </>
        )}
      </div>
    </div>
  );
}