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
  Sparkles, // Using Sparkles for Spellbook branding
  Home,
  Camera,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils'; // Assuming cn utility is available and correct
import { Button } from '@/components/ui/button'; // Assuming Button component is available

interface ShellProps {
  children: React.ReactNode;
}

const navItems = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Search Cards', href: '/search', icon: Search },
  { name: 'My Collection', href: '/collection', icon: Library },
  { name: 'Decks', href: '/decks', icon: Layers },
  { name: 'Scan Cards', href: '/scans', icon: Camera },
];

export function Shell({ children }: ShellProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background font-sans text-foreground"> {/* Adjusted base background and text colors */}
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[280px] transform bg-sidebar/95 backdrop-blur-xl border-r border-success/10 transition-transform duration-300 ease-in-out lg:translate-x-0 shadow-2xl",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-24 items-center px-8 border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors"> {/* Changed to primary for Sparkles */}
              <Sparkles className="h-6 w-6 text-primary" /> {/* Using Sparkles */}
            </div>
            <span className="text-xl font-bold text-white tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              Spellbook
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden ml-auto hover:bg-white/5 text-muted-foreground hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex flex-col gap-2 p-4 mt-4">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href + "/")); // Adjusted for Next.js routing
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                  isActive
                    ? "bg-primary/10 text-primary shadow-[0_0_20px_rgb(var(--primary)/0.1)]" // Using rgb(var(--primary))
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary rounded-r-full shadow-[0_0_10px_rgb(var(--primary)/0.5)]" /> {/* Using rgb(var(--primary)) */}
                )}
                <item.icon
                  className={cn(
                    "h-5 w-5 transition-colors",
                    isActive ? "text-primary" : "group-hover:text-white"
                  )}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
          {/* Settings & Admin - Re-added below nav items with similar styling */}
          <div className="mx-3 my-3 h-px bg-border/50" /> {/* Divider */}
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 group relative overflow-hidden",
              pathname === '/settings'
                ? "bg-primary/10 text-primary shadow-[0_0_20px_rgb(var(--primary)/0.1)]"
                : "text-muted-foreground hover:bg-white/5 hover:text-white"
            )}
            onClick={() => setSidebarOpen(false)}
          >
            {pathname === '/settings' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary rounded-r-full shadow-[0_0_10px_rgb(var(--primary)/0.5)]" />
            )}
            <Settings
              className={cn(
                "h-5 w-5 transition-colors",
                pathname === '/settings' ? "text-primary" : "group-hover:text-white"
              )}
            />
            <span>Settings</span>
          </Link>

          {user?.is_admin && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                pathname.startsWith('/admin') // Check for admin path start
                  ? "bg-mana-gold/10 text-mana-gold shadow-[0_0_20px_rgb(var(--mana-gold)/0.1)]" // Use mana-gold
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              )}
              onClick={() => setSidebarOpen(false)}
            >
              {pathname.startsWith('/admin') && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-mana-gold rounded-r-full shadow-[0_0_10px_rgb(var(--mana-gold)/0.5)]" />
              )}
              <Shield
                className={cn(
                  "h-5 w-5 transition-colors",
                  pathname.startsWith('/admin') ? "text-mana-gold" : "group-hover:text-white"
                )}
              />
              <span>Admin Panel</span>
            </Link>
          )}
        </nav>

        {/* User Profile */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/5 p-6 bg-gradient-to-t from-black/20 to-transparent">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-violet-600 p-[1px] shadow-lg shadow-primary/20">
              <div className="h-full w-full rounded-[11px] bg-sidebar flex items-center justify-center">
                <span className="text-sm font-bold text-primary">
                  {user?.username?.[0]?.toUpperCase() || "U"}
                </span>
              </div>
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-semibold text-white truncate">
                {user?.username}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                {user?.is_admin ? "Admin" : "User"} {/* Using user.is_admin */}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-error hover:bg-error/10 h-9 text-xs font-medium transition-colors"
            onClick={logout}
          >
            <LogOut className="h-3.5 w-3.5 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-[280px] min-h-screen flex flex-col transition-all duration-300">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-white/5 bg-sidebar px-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-bold text-lg">Spellbook</span> {/* Changed to Spellbook */}
        </header>

        {/* Main Content */}
        <main className="flex-1 min-h-screen transition-all duration-300">
          <div className="container mx-auto p-6 md:p-8 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}