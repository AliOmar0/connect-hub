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
    [/^\/backend-test/, "backendTest"],
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

  const accountName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
    : "";
  const accountInitials =
    `${profile?.first_name?.[0] || ""}${profile?.last_name?.[0] || ""}`.toUpperCase();

  return (
    <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between gap-4">
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
              className="h-8 w-auto object-contain"
              onError={() => setLogoError(true)}
            />
          )}
        </div>

        {/* Page-context indicator naming the current page */}
        <div
          className="hidden sm:flex flex-col border-l border-border/60 pl-4 min-w-0"
          aria-label={t("appShell.header.pageContextLabel")}
        >
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("appShell.header.pageContextLabel")}
          </span>
          <span
            className="text-sm font-semibold text-foreground truncate"
            aria-current="page"
            data-testid="page-context"
          >
            {pageName}
          </span>
        </div>
      </div>

      {/* Search (auth-only: operates on protected data) */}
      {isAuthenticated && (
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("appShell.header.searchPlaceholder")}
              className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1"
            />
          </div>
        </div>
      )}

      {/* Right-side controls */}
      <div className="flex items-center gap-2">
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
                  className="relative"
                  aria-label={t("appShell.header.notifications")}
                >
                  <Bell className="h-4 w-4" />
                  {notifications && notifications.count > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                      {notifications.count > 99 ? "99+" : notifications.count}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                  {t("appShell.header.notifications")}
                  {notifications && notifications.count > 0 && (
                    <Badge variant="secondary">
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
                        className="flex flex-col items-start gap-1 py-3 cursor-pointer"
                        onClick={() =>
                          navigate(notif.action_url || "/notifications")
                        }
                      >
                        <span className="font-medium text-sm">
                          {notif.title}
                        </span>
                        {notif.message && (
                          <span className="text-xs text-muted-foreground">
                            {notif.message}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(notif.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem
                      disabled
                      className="text-center text-sm text-muted-foreground py-4"
                    >
                      {t("appShell.header.noNotifications")}
                    </DropdownMenuItem>
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-center justify-center text-sm text-primary font-medium"
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
              className="rounded-full"
              onClick={() => navigate("/settings?tab=general")}
              aria-label={
                accountName
                  ? `${t("appShell.header.account")}: ${accountName}`
                  : t("appShell.header.account")
              }
            >
              <Avatar className="h-9 w-9 border border-border">
                <AvatarImage src={profile?.avatar_url || ""} alt="" />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
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
