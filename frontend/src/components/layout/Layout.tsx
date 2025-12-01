import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import {
  Search,
  Library,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Shield,
  Camera,
  X,
} from "lucide-react"
import { SpellbookIcon } from "@/components/ui/SpellbookIcon"
import { useState } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Search Cards", href: "/search", icon: Search },
  { name: "My Collection", href: "/collection", icon: Library },
  { name: "Decks", href: "/decks", icon: Layers },
  { name: "Scan Cards", href: "/scans", icon: Camera },
  { name: "Settings", href: "/settings", icon: Settings },
]

const adminNavigation = [
  { name: "Admin", href: "/admin", icon: Shield },
]

export function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const allNavigation = user?.is_admin 
    ? [...navigation, ...adminNavigation] 
    : navigation

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
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
          "fixed inset-y-0 left-0 z-50 w-[280px] transform bg-sidebar/95 backdrop-blur-xl border-r border-primary/10 transition-transform duration-300 ease-in-out lg:translate-x-0 shadow-2xl",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-24 items-center px-8 border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent">
          <Link to="/dashboard" className="flex items-center gap-3 group">
            <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <SpellbookIcon className="h-6 w-6 text-primary" />
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
          {allNavigation.map((item) => {
            const isActive =
              location.pathname === item.href ||
              location.pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                  isActive
                    ? "bg-primary/10 text-primary shadow-[0_0_20px_rgba(139,92,246,0.1)]"
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary rounded-r-full shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
                )}
                <item.icon
                  className={cn(
                    "h-5 w-5 transition-colors",
                    isActive ? "text-primary" : "group-hover:text-white"
                  )}
                />
                <span>{item.name}</span>
              </Link>
            )
          })}
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
                {user?.is_admin ? "Admin" : "User"}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-red-400 hover:bg-red-500/10 h-9 text-xs font-medium transition-colors"
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
          <span className="font-bold text-lg">Spellbook</span>
        </header>

        {/* Main Content */}
        <main className="flex-1 min-h-screen transition-all duration-300">
          <div className="container mx-auto p-6 md:p-8 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
