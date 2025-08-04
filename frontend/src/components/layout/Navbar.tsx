"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store/auth";
import { Search, Layers3, User, LogIn, LogOut } from "lucide-react";
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

  return (
    <nav className="border-b border-border bg-background">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="text-2xl font-bold text-primary">
            Spellbook
          </Link>

          {/* Navigation Tabs */}
          <div className="flex space-x-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href === "/collections" && pathname.startsWith("/collections"));
              
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 flex items-center space-x-2",
                      isActive
                        ? "text-primary border-primary"
                        : "text-muted-foreground border-transparent hover:text-foreground"
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
                <span className="text-sm text-muted-foreground">
                  {user?.username}
                </span>
                <Button
                  onClick={logout}
                  variant="ghost"
                  size="sm"
                  className="flex items-center space-x-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </Button>
              </div>
            ) : (
              <Link href="/login">
                <Button variant="ghost" size="sm" className="flex items-center space-x-2">
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