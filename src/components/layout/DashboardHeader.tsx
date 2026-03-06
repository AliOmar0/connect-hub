import { Bell, Search, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Notification } from "@/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function DashboardHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Fetch real notification count and recent notifications
  const { data: notifications } = useQuery({
    queryKey: ["header-notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return { count: 0, items: [] };
      const { data, count } = await supabase
        .from("notifications")
        .select("*", { count: "exact" })
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(5);
      return { count: count || 0, items: (data || []) as Notification[] };
    },
    enabled: !!user?.id,
  });

  const queryClient = useQueryClient();

  // Fetch user profile for avatar
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
    enabled: !!user?.id,
  });

  // Real-time subscription for notifications
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("header-notifications-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["header-notifications"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return (
    <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between gap-4">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search conversations, employees..."
            className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1"
          />
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Integration Status */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-chart-success pulse-green" />
            <span className="text-xs font-medium text-muted-foreground">
              WhatsApp
            </span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-chart-success pulse-green" />
            <span className="text-xs font-medium text-muted-foreground">
              Messenger
            </span>
          </div>
        </div>

        {/* Quick Action: Jump to Active AI Sessions */}
        <Button
          variant="outline"
          size="icon"
          className="relative"
          onClick={() => navigate("/sessions")}
          aria-label="Active AI Sessions"
        >
          <Headphones className="h-4 w-4" />
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="relative"
              aria-label="Notifications"
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
              Notifications
              {notifications && notifications.count > 0 && (
                <Badge variant="secondary">{notifications.count} new</Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto">
              {notifications && notifications.items.length > 0 ? (
                notifications.items.map((notif) => (
                  <DropdownMenuItem
                    key={notif.id}
                    className="flex flex-col items-start gap-1 py-3 cursor-pointer"
                    onClick={() => {
                      if (notif.action_url) {
                        navigate(notif.action_url);
                      } else {
                        navigate("/notifications");
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          notif.type === "error"
                            ? "bg-destructive"
                            : notif.type === "warning"
                              ? "bg-yellow-500"
                              : notif.type === "success"
                                ? "bg-green-500"
                                : notif.type === "escalation"
                                  ? "bg-orange-500"
                                  : "bg-blue-500"
                        }`}
                      />
                      <span className="font-medium text-sm">{notif.title}</span>
                    </div>
                    {notif.message && (
                      <span className="text-xs text-muted-foreground pl-4">
                        {notif.message}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground pl-4">
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
                  No new notifications
                </DropdownMenuItem>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-center justify-center text-sm text-primary font-medium"
              onClick={() => navigate("/notifications")}
            >
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Avatar & Time */}
        <div className="flex items-center gap-3 pl-2 border-l border-border/60">
          <div className="hidden lg:flex flex-col items-end text-right">
            <span className="text-sm font-semibold font-display">
              {new Date().toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-xs text-muted-foreground truncate max-w-[100px]">
              {profile
                ? `${profile.first_name || ""} ${profile.last_name || ""}`
                : "Loading..."}
            </span>
          </div>

          <Avatar
            className="h-9 w-9 border border-border cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all"
            onClick={() => navigate("/settings?tab=general")}
          >
            <AvatarImage src={profile?.avatar_url || ""} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
              {profile?.first_name?.[0]}
              {profile?.last_name?.[0]}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
