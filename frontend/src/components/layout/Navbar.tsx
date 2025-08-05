"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store/auth";
import { Search, Layers3, User, LogIn, LogOut, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated, logout, user } = useAuthStore();

  const navItems = [
    { href: "/search", label: "Search", icon: Search },
    { href: "/decks", label: "Decks", icon: Layers3 },
    { href: "/collections", label: "Collection", icon: Layers3 },
    { href: "/account", label: "Account", icon: User },
  ];

  // Add admin link for admin users
  const adminNavItems = user?.is_admin 
    ? [...navItems, { href: "/admin", label: "Admin", icon: Shield }]
    : navItems;

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="text-2xl font-bold text-primary hover:text-primary/80 transition-colors duration-200">
            Spellbook
          </Link>

          {/* Navigation Tabs */}
          <div className="flex space-x-1">
            {adminNavItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href === "/collections" && pathname.startsWith("/collections"));
              
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 flex items-center space-x-2 rounded-t-lg relative",
                      isActive
                        ? "text-primary border-primary bg-accent shadow-sm"
                        : "text-muted-foreground border-transparent hover:text-foreground hover:bg-accent hover:shadow-sm"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Auth Section */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <div className="flex items-center space-x-4">
                <div className="px-3 py-1 rounded-lg bg-accent/50 border border-border/50">
                  <span className="text-sm font-medium text-foreground">
                    {user?.username}
                  </span>
                </div>
                <Button
                  onClick={logout}
                  variant="outline"
                  size="sm"
                  className="flex items-center space-x-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </Button>
              </div>
            ) : (
              <Link href="/login">
                <Button variant="default" size="sm" className="flex items-center space-x-2">
                  <LogIn className="h-4 w-4" />
                  <span>Login</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}