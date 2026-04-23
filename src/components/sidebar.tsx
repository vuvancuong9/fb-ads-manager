"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    LayoutDashboard,
    Upload,
    BarChart3,
    Zap,
    ScrollText,
    Settings,
    Users,
    Monitor,
    ChevronLeft,
    ChevronRight,
    Facebook,
    FileText,
    Activity,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/lib/store"

const adminLinks = [
  { href: "/admin/accounts", label: "Tài khoản FB", icon: Monitor },
  { href: "/admin/users", label: "Người dùng", icon: Users },
  { href: "/admin/assignments", label: "Phân quyền", icon: Settings },
  ]

const mainLinks = [
  { href: "/tong-quan", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/tong-quan", label: "Tổng quan AFF", icon: BarChart3 },
  { href: "/upload", label: "Upload dữ liệu", icon: Upload },
  { href: "/sub-id", label: "Quản lý Sub ID", icon: Activity },
  { href: "/hanh-dong", label: "Hành động loạt", icon: Zap },
  { href: "/bai-viet", label: "Bài viết chưa ads", icon: FileText },
  { href: "/quy-tac", label: "Quy tắc tự động", icon: Zap },
  { href: "/ket-noi", label: "Kết nối Facebook", icon: Facebook },
  { href: "/nhat-ky", label: "Nhật ký", icon: ScrollText },
  { href: "/cai-dat", label: "Cài đặt", icon: Settings },
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
                          </h1>h1>
                      )}
                      <button
                                  onClick={toggleSidebar}
                                  className="p-1 rounded hover:bg-gray-700 transition-colors ml-auto"
                                >
                        {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                      </button>button>
              </div>div>
        
              <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
                {mainLinks.map((link, idx) => {
                          const Icon = link.icon
                                      const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href)
                                                  return (
                                                                <Link
                                                                                key={`${link.href}-${idx}`}
                                                                                href={link.href}
                                                                                className={cn(
                                                                                                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                                                                                                  isActive
                                                                                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                                                                                                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                                                                                                )}
                                                                                title={!sidebarOpen ? link.label : undefined}
                                                                              >
                                                                              <Icon size={18} className="shrink-0" />
                                                                  {sidebarOpen && <span>{link.label}</span>span>}
                                                                </Link>Link>
                                                              )
                })}
              
                {isAdmin && (
                          <>
                            {sidebarOpen && (
                                          <div className="pt-4 pb-2 px-3">
                                                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                                                            Quản trị
                                                          </span>span>
                                          </div>div>
                                      )}
                            {adminLinks.map((link) => {
                                          const Icon = link.icon
                                                          const isActive = pathname.startsWith(link.href)
                                                                          return (
                                                                                            <Link
                                                                                                                key={link.href}
                                                                                                                href={link.href}
                                                                                                                className={cn(
                                                                                                                                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                                                                                                                                      isActive
                                                                                                                                        ? "bg-blue-600 text-white"
                                                                                                                                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                                                                                                                                    )}
                                                                                                                title={!sidebarOpen ? link.label : undefined}
                                                                                                              >
                                                                                                              <Icon size={18} className="shrink-0" />
                                                                                              {sidebarOpen && <span>{link.label}</span>span>}
                                                                                              </Link>Link>
                                                                                          )
                            })}
                          </>>
                        )}
              </nav>nav>
        
          {profile && (
                        <div className={cn("border-t border-gray-700 p-3", sidebarOpen ? "flex items-center gap-3" : "flex justify-center")}>
                                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                                              <span className="text-xs font-bold text-white">
                                                {(profile.full_name || profile.email || "U").charAt(0).toUpperCase()}
                                              </span>span>
                                  </div>div>
                          {sidebarOpen && (
                                      <div className="min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{profile.full_name || profile.email}</p>p>
                                                    <p className="text-xs text-gray-400 capitalize">{profile.role}</p>p>
                                      </div>div>
                                  )}
                        </div>div>
              )}
        </aside>aside>
      )
}
</></aside>
