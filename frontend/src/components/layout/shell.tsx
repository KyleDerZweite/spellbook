'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '../../stores/auth';
import { 
  Search, 
  Library, 
  Layers, 
  Settings, 
  Shield, 
  LogOut, 
  Sparkles,
  Home,
  Camera,
  Menu,
  X
} from 'lucide-react';
import { useState } from 'react';

interface ShellProps {
  children: React.ReactNode;
}

const navItems = [
  { href: '/', icon: Home, label: 'Dashboard' },
  { href: '/search', icon: Search, label: 'Search Cards' },
  { href: '/collection', icon: Library, label: 'My Collection' },
  { href: '/decks', icon: Layers, label: 'Decks' },
  { href: '/scans', icon: Camera, label: 'Scan Cards' },
];

export function Shell({ children }: ShellProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-mystic">
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-50 flex items-center justify-between px-4 h-14 bg-background-secondary/95 backdrop-blur-sm border-b border-border">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 text-foreground-muted hover:text-foreground transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <span className="font-semibold text-foreground">Spellbook</span>
        </Link>
        <div className="w-9" /> {/* Spacer for centering */}
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" 
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-background-secondary border-r border-border
        transform transition-transform duration-200 ease-out
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-border">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center shadow-glow">
              <Sparkles className="w-4 h-4 text-accent" />
            </div>
            <span className="font-semibold text-foreground">Spellbook</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 text-foreground-muted hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${isActive 
                    ? 'bg-accent/15 text-accent border border-accent/20 shadow-glow' 
                    : 'text-foreground-muted hover:text-foreground hover:bg-card-hover border border-transparent'
                  }
                `}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-3 my-3 h-px bg-border/50" />

        {/* Settings & Admin */}
        <nav className="px-3 space-y-1">
          <Link
            href="/settings"
            onClick={() => setSidebarOpen(false)}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
              ${pathname === '/settings' 
                ? 'bg-accent/15 text-accent border border-accent/20 shadow-glow' 
                : 'text-foreground-muted hover:text-foreground hover:bg-card-hover border border-transparent'
              }
            `}
          >
            <Settings className="w-5 h-5" />
            Settings
          </Link>

          {user?.is_admin && (
            <Link
              href="/admin"
              onClick={() => setSidebarOpen(false)}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${pathname === '/admin' 
                  ? 'bg-mana-gold/15 text-mana-gold border border-mana-gold/20' 
                  : 'text-foreground-muted hover:text-foreground hover:bg-card-hover border border-transparent'
                }
              `}
            >
              <Shield className="w-5 h-5" />
              Admin Panel
            </Link>
          )}
        </nav>

        {/* User Section */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-border bg-background-secondary">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-9 h-9 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center">
              <span className="text-sm font-medium text-accent">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.username}
              </p>
              <p className="text-xs text-foreground-muted truncate">
                {user?.email}
              </p>
            </div>
            <button
              onClick={() => logout()}
              className="p-2 text-foreground-muted hover:text-error hover:bg-error/10 rounded-lg transition-all"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
