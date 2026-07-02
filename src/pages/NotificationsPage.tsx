import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { LiveRegion } from "@/components/ui/live-region";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  Check,
  CheckCheck,
  CircleDot,
  Filter,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { notifySuccess, notifyError } from "@/lib/feedback";
import { Notification } from "@/types/database";
import type { ViewStatus } from "@/types/presentation";
import { touchTargetClass, touchGapClass } from "@/lib/touch-target";
import { cn } from "@/lib/utils";

type NotificationType = "info" | "success" | "warning" | "error";

/**
 * Notification type -> semantic status token + shape (icon) cue. Colors come
 * from the design system's status tokens (never literal hues), and each type
 * always carries an icon so meaning is not conveyed by color alone
 * (Requirement 3.5, Property 2).
 */
const typeMeta: Record<
  NotificationType,
  { icon: React.ElementType; className: string }
> = {
  info: {
    icon: Info,
    className: "border-status-info/40 bg-status-info/10 text-status-info",
  },
  success: {
    icon: CheckCircle2,
    className:
      "border-status-success/40 bg-status-success/10 text-status-success",
  },
  warning: {
    icon: AlertTriangle,
    className:
      "border-status-warning/40 bg-status-warning/10 text-status-warning-foreground",
  },
  error: {
    icon: AlertCircle,
    className: "border-status-error/40 bg-status-error/10 text-status-error",
  },
};

function NotificationsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-3 w-full max-w-md" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Non-color read/unread cue (Requirement 20.2): a text label paired with a
 * shape/icon cue in addition to color. Unread uses a filled dot + "Unread";
 * read uses a check + "Read". Never relies on color alone.
 */
