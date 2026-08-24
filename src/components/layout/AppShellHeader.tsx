// AppShellHeader — persistent header for the App_Shell.
//
// Hosts the PIB logo (>=24px, with a bank-name text fallback on load error that
// preserves the header layout), a navigational page-context indicator naming the
// current Page, search, and the language / theme / notifications / account
// controls. When the current user is not authenticated, all auth-requiring
// controls (search, notifications, theme, account) are omitted; only the logo,
// page-context indicator, and pre-auth language switcher remain.
//
// Requirements: 2.2, 2.3, 11.4, 11.5, 11.6
import { useEffect, useState } from "react";
import { Bell, LogOut, Search, UserRound } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  CommandPalette,
  useCommandPaletteHotkey,
} from "@/components/layout/CommandPalette";
import ThemeToggle from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Notification } from "@/types/database";
import { notifyError } from "@/lib/feedback";
import pibLogo from "@/assets/pib-logo.png";

/**
 * Map the active route to a page-context i18n key. Order matters: the most
 * specific prefixes are checked first so nested routes (e.g. /sessions/:id)
 * resolve to their parent page name. Falls back to the NotFound label.
 */
function resolvePageKey(pathname: string): string {
  const routes: Array<[RegExp, string]> = [
    [/^\/dashboard/, "dashboard"],
    [/^\/sessions/, "sessions"],
    [/^\/queue/, "queue"],
    [/^\/complaints/, "complaints"],
    [/^\/knowledge/, "knowledge"],
    [/^\/employees/, "employees"],
    [/^\/analytics/, "analytics"],
    [/^\/settings/, "settings"],
    [/^\/notifications/, "notifications"],
    [/^\/shortcuts/, "shortcuts"],
    [/^\/$/, "home"],
  ];
  const match = routes.find(([re]) => re.test(pathname));
  return match ? match[1] : "notFound";
}

