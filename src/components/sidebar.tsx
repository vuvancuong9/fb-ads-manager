"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  BarChart3,
  Rocket,
  Settings,
  Bell,
  Users,
  Monitor,
  Zap,
  ChevronLeft,
  ChevronRight,
  Target,
  Eye,
  FileText,
  ArrowRightLeft,
  Bot,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/lib/store"

const adminLinks = [
  { href: "/dashboard/admin/accounts", label: "Account FB", icon: Monitor },
  { href: "/dashboard/admin/users", label: "Utenti", icon: Users },
  { href: "/dashboard/admin/assignments", label: "Assegnazioni", icon: Settings },
]

const mainLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/campaigns", label: "Campagne", icon: Target },
  { href: "/dashboard/analysis", label: "Analisi", icon: BarChart3 },
  { href: "/dashboard/launch", label: "Lancia", icon: Rocket },
  { href: "/dashboard/rules", label: "Regole", icon: Zap },
  { href: "/dashboard/alerts", label: "Alert", icon: Bell },
  { href: "/dashboard/pixels", label: "Pixel", icon: Eye },
  { href: "/dashboard/pages", label: "Pagine", icon: FileText },
  { href: "/dashboard/traffic-manager", label: "Traffic Manager", icon: ArrowRightLeft },
  { href: "/dashboard/agent", label: "AI Assistant", icon: Bot },
  { href: "/dashboard/settings", label: "Impostazioni", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { profile, sidebarOpen, toggleSidebar } = useAppStore()
  const isAdmin = profile?.role === "admin"

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-gray-900 text-white transition-all duration-300 flex flex-col",
        sidebarOpen ? "w-64" : "w-16"
      )}
    >
      <div className="flex h-16 items-center justify-between px-4 border-b border-gray-700">
        {sidebarOpen && (
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            FB Ads Manager
          </h1>
        )}
        <button onClick={toggleSidebar} className="p-1 rounded hover:bg-gray-700 cursor-pointer">
          {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <div className="space-y-1">
          {mainLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href))
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                )}
              >
                <link.icon size={20} className="shrink-0" />
                {sidebarOpen && <span>{link.label}</span>}
              </Link>
            )
          })}
        </div>

        {isAdmin && (
          <>
            <div className="mt-6 mb-2 px-3">
              {sidebarOpen && (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Admin
                </p>
              )}
            </div>
            <div className="space-y-1">
              {adminLinks.map((link) => {
                const isActive = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-purple-600 text-white"
                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    )}
                  >
                    <link.icon size={20} className="shrink-0" />
                    {sidebarOpen && <span>{link.label}</span>}
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </nav>

      {sidebarOpen && profile && (
        <div className="border-t border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-semibold">
              {profile.full_name?.[0]?.toUpperCase() || profile.email[0].toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{profile.full_name || profile.email}</p>
              <p className="text-xs text-gray-400 capitalize">{profile.role}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
