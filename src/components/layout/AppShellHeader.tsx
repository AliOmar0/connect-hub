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
import { Bell, Search } from "lucide-react";
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
import ThemeToggle from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Notification } from "@/types/database";
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const isAuthenticated = !!user;
  const [logoError, setLogoError] = useState(false);

  const pageKey = resolvePageKey(location.pathname);
  const pageName = t(`appShell.header.pages.${pageKey}`);

  // Recent unread notifications (auth-only).
  const { data: notifications } = useQuery({
    queryKey: ["header-notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return { count: 0, items: [] as Notification[] };
      const { data, count } = await supabase
        .from("notifications")
        .select("*", { count: "exact" })
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(5);
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
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const handleNotificationClick = async (notif: Notification) => {
    try {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notif.id);
    } catch {
      // ignore
    } finally {
      queryClient.invalidateQueries({ queryKey: ["header-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      navigate(notif.action_url || "/notifications");
    }
  };

  const accountName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
    : "";
  const accountInitials =
    `${profile?.first_name?.[0] || ""}${profile?.last_name?.[0] || ""}`.toUpperCase();

  return (
    <header className="h-16 border-b border-border/80 bg-card/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 transition-all">
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
          className="hidden sm:flex items-center gap-2 border-l border-border/70 pl-4 py-1 min-w-0"
          aria-label={t("appShell.header.pageContextLabel")}
        >
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
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

      {/* Search (auth-only: operates on protected data) */}
      {isAuthenticated && (
        <div className="flex-1 max-w-md hidden md:block">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
              type="search"
              placeholder={t("appShell.header.searchPlaceholder")}
              className="pl-10 h-9 bg-secondary/40 hover:bg-secondary/60 border-border/40 focus-visible:bg-background focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15 rounded-xl transition-all text-xs sm:text-sm"
            />
          </div>
        </div>
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
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-background animate-pulse">
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
                        <span className="text-[10px] text-muted-foreground/80 font-medium mt-0.5">
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

            {/* Account control */}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-9 w-9 p-0 hover:ring-2 hover:ring-primary/40 transition-all"
              onClick={() => navigate("/settings?tab=general")}
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
          </>
        )}
      </div>
    </header>
  );
}
