// DashboardLayout — the App_Shell composition shared by every authenticated page.
//
// Composition order (Requirements 4.6, 5.5, 11.1):
//   SkipLink → AppShellHeader → PrimaryNav (variant by breakpoint) → single
//   <main id="main-content" role="main">.
//
// - `SkipLink` is the first focusable element and targets `#main-content`.
// - `PrimaryNav` renders its own `nav` landmark: a persistent sidebar at
//   >= 1024px and a `Sheet`-based menu (revealed via a toggle) below 1024px.
// - Exactly one `main` landmark wraps the page content.
// - The header, navigation, and main content keep the same relative positions
//   on every authenticated page, which supports the shell-structure invariance
//   property (Property 26).
import { ReactNode, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import SkipLink from "./SkipLink";
import AppShellHeader from "./AppShellHeader";
import PrimaryNav, { PRIMARY_NAV_ITEMS, type NavItem } from "./PrimaryNav";

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Resolve the primary-navigation items with live badge counts wired in the same
 * way the previous DashboardSidebar did: the active-sessions count on the
 * Sessions item and the unread-notifications count on the Notifications item.
 */
function usePrimaryNavItems(): NavItem[] {
  const { user } = useAuth();

  const { data: unreadNotifications } = useQuery({
    queryKey: ["unread-notifications-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      return count || 0;
    },
    enabled: !!user?.id,
  });

  const { data: activeSessionsCount } = useQuery({
    queryKey: ["active-sessions-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");
      return count || 0;
    },
  });

  return useMemo(
    () =>
      PRIMARY_NAV_ITEMS.map((item) => {
        if (item.to === "/sessions") {
          return { ...item, badgeCount: activeSessionsCount || 0 };
        }
        if (item.to === "/notifications") {
          return { ...item, badgeCount: unreadNotifications || 0 };
        }
        return item;
      }),
    [activeSessionsCount, unreadNotifications],
  );
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const breakpoint = useBreakpoint();
  const isDesktop = breakpoint >= 1024;
  const navItems = usePrimaryNavItems();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* First focusable element; jumps keyboard focus to the main region. */}
      <SkipLink key="skip-link" targetId="main-content" />

      {/* Persistent sidebar navigation at >= 1024px. */}
      {isDesktop && (
        <PrimaryNav
          key="sidebar-nav"
          items={navItems}
          variant="sidebar"
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          showUserCard={true}
          className={cn(
            "shrink-0 border-r border-sidebar-border transition-all duration-300 ease-in-out",
            sidebarCollapsed ? "w-16" : "w-64",
          )}
        />
      )}

      <div key="shell-content" className="flex flex-1 flex-col overflow-hidden">
        {/* Header row. Carries nav menu toggle for mobile & desktop collapse toggle */}
        <div className="flex items-center bg-card border-b border-border">
          {!isDesktop ? (
            <PrimaryNav
              key="menu-nav"
              items={navItems}
              variant="menu"
              className="ms-3 shrink-0"
            />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="ms-3 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <AppShellHeader />
          </div>
        </div>

        <main
          id="main-content"
          role="main"
          className="flex-1 overflow-y-auto p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
