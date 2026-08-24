// PrimaryNav: role-filtered primary navigation for the App_Shell.
//
// Behavior (Requirements 7.2, 7.3, 7.4, 11.2, 11.3):
// - Persistent sidebar at >= 768px (an icon rail until 1024px); a Sheet-based
//   collapsible menu below 768px.
// - Items are filtered by the current user's role via `filterNavByRole`.
// - The nav item matching the active route is marked selected (aria-current
//   plus a distinct visual treatment) using react-router's location.
// - Activating the menu toggle reveals the nav and moves keyboard focus into it.
//
// Labels are i18n keys resolved at render time (English fallback). Item roles
// MUST mirror the matching route guards in App.tsx -- see PRIMARY_NAV_ITEMS.

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
  MessageSquareWarning,
  BookOpen,
  FlaskConical,
  Menu,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { filterNavByRole } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AppRole } from "@/types/database";

/**
 * Sidebar sections. Operational work, insight and administration are different
 * jobs done by different people at different times; a flat ten-item list gave
 * no signal about which was which.
 */
export type NavGroupId = "operations" | "insight" | "manage" | "system";

/** Section render order, with the i18n key for each heading. */
// eslint-disable-next-line react-refresh/only-export-components
export const NAV_GROUPS: ReadonlyArray<{
  id: NavGroupId;
  labelKey: string | null;
}> = [
  { id: "operations", labelKey: "appShell.nav.groups.operations" },
  { id: "insight", labelKey: "appShell.nav.groups.insight" },
  { id: "manage", labelKey: "appShell.nav.groups.manage" },
  // Settings sits on its own below a divider -- a heading for one item is noise.
  { id: "system", labelKey: null },
];

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
  /**
   * Which section of the sidebar this item belongs to. `system` is rendered
   * last, after a divider and without a heading.
   */
  group: NavGroupId;
  /** Optional unread/pending count badge. */
  badgeCount?: number;
  /**
   * How the count reads. `accent` is the default gold pill -- work waiting.
   * `urgent` is the red pill reserved for complaints, which are a different
   * kind of pressure from a busy queue and should not look like one.
   */
  badgeTone?: "accent" | "urgent";
}

export type PrimaryNavVariant = "sidebar" | "menu";

