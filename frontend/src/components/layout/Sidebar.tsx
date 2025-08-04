"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store/auth";
import { Home, Search, Star, LogIn, LogOut } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const { isAuthenticated, logout } = useAuthStore();

  const navItems = [
    { href: "/search", label: "Search", icon: Search },
    { href: "/collections", label: "My Collections", icon: Star },
    { href: "/deck-builder", label: "Deck Builder", icon: Home },
  ];

  return (
    <aside className="w-64 flex-shrink-0 p-4 border-r bg-background-secondary flex flex-col h-screen sticky top-0">
      <h1 className="text-2xl font-bold mb-8 text-primary">Spellbook</h1>
      <nav className="flex flex-col space-y-2 flex-grow">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} passHref>
            <Button
              variant={pathname === item.href ? "secondary" : "ghost"}
              className="w-full justify-start items-center space-x-2"
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Button>
          </Link>
        ))}
      </nav>
      <div className="mt-auto">
        {isAuthenticated ? (
          <Button onClick={logout} className="w-full justify-start items-center space-x-2">
            <LogOut className="h-5 w-5" />
            <span>Logout</span>
          </Button>
        ) : (
          <Link href="/login" passHref>
            <Button className="w-full justify-start items-center space-x-2">
              <LogIn className="h-5 w-5" />
              <span>Login</span>
            </Button>
          </Link>
        )}
      </div>
    </aside>
  );
}
