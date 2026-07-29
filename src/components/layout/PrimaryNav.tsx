// PrimaryNav: role-filtered primary navigation for the App_Shell.
//
// Behavior (Requirements 7.2, 7.3, 7.4, 11.2, 11.3):
// - Persistent sidebar at >= 1024px; a Sheet-based collapsible menu < 1024px.
// - Items are filtered by the current user's role via `filterNavByRole`.
// - The nav item matching the active route is marked selected (aria-current
//   plus a distinct visual treatment) using react-router's location.
// - Activating the menu toggle reveals the nav and moves keyboard focus into it.
//
// The item/role configuration mirrors the existing DashboardSidebar so the two
// stay in sync; labels are i18n keys resolved at render time (English fallback).

import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Users,
  Settings,
  Headphones,
  BarChart3,
  Bell,
  Zap,
  Inbox,
  BookOpen,
  FlaskConical,
  Menu,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { filterNavByRole } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import pibLogo from "@/assets/pib-logo.png";
import type { AppRole } from "@/types/database";

/** A single primary-navigation entry. */
export interface NavItem {
  /** Route path this item links to. */
  to: string;
  /** Icon component rendered alongside the label. */
  icon: React.ElementType;
  /** i18n key for the visible label (never a hard-coded string). */
  labelKey: string;
  /** Roles allowed to see this item. */
  roles: AppRole[];
  /** Optional unread/pending count badge. */
  badgeCount?: number;
}

export type PrimaryNavVariant = "sidebar" | "menu";

interface PrimaryNavProps {
  /** Navigation items to render (pre-role-filter). */
  items?: NavItem[];
  /**
   * Force a specific presentation. When omitted, the variant is derived from
   * the active breakpoint: `sidebar` at >= 1024px, `menu` below.
   */
  variant?: PrimaryNavVariant;
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  showUserCard?: boolean;
}

/**
 * The default primary-navigation item set, reusing the DashboardSidebar
 * configuration (routes + role visibility) but expressed with i18n label keys.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const PRIMARY_NAV_ITEMS: NavItem[] = [
  {
    to: "/dashboard",
    icon: LayoutDashboard,
    labelKey: "appShell.nav.dashboard",
    roles: ["admin", "supervisor", "manager", "viewer"],
  },
  {
    to: "/sessions",
    icon: Headphones,
    labelKey: "appShell.nav.sessions",
    roles: ["admin", "supervisor", "manager", "agent", "viewer"],
  },
  {
    to: "/queue",
    icon: Inbox,
    labelKey: "appShell.nav.queue",
    roles: ["admin", "supervisor", "manager", "agent"],
  },
  {
    to: "/employees",
    icon: Users,
    labelKey: "appShell.nav.employees",
    roles: ["admin", "supervisor", "manager"],
  },
  {
    to: "/analytics",
    icon: BarChart3,
    labelKey: "appShell.nav.analytics",
    roles: ["admin", "supervisor", "manager"],
  },
  {
    to: "/notifications",
    icon: Bell,
    labelKey: "appShell.nav.notifications",
    roles: ["admin", "supervisor", "manager", "agent", "viewer"],
  },
  {
    to: "/shortcuts",
    icon: Zap,
    labelKey: "appShell.nav.shortcuts",
    roles: ["admin", "supervisor", "manager", "agent"],
  },
  {
    to: "/knowledge",
    icon: BookOpen,
    labelKey: "appShell.nav.knowledge",
    roles: ["admin", "supervisor", "manager"],
  },
  {
    to: "/backend-test",
    icon: FlaskConical,
    labelKey: "appShell.nav.backendTest",
    roles: ["admin", "supervisor", "manager"],
  },
  {
    to: "/settings",
    icon: Settings,
    labelKey: "appShell.nav.settings",
    roles: ["admin", "supervisor", "manager"],
  },
];

/** True when `pathname` is the item's route or a nested route beneath it. */
function isItemActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