interface PrimaryNavProps {
  /** Navigation items to render (pre-role-filter). */
  items?: NavItem[];
  /**
   * Force a specific presentation. When omitted, the variant is derived from
   * the active breakpoint: `sidebar` at >= 768px, `menu` below.
   */
  variant?: PrimaryNavVariant;
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/**
 * The default primary-navigation item set: routes plus role visibility,
 * expressed with i18n label keys.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const PRIMARY_NAV_ITEMS: NavItem[] = [
  {
    to: "/sessions",
    icon: Headphones,
    labelKey: "appShell.nav.sessions",
    roles: ["admin", "supervisor", "manager", "agent", "viewer"],
    group: "operations",
  },
  {
    to: "/queue",
    icon: Inbox,
    labelKey: "appShell.nav.queue",
    roles: ["admin", "supervisor", "manager", "agent"],
    group: "operations",
  },
  {
    to: "/complaints",
    icon: MessageSquareWarning,
    labelKey: "appShell.nav.complaints",
    badgeTone: "urgent",
    roles: ["admin", "supervisor", "manager"],
    group: "operations",
  },
  {
    to: "/notifications",
    icon: Bell,
    labelKey: "appShell.nav.notifications",
    roles: ["admin", "supervisor", "manager", "agent", "viewer"],
    group: "operations",
  },
  {
    to: "/dashboard",
    icon: LayoutDashboard,
    labelKey: "appShell.nav.dashboard",
    // Roles MUST mirror the matching route guard in App.tsx. Where the two
    // disagreed, a page stayed reachable by URL but had no link -- agents could
    // open /dashboard, /employees and /analytics and viewers /employees and
    // /analytics, while never seeing them in the nav.
    roles: ["admin", "supervisor", "manager", "agent", "viewer"],
    group: "insight",
  },
  {
    to: "/analytics",
    icon: BarChart3,
    labelKey: "appShell.nav.analytics",
    roles: ["admin", "supervisor", "manager", "agent", "viewer"],
    group: "insight",
  },
  {
    to: "/employees",
    icon: Users,
    labelKey: "appShell.nav.employees",
    roles: ["admin", "supervisor", "manager", "agent", "viewer"],
    group: "manage",
  },
  {
    to: "/knowledge",
    icon: BookOpen,
    labelKey: "appShell.nav.knowledge",
    roles: ["admin", "supervisor", "manager"],
    group: "manage",
  },
  {
    to: "/shortcuts",
    icon: Zap,
    labelKey: "appShell.nav.shortcuts",
    // Deliberately excludes `viewer`: shortcuts are personal quick replies for
    // people who actually send messages. Pinned by Property 4 of the
    // chat-shortcuts-page spec, so the /shortcuts ROUTE was tightened to match
    // rather than widening this list.
    roles: ["admin", "supervisor", "manager", "agent"],
    group: "manage",
  },
  {
    to: "/settings",
    icon: Settings,
    labelKey: "appShell.nav.settings",
    roles: ["admin", "supervisor", "manager", "agent", "viewer"],
    group: "system",
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

    // Render section by section. A group with no visible items after role
    // filtering is omitted entirely -- an empty heading is worse than no
    // heading.
    const renderItem = ({
      to,
      icon: Icon,
      labelKey,
      badgeCount,
      badgeTone = "accent",
    }: NavItem) => {
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
            // A tinted row with a gold rail, rather than a solid gold
            // block: it keeps gold as an accent instead of letting the
            // selected item shout louder than the content it points at.
            active
              ? "bg-sidebar-accent text-sidebar-foreground font-semibold"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          )}
        >
          {/* Active indicator bar */}
          {active && !collapsed && (
            <span className="absolute start-0 top-2 bottom-2 w-[3px] rounded-e-full bg-sidebar-primary" />
          )}

          <Icon
            className={cn(
              "h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110",
              active
                ? "text-sidebar-primary"
                : "text-sidebar-foreground/75 group-hover:text-sidebar-foreground",
            )}
            aria-hidden="true"
          />
          {!collapsed && <span className="flex-1 truncate">{label}</span>}
          {badgeCount !== undefined && badgeCount > 0 && (
            <span
              className={cn(
                "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-overline font-bold shadow-sm transition-all",
                collapsed ? "absolute -top-1 -end-1 ring-2 ring-sidebar" : "",
                // `bg-sidebar-background` was not a real class: the Tailwind
                // theme defines `sidebar.DEFAULT`, so an active item's badge
                // rendered with no background at all -- gold text on gold.
                badgeTone === "urgent"
                  ? "bg-destructive text-destructive-foreground"
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
                <span className="ml-2 bg-gold text-navy-dark px-1.5 py-0.5 rounded-full text-caption font-bold">
                  {badgeCount}
                </span>
              )}
            </TooltipContent>
          </Tooltip>
        );
      }

      return linkContent;
    };

    return (
      <div ref={ref} className="space-y-5">
        {NAV_GROUPS.map((group) => {
          const groupItems = items.filter((item) => item.group === group.id);
          if (groupItems.length === 0) return null;

          return (
            <div
              key={group.id}
              className={cn(
                "space-y-1",
                // The system section is separated by a rule instead of a
                // heading, and only when something precedes it.
                group.id === "system" &&
                  "border-t border-sidebar-border/60 pt-4",
              )}
            >
              {group.labelKey && !collapsed ? (
                <div className="px-3.5 pb-1 text-overline uppercase text-sidebar-foreground/45">
                  {t(group.labelKey)}
                </div>
              ) : null}
              <div className="space-y-1">{groupItems.map(renderItem)}</div>
            </div>
          );
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
}: PrimaryNavProps) {
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const location = useLocation();
  const breakpoint = useBreakpoint();

  const [open, setOpen] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Derive the presentation from the breakpoint unless explicitly forced.
  const resolvedVariant: PrimaryNavVariant =
    variant ?? (breakpoint >= 768 ? "sidebar" : "menu");

  const visibleItems = filterNavByRole(items, userRole);

  // When the menu opens, move keyboard focus into the nav so keyboard users
  // land on the navigation rather than staying on the toggle (Req. 7.4).
  const focusFirstItem = React.useCallback(() => {
    const first = listRef.current?.querySelector<HTMLElement>("a[href]");
    first?.focus();
  }, []);

  if (resolvedVariant === "sidebar") {
    // Settings is pinned to the foot of the sidebar rather than trailing the
    // last group: it is the one destination that is not part of the day's
    // work, and it belongs where the eye goes last, not after "Chat Shortcuts".
    const systemItems = visibleItems.filter((item) => item.group === "system");
    const workItems = visibleItems.filter((item) => item.group !== "system");

    return (
      <nav
        aria-label={t("appShell.nav.primaryLabel")}
        className={cn(
          "flex h-full flex-col bg-sidebar transition-all duration-300 ease-in-out shadow-xl",
          className,
        )}
      >
        {/* Brand header. The sidebar carried no wordmark at all, so at a glance
            nothing on screen said which product this was. */}
        <div
          className={cn(
            "flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border/60",
            collapsed ? "justify-center px-2" : "px-4",
          )}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary"
            aria-hidden="true"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="hsl(var(--navy-dark))"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 21h18" />
              <path d="M5 21V10l7-5 7 5v11" />
              <path d="M10 21v-5h4v5" />
            </svg>
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col gap-px">
              <span className="font-display text-body-sm font-bold tracking-tight text-sidebar-foreground">
                {t("appShell.sidebar.brandName")}
              </span>
              <span className="text-overline uppercase text-sidebar-primary">
                {t("appShell.sidebar.brandEyebrow")}
              </span>
            </span>
          )}
        </div>

        <div
          className={cn(
            "flex-1 overflow-y-auto py-4",
            collapsed ? "px-2" : "px-3",
          )}
        >
          <NavItems
            items={workItems}
            pathname={location.pathname}
            collapsed={collapsed}
          />
        </div>

        {systemItems.length > 0 && (
          <div
            className={cn(
              "shrink-0 border-t border-sidebar-border/60 py-3",
              collapsed ? "px-2" : "px-3",
            )}
          >
            <NavItems
              items={systemItems}
              pathname={location.pathname}
              collapsed={collapsed}
            />
          </div>
        )}

        {/* No user card and no sign-out here. Both were duplicated in the
            header account menu, and the sidebar copy vanished when the sidebar
            collapsed -- and did not exist at all on a phone, which left no way
            to sign out. The header carries them on every breakpoint. */}
        {onToggleCollapse && (
          <div
            className={cn(
              "shrink-0 border-t border-sidebar-border/60 py-3",
              collapsed ? "px-2" : "px-3",
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent/80 hover:text-sidebar-foreground",
                collapsed ? "justify-center px-2" : "justify-start px-3.5",
              )}
              aria-label={t(
                collapsed
                  ? "appShell.sidebar.expandSidebar"
                  : "appShell.sidebar.collapseSidebar",
              )}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
                  <span className="truncate text-body-sm font-medium">
                    {t("appShell.sidebar.collapseSidebar")}
                  </span>
                </>
              )}
            </Button>
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
