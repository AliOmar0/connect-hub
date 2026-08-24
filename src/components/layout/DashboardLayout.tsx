// DashboardLayout — the App_Shell composition shared by every authenticated page.
//
// Composition order (Requirements 4.6, 5.5, 11.1):
//   SkipLink → AppShellHeader → PrimaryNav (variant by breakpoint) → single
//   <main id="main-content" role="main">.
//
// - `SkipLink` is the first focusable element and targets `#main-content`.
// - `PrimaryNav` renders its own `nav` landmark: a persistent sidebar from
//   768px up -- an icon rail at 768-1023px, full width from 1024px -- and a
//   `Sheet`-based menu (revealed via a toggle) below 768px.
// - Exactly one `main` landmark wraps the page content.
// - The header, navigation, and main content keep the same relative positions
//   on every authenticated page, which supports the shell-structure invariance
//   property (Property 26).
import { ReactNode, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { supabase } from "@/integrations/supabase/client";
import { BACKEND_URL, apiFetch } from "@/lib/config";
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
 * way the previous sidebar did: the active-sessions count on the
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

  // Queue and Complaints are the two most time-sensitive destinations in the
  // nav and were the only ones that never carried a count -- so the one place
  // a supervisor needed to see pressure building showed nothing at all. Same
  // 5s cadence as QueuePage itself, so the badge cannot lag the page it links
  // to by more than a tick.
  const { data: queueCount } = useQuery({
    queryKey: ["queue-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .in("status", ["escalated", "waiting"]);
      return count || 0;
    },
    refetchInterval: 5000,
  });

  // Unhandled complaints only ("new"): once someone has picked one up it is no
  // longer waiting on the team. Read from the listing's total-count header
  // rather than a second endpoint, with limit=1 so no rows come back.
  const { data: newComplaintsCount } = useQuery({
    queryKey: ["new-complaints-count"],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await apiFetch(
        `${BACKEND_URL}/api/v1/complaints?status=new&limit=1`,
        {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        },
      );
      if (!res.ok) return 0;
      const total = Number(res.headers.get("X-Total-Count"));
      return Number.isFinite(total) ? total : 0;
    },
    // A badge is not worth an error state; an unreachable backend simply shows
    // no count rather than breaking the shell every page renders inside.
    retry: false,
    meta: { suppressGlobalError: true },
  });

  return useMemo(
    () =>
      PRIMARY_NAV_ITEMS.map((item) => {
        if (item.to === "/sessions") {
          return { ...item, badgeCount: activeSessionsCount || 0 };
        }
        if (item.to === "/queue") {
          return { ...item, badgeCount: queueCount || 0 };
        }
        if (item.to === "/complaints") {
          return { ...item, badgeCount: newComplaintsCount || 0 };
        }
        if (item.to === "/notifications") {
          return { ...item, badgeCount: unreadNotifications || 0 };
        }
        return item;
      }),
    [activeSessionsCount, queueCount, newComplaintsCount, unreadNotifications],
  );
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { t } = useTranslation();
  const breakpoint = useBreakpoint();
  const isDesktop = breakpoint >= 1024;
  // 768-1023px used to get the phone treatment -- the whole nav behind a
  // hamburger -- even though there is room for an icon rail and
  // `useBreakpoint` already modelled the tier. A tablet keeps the sidebar,
  // permanently collapsed to the rail.
  const isTablet = breakpoint === 768;
  const showSidebar = isDesktop || isTablet;
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
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* First focusable element; jumps keyboard focus to the main region. */}
      <SkipLink key="skip-link" targetId="main-content" />

      {/* Persistent sidebar at >= 768px: full width on a laptop, an icon rail
          on a tablet. Below 768px it is a Sheet behind the menu toggle. */}
      {showSidebar && (
        <PrimaryNav
          key="sidebar-nav"
          items={navItems}
          variant="sidebar"
          // The rail is the tablet's only sidebar, so it is not the user's
          // collapse preference to toggle -- there is no room to expand into.
          collapsed={isTablet || sidebarCollapsed}
          onToggleCollapse={isTablet ? undefined : toggleSidebar}
          className={cn(
            // Logical border: under RTL the sidebar renders on the right, and a
            // physical `border-r` drew the rule on the outer screen edge instead
            // of against the content.
            "shrink-0 border-e border-sidebar-border transition-all duration-300 ease-in-out",
            isTablet || sidebarCollapsed ? "w-16" : "w-64",
          )}
        />
      )}

      <div
        key="shell-content"
        className="flex min-w-0 flex-1 flex-col h-full overflow-hidden"
      >
        {/* Header row. Carries nav menu toggle for mobile & desktop collapse toggle */}
        <div className="flex shrink-0 items-center bg-card border-b border-border">
          {!showSidebar ? (
            <PrimaryNav
              key="menu-nav"
              items={navItems}
              variant="menu"
              className="ms-3 shrink-0"
            />
          ) : isDesktop ? (
            // Tablet has no collapse toggle: the rail is already the collapsed
            // state and there is no width to expand into.
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="ms-3 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={t(
                sidebarCollapsed
                  ? "appShell.sidebar.expandSidebar"
                  : "appShell.sidebar.collapseSidebar",
              )}
              title={t(
                sidebarCollapsed
                  ? "appShell.sidebar.expandSidebar"
                  : "appShell.sidebar.collapseSidebar",
              )}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <AppShellHeader />
          </div>
        </div>

        <main
          id="main-content"
          role="main"
          className="flex-1 min-h-0 overflow-y-auto"
        >
          {/* Constrain the measure. Without this, tables and card grids stretch
              edge-to-edge on wide monitors, which is what made dense pages feel
              unanchored above ~1600px. */}
          <div className="mx-auto w-full max-w-[1600px] p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