interface NavItemsProps {
  items: NavItem[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}

/**
 * The list of nav links shared by both the sidebar and the menu variants.
 * Marks exactly the active route's item with `aria-current="page"` and a
 * distinct selected treatment.
 */
const NavItems = React.forwardRef<HTMLDivElement, NavItemsProps>(
  ({ items, pathname, collapsed = false, onNavigate }, ref) => {
    const { t } = useTranslation();

    return (
      <div ref={ref} className="space-y-1.5">
        {items.map(({ to, icon: Icon, labelKey, badgeCount }) => {
          const active = isItemActive(pathname, to);
          const label = t(labelKey);

          const linkContent = (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? label : undefined}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-xl py-2.5 min-h-[44px] relative transition-all duration-200 font-medium text-sm",
                collapsed ? "justify-center px-2" : "px-3.5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-lg shadow-sidebar-primary/20"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground hover:translate-x-0.5",
              )}
            >
              {/* Active indicator bar */}
              {active && !collapsed && (
                <span className="absolute start-0 top-2 bottom-2 w-1 bg-sidebar-primary-foreground rounded-r-full shadow-sm" />
              )}

              <Icon
                className={cn(
                  "h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110",
                  active
                    ? "text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/75 group-hover:text-sidebar-foreground",
                )}
                aria-hidden="true"
              />
              {!collapsed && <span className="flex-1 truncate">{label}</span>}
              {badgeCount !== undefined && badgeCount > 0 && (
                <span
                  className={cn(
                    "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold shadow-sm transition-all",
                    collapsed
                      ? "absolute -top-1 -right-1 ring-2 ring-sidebar"
                      : "",
                    active
                      ? "bg-sidebar-background text-sidebar-primary"
                      : "bg-gold text-navy-dark",
                  )}
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={to} delayDuration={100}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  {label}
                  {badgeCount !== undefined && badgeCount > 0 && (
                    <span className="ml-2 bg-gold text-navy-dark px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                      {badgeCount}
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          }

          return linkContent;
        })}
      </div>
    );
  },
);
NavItems.displayName = "NavItems";

export default function PrimaryNav({
  items = PRIMARY_NAV_ITEMS,
  variant,
  className,
  collapsed = false,
  onToggleCollapse,
  showUserCard = false,
}: PrimaryNavProps) {
  const { t } = useTranslation();
  const { user, userRole, signOut } = useAuth();
  const location = useLocation();
  const breakpoint = useBreakpoint();

  const [open, setOpen] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Derive the presentation from the breakpoint unless explicitly forced.
  const resolvedVariant: PrimaryNavVariant =
    variant ?? (breakpoint >= 1024 ? "sidebar" : "menu");

  const visibleItems = filterNavByRole(items, userRole);

  // When the menu opens, move keyboard focus into the nav so keyboard users
  // land on the navigation rather than staying on the toggle (Req. 7.4).
  const focusFirstItem = React.useCallback(() => {
    const first = listRef.current?.querySelector<HTMLElement>("a[href]");
    first?.focus();
  }, []);

  if (resolvedVariant === "sidebar") {
    return (
      <nav
        aria-label={t("appShell.nav.primaryLabel")}
        className={cn(
          "flex h-full flex-col justify-between overflow-y-auto bg-sidebar py-4 transition-all duration-300 ease-in-out shadow-xl",
          collapsed ? "px-2" : "px-3.5",
          className,
        )}
      >
        <div className="space-y-2">
          <NavItems
            items={visibleItems}
            pathname={location.pathname}
            collapsed={collapsed}
          />
        </div>

        {/* Bottom User Profile & Action Bar */}
        {(showUserCard || onToggleCollapse) && (
          <div className="pt-3 border-t border-sidebar-border/60 mt-auto space-y-2">
            {showUserCard && user && (
              <div
                className={cn(
                  "flex items-center gap-2.5 p-2 rounded-xl bg-sidebar-accent/40 border border-sidebar-border/40 transition-all",
                  collapsed ? "justify-center" : "",
                )}
              >
                <Avatar className="h-8 w-8 shrink-0 ring-2 ring-sidebar-primary/30">
                  <AvatarImage src="" alt="" />
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground font-bold text-xs">
                    {user.email?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-semibold text-sidebar-foreground truncate">
                      {user.email?.split("@")[0] || "User"}
                    </span>
                    <span className="text-[10px] text-sidebar-foreground/60 capitalize truncate">
                      {userRole || "Agent"}
                    </span>
                  </div>
                )}
                {!collapsed && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => signOut()}
                    className="h-7 w-7 shrink-0 text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-lg"
                    title={t("appShell.sidebar.signOut", {
                      defaultValue: "Sign Out",
                    })}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}

            {/* Collapse/Expand Toggle */}
            {onToggleCollapse && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onToggleCollapse}
                className={cn(
                  "w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 rounded-xl flex items-center gap-2 transition-all",
                  collapsed
                    ? "justify-center px-0 h-9"
                    : "justify-start px-3 h-9",
                )}
                aria-label={
                  collapsed
                    ? t("appShell.sidebar.expandSidebar", {
                        defaultValue: "Expand Sidebar",
                      })
                    : t("appShell.sidebar.collapseSidebar", {
                        defaultValue: "Collapse Sidebar",
                      })
                }
                title={
                  collapsed
                    ? t("appShell.sidebar.expandSidebar", {
                        defaultValue: "Expand Sidebar",
                      })
                    : t("appShell.sidebar.collapseSidebar", {
                        defaultValue: "Collapse Sidebar",
                      })
                }
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                ) : (
                  <>
                    <ChevronLeft className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-medium truncate">
                      {t("appShell.sidebar.collapseSidebar", {
                        defaultValue: "Collapse Sidebar",
                      })}
                    </span>
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </nav>
    );
  }

  // Menu variant: a toggle that reveals the nav inside a Sheet.
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={
          open ? t("appShell.nav.closeMenu") : t("appShell.nav.openMenu")
        }
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(true)}
        className={className}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>
      <SheetContent
        side="left"
        className="w-64 bg-sidebar p-0"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusFirstItem();
        }}
      >
        <SheetTitle className="sr-only">
          {t("appShell.nav.primaryLabel")}
        </SheetTitle>
        <nav
          aria-label={t("appShell.nav.primaryLabel")}
          className="flex h-full flex-col overflow-y-auto px-3 py-4"
        >
          <NavItems
            ref={listRef}
            items={visibleItems}
            pathname={location.pathname}
            onNavigate={() => setOpen(false)}
          />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