export default function AppShellHeader() {
  const { user, userRole, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const isAuthenticated = !!user;
  const [logoError, setLogoError] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteHotkey(setPaletteOpen);

  // Mac reports "MacIntel"/"Mac" here; everything else gets the Ctrl label.
  const paletteChordLabel =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform || "")
      ? "⌘K"
      : "Ctrl K";

  const pageKey = resolvePageKey(location.pathname);
  const pageName = t(`appShell.header.pages.${pageKey}`);

  // Recent unread notifications (auth-only).
  const { data: notifications } = useQuery({
    queryKey: ["header-notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return { count: 0, items: [] as Notification[] };
      const { data, count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact" })
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(5);
      // Surfacing the error keeps react-query in an error state instead of
      // caching a bogus "0 unread" badge over a failed fetch.
      if (error) throw error;
      return { count: count || 0, items: (data || []) as Notification[] };
    },
    enabled: isAuthenticated,
  });

  // User profile for the account avatar (auth-only).
  const { data: profile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      return data;
    },
    enabled: isAuthenticated,
  });

  // Real-time notification updates (auth-only).
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("app-shell-header-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["header-notifications"] });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({
            queryKey: ["notifications-unread-count"],
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const handleNotificationClick = async (notif: Notification) => {
    // Selecting the id back is what makes an RLS-filtered no-op detectable:
    // without it PostgREST answers 2xx with zero rows affected and the badge
    // silently never clears.
    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notif.id)
      .select("id");

    if (error || !data || data.length === 0) {
      notifyError(t("notifications.markReadFailed"));
    }

    queryClient.invalidateQueries({ queryKey: ["header-notifications"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    navigate(notif.action_url || "/notifications");
  };

  const accountName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
    : "";
  const accountInitials =
    `${profile?.first_name?.[0] || ""}${profile?.last_name?.[0] || ""}`.toUpperCase();

  return (
    // The bottom border lives on the header ROW in DashboardLayout, which spans
    // the sidebar toggle too; repeating it here drew a double rule at two
    // different opacities. `sticky`/`z-30`/`backdrop-blur` were also inert --
    // this header's parent does not scroll, `<main>` is the scroll container --
    // so they cost paint and bought nothing.
    <header className="h-16 bg-card px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Brand + page context */}
      <div className="flex items-center gap-4 min-w-0">
        {/* PIB logo with bank-name text fallback that preserves layout */}
        <div className="flex items-center shrink-0">
          {logoError ? (
            <span
              className="font-display font-bold text-sm text-foreground leading-tight max-w-[160px]"
              data-testid="logo-fallback"
            >
              {t("appShell.header.bankName")}
            </span>
          ) : (
            <img
              src={pibLogo}
              alt={t("appShell.header.logoAlt")}
              className="h-8 w-auto object-contain transition-opacity hover:opacity-90"
              onError={() => setLogoError(true)}
            />
          )}
        </div>

        {/* Page-context indicator naming the current page */}
        <div
          className="hidden sm:flex items-center gap-2 border-s border-border/70 ps-4 py-1 min-w-0"
          aria-label={t("appShell.header.pageContextLabel")}
        >
          <div className="flex flex-col min-w-0">
            <span className="text-overline font-bold uppercase tracking-wider text-muted-foreground/80">
              {t("appShell.header.pageContextLabel")}
            </span>
            <span
              className="text-sm font-bold text-foreground truncate"
              aria-current="page"
              data-testid="page-context"
            >
              {pageName}
            </span>
          </div>
        </div>
      </div>

      {/* Command palette trigger (auth-only: operates on protected data).
          This was an `Input type="search"` with no value, onChange or onSubmit
          -- an affordance that promised search and did nothing. It is now a
          button that opens a real palette. */}
      {isAuthenticated && (
        <div className="flex-1 max-w-md hidden md:block">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="group flex h-9 w-full items-center gap-2.5 rounded-xl border border-border/60 bg-secondary/40 ps-3 pe-2 text-start transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Search
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            />
            <span className="flex-1 truncate text-body-sm text-muted-foreground">
              {t("appShell.header.commandHint")}
            </span>
            <kbd className="hidden items-center gap-0.5 rounded-md border border-border/70 bg-background px-1.5 font-sans text-overline text-muted-foreground lg:inline-flex">
              {paletteChordLabel}
            </kbd>
          </button>
        </div>
      )}

      {isAuthenticated && (
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      )}

      {/* Right-side controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Language switcher — available before and after authentication */}
        <LanguageSwitcher />

        {isAuthenticated && (
          <>
            {/* Theme toggle */}
            <ThemeToggle />

            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative h-9 w-9 rounded-xl border-border/60 hover:bg-accent/50 transition-all"
                  aria-label={t("appShell.header.notifications")}
                >
                  <Bell className="h-4 w-4 text-foreground/80" />
                  {notifications && notifications.count > 0 && (
                    <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-caption font-bold rounded-full flex items-center justify-center ring-2 ring-background animate-pulse">
                      {notifications.count > 99 ? "99+" : notifications.count}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-80 rounded-xl shadow-xl border-border/80"
              >
                <DropdownMenuLabel className="flex items-center justify-between font-display font-semibold">
                  {t("appShell.header.notifications")}
                  {notifications && notifications.count > 0 && (
                    <Badge variant="secondary" className="rounded-lg">
                      {t("appShell.header.notificationsNew", {
                        count: notifications.count,
                      })}
                    </Badge>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-80 overflow-y-auto">
                  {notifications && notifications.items.length > 0 ? (
                    notifications.items.map((notif) => (
                      <DropdownMenuItem
                        key={notif.id}
                        className="flex flex-col items-start gap-1 py-3 px-3 cursor-pointer rounded-lg hover:bg-accent/60"
                        onClick={() => handleNotificationClick(notif)}
                      >
                        <span className="font-semibold text-xs sm:text-sm text-foreground">
                          {notif.title}
                        </span>
                        {notif.message && (
                          <span className="text-xs text-muted-foreground line-clamp-2">
                            {notif.message}
                          </span>
                        )}
                        <span className="text-caption text-muted-foreground/80 font-medium mt-0.5">
                          {formatDistanceToNow(new Date(notif.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem
                      disabled
                      className="text-center justify-center text-xs text-muted-foreground py-6"
                    >
                      {t("appShell.header.noNotifications")}
                    </DropdownMenuItem>
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-center justify-center text-xs text-primary font-semibold py-2.5 cursor-pointer hover:bg-primary/10"
                  onClick={() => navigate("/notifications")}
                >
                  {t("appShell.header.viewAllNotifications")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Account menu. Previously this avatar navigated straight to
                settings, which left Sign Out reachable only from the sidebar
                footer -- where it is hidden while the sidebar is collapsed and
                absent entirely below 1024px, since the mobile Sheet renders nav
                items only. Putting it here makes it reachable at every
                breakpoint and in both nav states. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-9 w-9 p-0 hover:ring-2 hover:ring-primary/40 transition-all"
                  aria-label={
                    accountName
                      ? `${t("appShell.header.account")}: ${accountName}`
                      : t("appShell.header.account")
                  }
                >
                  <Avatar className="h-9 w-9 border border-border/80">
                    <AvatarImage src={profile?.avatar_url || ""} alt="" />
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                      {accountInitials || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-body-sm font-semibold text-foreground">
                    {accountName || t("appShell.sidebar.userFallback")}
                  </span>
                  {userRole ? (
                    <span className="text-caption font-normal text-muted-foreground">
                      {t(`appShell.roles.${userRole}`)}
                    </span>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer min-h-[44px]"
                  onClick={() => navigate("/settings?tab=general")}
                >
                  <UserRound aria-hidden="true" className="me-2 h-4 w-4" />
                  {t("appShell.header.pages.settings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer min-h-[44px] text-destructive focus:text-destructive"
                  onClick={() => {
                    void signOut();
                  }}
                >
                  <LogOut aria-hidden="true" className="me-2 h-4 w-4" />
                  {t("appShell.sidebar.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </header>
  );
}
