"use client"

import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { AppProvider } from "@/components/app-provider"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAppStore()

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className={cn("transition-all duration-300", sidebarOpen ? "ml-64" : "ml-16")}>
        <Header />
        <main className="animate-fade-in">{children}</main>
      </div>
    </div>
  )
}

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <DashboardShell>{children}</DashboardShell>
    </AppProvider>
  )
}
