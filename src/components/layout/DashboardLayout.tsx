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
import { ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { supabase } from "@/integrations/supabase/client";
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

  // Breakpoint adaptation is pure responsive state (Requirements 7.7, 7.8):
  // crossing a breakpoint only swaps which PrimaryNav variant is rendered — it
  // never changes the route or remounts the page content. To guarantee that,
  // the persistent-content wrapper (and its siblings) carry stable `key`s so
  // React reconciles the `<main>` subtree by key. Even as the sidebar slot
  // appears/disappears, the content subtree keeps the same fiber and its state
  // (entered form data, scroll position, page context) survives. The whole
  // adaptation is a synchronous re-render driven by CSS/responsive state, so it
  // completes well within the 500ms budget with no page reload.
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* First focusable element; jumps keyboard focus to the main region. */}
      <SkipLink key="skip-link" targetId="main-content" />

      {/* Persistent sidebar navigation at >= 1024px. */}
      {isDesktop && (
        <PrimaryNav
          key="sidebar-nav"
          items={navItems}
          variant="sidebar"
          className="w-64 shrink-0 border-r border-sidebar-border"
        />
      )}

      <div key="shell-content" className="flex flex-1 flex-col overflow-hidden">
        {/* Header row. Below 1024px it also carries the nav menu toggle so the
            navigation stays reachable without a persistent sidebar. */}
        <div className="flex items-center bg-card">
          {!isDesktop && (
            <PrimaryNav
              key="menu-nav"
              items={navItems}
              variant="menu"
              className="ms-2 shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <AppShellHeader />
          </div>
        </div>

        <main
          id="main-content"
          role="main"
          className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
