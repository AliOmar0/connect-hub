// SessionActivityPage — the call history for a single session.
//
// Previously a card wedged beside the conversation on SessionsPage; moved to
// its own route so the conversation gets the full width of the console and
// activity gets room to breathe as its own view (a deep link too, via
// notifications/exports that reference /sessions/:id).
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Hourglass,
  Phone,
  TimerOff,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { BidiText } from "@/components/ui/bidi-text";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { supabase } from "@/integrations/supabase/client";
import type { Call, Customer, Session } from "@/types/database";
import type { ViewStatus } from "@/types/presentation";

type SessionWithCustomer = Session & { customer?: Customer };

// Same status vocabulary as SessionList/SessionsTable: one tone plus one
// shape per status, so state is never carried by colour alone.
const statusTones: Record<string, StatusTone> = {
  active: "success",
  waiting: "warning",
  completed: "info",
  escalated: "error",
  auto_closed: "neutral",
  missed: "neutral",
};

const statusIcons: Record<string, LucideIcon> = {
  active: CircleDot,
  waiting: Hourglass,
  completed: CheckCircle2,
  escalated: AlertTriangle,
  auto_closed: TimerOff,
  missed: XCircle,
};

export default function SessionActivityPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: sessionId } = useParams<{ id: string }>();

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session-activity-session", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const { data, error } = await supabase
        .from("sessions")
        .select("*, customer:customers(*)")
        .eq("id", sessionId)
        .single();

      if (error) {
        console.error("Error fetching session:", error);
        return null;
      }
      return data as unknown as SessionWithCustomer;
    },
    enabled: !!sessionId,
  });

  const {
    data: calls,
    isLoading: callsLoading,
    isError: isCallsError,
    refetch: refetchCalls,
  } = useQuery({
    queryKey: ["session-activity-calls", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .eq("session_id", sessionId)
        .order("started_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Call[];
    },
    enabled: !!sessionId,
  });

  // Realtime: new/updated calls for this session while the page is open.
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`session-${sessionId}-activity`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calls",
          filter: `session_id=eq.${sessionId}`,
        },
        () => refetchCalls(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, refetchCalls]);

  const callsStatus: ViewStatus = callsLoading
    ? "loading"
    : isCallsError
      ? "error"
      : (calls?.length ?? 0) === 0
        ? "empty"
        : "loaded";

  const StatusIcon = session ? statusIcons[session.status] : undefined;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4">
        <PageHeader
          title={t("sessions.activity.title")}
          description={
            session?.customer?.name ?? t("sessions.activity.subtitle")
          }
          actions={
            <Button
              variant="outline"
              className="min-h-[44px] gap-2"
              onClick={() =>
                sessionId ? navigate(`/sessions/${sessionId}`) : navigate(-1)
              }
            >
              <ArrowLeft
                className="h-4 w-4 rtl:rotate-180"
                aria-hidden="true"
              />
              {t("sessions.activity.backToSession")}
            </Button>
          }
        />

        <Card className="border-border/60 shadow-md">
          <CardContent className="p-6 space-y-4">
            {!sessionLoading && session && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {t("sessions.activity.subtitle")}
                </p>
                <StatusBadge
                  tone={statusTones[session.status] ?? "neutral"}
                  icon={StatusIcon}
                  label={t(`sessions.status.${session.status}`, {
                    defaultValue: session.status,
                  })}
                />
              </div>
            )}

            <AsyncBoundary
              status={callsStatus}
              onRetry={() => refetchCalls()}
              emptyTitle={t("sessions.activity.empty")}
              emptyIcon={<Phone />}
              skeleton={
                <div className="space-y-4">
                  {[...Array(4)].map((_, idx) => (
                    <div
                      key={idx}
                      className="h-20 rounded-xl bg-muted animate-pulse"
                    />
                  ))}
                </div>
              }
            >
              <div className="space-y-4">
                {calls?.map((call) => (
                  <div
                    key={call.id}
                    className="rounded-xl border border-border p-4 bg-muted/20 space-y-2 hover:border-primary/20 hover:bg-muted/40 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold flex items-center gap-2">
                        {call.direction === "inbound" ? (
                          <div className="w-2.5 h-2.5 rounded-full bg-status-info"></div>
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-status-success"></div>
                        )}
                        {call.direction === "inbound"
                          ? t("sessions.activity.inboundCall")
                          : t("sessions.activity.outboundCall")}
                      </span>
                      <span className="text-caption text-muted-foreground font-medium">
                        {new Date(call.started_at).toLocaleString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="bg-background/50 p-2 rounded-lg border border-border/50">
                        <span className="block opacity-60">
                          {t("sessions.activity.status")}
                        </span>
                        <span className="font-medium text-foreground">
                          {call.status}
                        </span>
                      </div>
                      <div className="bg-background/50 p-2 rounded-lg border border-border/50">
                        <span className="block opacity-60">
                          {t("sessions.activity.duration")}
                        </span>
                        <span className="font-medium text-foreground">
                          {call.duration_seconds
                            ? `${call.duration_seconds}s`
                            : "0s"}
                        </span>
                      </div>
                    </div>
                    {call.phone_number && (
                      <p className="text-xs text-muted-foreground px-1 flex items-center gap-1">
                        <span className="opacity-60">
                          {t("sessions.activity.id")}:
                        </span>{" "}
                        <BidiText value={call.phone_number} />
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </AsyncBoundary>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