function ReadStateBadge({ isRead }: { isRead: boolean }) {
  const { t } = useTranslation();
  if (isRead) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-border bg-muted text-muted-foreground"
      >
        <Check className="h-3 w-3" aria-hidden="true" />
        <span>{t("notifications.read")}</span>
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-primary/40 bg-primary/10 text-primary"
    >
      <CircleDot className="h-3 w-3" aria-hidden="true" />
      <span>{t("notifications.unread")}</span>
    </Badge>
  );
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  // Message announced to assistive technology when the read state changes
  // (Requirement 20.4). Changing this value re-announces via the LiveRegion.
  const [readStateAnnouncement, setReadStateAnnouncement] = useState("");

  const {
    data: notifications = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["notifications", user?.id, filter],
    queryFn: async (): Promise<Notification[]> => {
      if (!user?.id) return [];

      let query = supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .or(`user_id.eq.${user.id},user_id.is.null`);

      if (filter === "unread") {
        query = query.eq("is_read", false);
      } else if (filter === "read") {
        query = query.eq("is_read", true);
      }

      const { data, error } = await query;

      // Surface the failure so the shared ErrorState + retry can recover
      // (Requirement 20.6) instead of silently rendering an empty list.
      if (error) throw error;

      return (data || []) as Notification[];
    },
    enabled: !!user?.id,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      // Announce the read-state change to assistive technology (Requirement
      // 20.4). Re-invalidate so the presentation reflects the new state.
      setReadStateAnnouncement(t("notifications.markedReadAnnouncement"));
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (_error, id) => {
      // Present a recoverable error and retain the unread state — the DB
      // update failed and we never optimistically flipped it (Requirement
      // 20.7).
      notifyError(t("notifications.markReadFailed"), {
        action: {
          label: t("feedback.retry"),
          onClick: () => markAsReadMutation.mutate(id),
        },
      });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .eq("is_read", false);

      if (error) throw error;
    },
    onSuccess: () => {
      setReadStateAnnouncement(t("notifications.allMarkedReadAnnouncement"));
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      notifySuccess(t("notifications.allMarkedRead"));
    },
    onError: () => {
      notifyError(t("notifications.markAllReadFailed"), {
        action: {
          label: t("feedback.retry"),
          onClick: () => markAllAsReadMutation.mutate(),
        },
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      notifySuccess(t("notifications.deleted"));
    },
    onError: (_error, id) => {
      notifyError(t("notifications.deleteFailed"), {
        action: {
          label: t("feedback.retry"),
          onClick: () => deleteMutation.mutate(id),
        },
      });
    },
  });

  const deleteAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("is_read", true)
        .or(`user_id.eq.${user.id},user_id.is.null`);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      notifySuccess(t("notifications.allReadDeleted"));
    },
    onError: () => {
      notifyError(t("notifications.deleteAllReadFailed"), {
        action: {
          label: t("feedback.retry"),
          onClick: () => deleteAllReadMutation.mutate(),
        },
      });
    },
  });

  // Real-time subscription: refresh the list on any notification change.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("notifications-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.action_url) {
      window.location.href = notification.action_url;
    }
  };

  // Derive the list view's ViewStatus for the shared AsyncBoundary so loading
  // (20.5), empty (20.3), and error (20.6) states use the standard patterns.
  const status: ViewStatus = isError
    ? "error"
    : isLoading
      ? "loading"
      : notifications.length === 0
        ? "empty"
        : "loaded";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Read-state changes are announced to AT within 1s (Requirement 20.4). */}
        <LiveRegion message={readStateAnnouncement} politeness="polite" />

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">
              {t("notifications.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("notifications.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 touch-gap">
            <Select
              value={filter}
              onValueChange={(v) => setFilter(v as "all" | "unread" | "read")}
            >
              <SelectTrigger
                className="w-[180px]"
                aria-label={t("notifications.filter")}
              >
                <Filter className="me-2 h-4 w-4" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("notifications.filterAll")}
                </SelectItem>
                <SelectItem value="unread">
                  {t("notifications.filterUnread", { count: unreadCount })}
                </SelectItem>
                <SelectItem value="read">
                  {t("notifications.filterRead")}
                </SelectItem>
              </SelectContent>
            </Select>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
              >
                <CheckCheck className="me-2 h-4 w-4" aria-hidden="true" />
                {t("notifications.markAllRead")}
              </Button>
            )}
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (window.confirm(t("notifications.confirmDeleteAllRead"))) {
                  deleteAllReadMutation.mutate();
                }
              }}
              disabled={deleteAllReadMutation.isPending}
            >
              <Trash2 className="me-2 h-4 w-4" aria-hidden="true" />
              {t("notifications.deleteAllRead")}
            </Button>
          </div>
        </div>

        <AsyncBoundary
          status={status}
          skeleton={<NotificationsSkeleton />}
          onRetry={() => refetch()}
          emptyTitle={t("notifications.emptyTitle")}
          emptyDescription={t("notifications.emptyDescription")}
          emptyIcon={<Bell />}
          errorTitle={t("notifications.loadErrorTitle")}
          errorDescription={t("notifications.loadErrorDescription")}
        >
          <ul className="space-y-3">
            {notifications.map((notification) => {
              const type = (notification.type || "info") as NotificationType;
              const meta = typeMeta[type] ?? typeMeta.info;
              const TypeIcon = meta.icon;
              const isRead = !!notification.is_read;

              return (
                <li key={notification.id}>
                  <Card
                    className={cn(
                      "cursor-pointer shadow-card transition-shadow hover:shadow-md",
                      !isRead && "border-primary/40 bg-primary/5",
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Bell
                              className={cn(
                                "h-4 w-4",
                                isRead
                                  ? "text-muted-foreground"
                                  : "text-primary",
                              )}
                              aria-hidden="true"
                            />
                            <h2
                              className={cn(
                                "text-base font-semibold",
                                isRead
                                  ? "font-medium text-muted-foreground"
                                  : "text-foreground",
                              )}
                            >
                              {notification.title}
                            </h2>
                            <ReadStateBadge isRead={isRead} />
                          </div>
                          {notification.message && (
                            <p className="text-sm text-muted-foreground">
                              {notification.message}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn("gap-1 text-xs", meta.className)}
                            >
                              <TypeIcon
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                              <span>{t(`notifications.types.${type}`)}</span>
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(
                                new Date(notification.created_at),
                                { addSuffix: true },
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 touch-gap">
                          {!isRead && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t("notifications.markAsRead")}
                              className={touchTargetClass(
                                "grow",
                                "text-muted-foreground hover:text-primary",
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsReadMutation.mutate(notification.id);
                              }}
                            >
                              <Check className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("notifications.delete")}
                            className={touchTargetClass(
                              "grow",
                              "text-muted-foreground hover:text-destructive",
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                window.confirm(t("notifications.confirmDelete"))
                              ) {
                                deleteMutation.mutate(notification.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </AsyncBoundary>
      </div>
    </DashboardLayout>
  );
}
