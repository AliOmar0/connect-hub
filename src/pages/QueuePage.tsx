import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle,
  Phone,
  Mail,
  MessageSquare,
  Clock,
  Check,
  PhoneCall,
  AlarmClock,
  Timer,
  TimerOff,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { BidiText } from "@/components/ui/bidi-text";
import { notifySuccess, notifyError } from "@/lib/feedback";
import { supabase } from "@/integrations/supabase/client";
import {
  BACKEND_URL,
  SLA_BUSINESS_HOURS_SECONDS,
  SLA_DUE_SOON_SECONDS,
  SLA_OUT_OF_HOURS_SECONDS,
} from "@/lib/config";

// /api/v1/sessions* routes are protected by verify_jwt on the backend, so
// every call needs the current Supabase access token attached (same pattern
// as SessionsPage.tsx / ChatView.tsx / KnowledgePage.tsx).
async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}
import { maskText } from "@/lib/mask";
import {
  useSlaTimer,
  formatCountdown,
  isBusinessHours,
  type SlaState,
} from "@/hooks/useSlaTimer";
import type { ViewStatus } from "@/types/presentation";
import { touchTargetClass } from "@/lib/touch-target";
import { cn } from "@/lib/utils";

/** Two initials for a queue card's avatar. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * One bucket of the SLA summary strip. The count is paired with a text label
 * and a token-backed dot, so the bucket is never identified by colour alone.
 */
function SlaTally({
  tone,
  label,
  count,
}: {
  tone: "error" | "warning" | "success";
  label: string;
  count: number;
}) {
  const dot = {
    error: "bg-status-error",
    warning: "bg-status-warning",
    success: "bg-status-success",
  }[tone];

  return (
    <span className="flex items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden="true" />
      <span className="text-body-sm text-muted-foreground">{label}</span>
      <span className="font-display text-body font-bold tabular-nums text-foreground">
        {count}
      </span>
    </span>
  );
}

interface QueueSession {
  id: string;
  channel: string;
  customer_name: string | null;
  customer_phone: string | null;
  last_message: string;
  status: string;
  started_at: string;
  wait_time_seconds: number | null;
  main_type_id: string | null;
}

const channelIcons: Record<string, React.ElementType> = {
  whatsapp: MessageCircle,
  messenger: MessageSquare,
  sms: MessageSquare,
  voice: Phone,
  email: Mail,
};

/**
 * Textual SLA countdown (Requirement 15.2). The remaining time is always
 * rendered as text and paired with a shape (icon) cue in addition to the color
 * cue, so meaning never depends on color alone (status non-color cue, Property
 * 2). Colors come from the semantic status tokens, not literal hues.
 */
function SlaBadge({ sla }: { sla: SlaState }) {
  const { t } = useTranslation();
  const critical = !sla.breached && sla.remainingSeconds < 30;
  const countdown = formatCountdown(sla.remainingSeconds);

  const Icon = sla.breached ? TimerOff : critical ? AlarmClock : Timer;
  const text = sla.breached ? t("queue.slaBreached") : countdown;
  const accessibleLabel = sla.breached
    ? t("queue.slaBreachedLabel")
    : t("queue.slaRemainingLabel", { time: countdown });

  return (
    <Badge
      variant="outline"
      aria-label={accessibleLabel}
      className={cn(
        "gap-1 font-mono",
        sla.breached
          ? "border-status-error/40 bg-status-error/10 text-status-error"
          : critical
            ? "border-status-warning/40 bg-status-warning/10 text-status-warning-foreground"
            : "border-status-success/40 bg-status-success/10 text-status-success-foreground",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{text}</span>
    </Badge>
  );
}

function QueueCard({
  session,
  isAccepting,
  onAccept,
  onCallback,
  onOpen,
}: {
  session: QueueSession;
  isAccepting: boolean;
  onAccept: (s: QueueSession) => void;
  onCallback: (s: QueueSession) => void;
  onOpen: (s: QueueSession) => void;
}) {
  const { t } = useTranslation();
  const sla = useSlaTimer(session.started_at);
  const ChannelIcon = channelIcons[session.channel] || MessageSquare;

  const customerName = session.customer_name || t("queue.unknownCustomer");
  const sessionRef = `#${session.id.slice(0, 8)}`;
  const waitingDuration = formatCountdown(sla.elapsedSeconds);

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* Initials, not a channel glyph. The channel is already named in
              the line below, and who is waiting is what identifies the card. */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-caption font-bold text-primary"
            aria-hidden="true"
          >
            {initialsOf(customerName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-foreground">
              {customerName}
            </p>
            <p className="flex items-center gap-1.5 truncate text-caption text-muted-foreground">
              <ChannelIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
              <BidiText value={maskText(session.customer_phone) || "—"} />
              <span aria-hidden="true">·</span>
              {t(`sessions.channels.${session.channel}`, {
                defaultValue: session.channel,
              })}
            </p>
          </div>
        </div>
        <SlaBadge sla={sla} />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Waiting context: waiting duration + originating session reference (Requirement 15.1) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {t("queue.waitingFor", { duration: waitingDuration })}
          </span>
          <span className="inline-flex items-center gap-1">
            {t("queue.sessionRefLabel")}
            <BidiText value={sessionRef} className="font-mono" />
          </span>
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">
          {maskText(session.last_message) || "—"}
        </p>
        <p className="text-caption text-muted-foreground/70">
          {t("queue.maskedNotice")}
        </p>

        <div className="flex flex-wrap items-center gap-2 touch-gap">
          <Button
            size="sm"
            disabled={isAccepting}
            className={touchTargetClass("grow")}
            onClick={() => onAccept(session)}
          >
            <Check className="h-4 w-4 me-1" aria-hidden="true" />
            {t("queue.accept")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={touchTargetClass("grow")}
            onClick={() => onCallback(session)}
          >
            <PhoneCall className="h-4 w-4 me-1" aria-hidden="true" />
            {t("queue.offerCallback")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={touchTargetClass("grow")}
            onClick={() => onOpen(session)}
          >
            {t("handoff.transcript")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-4 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-11 w-24" />
              <Skeleton className="h-11 w-28" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function QueuePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Escalations optimistically removed from the presentation after being
  // accepted. On accept failure they are restored so the item is retained in
  // the queue presentation (Requirement 15.5).
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const {
    data: sessions = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["escalation-queue"],
    queryFn: async (): Promise<QueueSession[]> => {
      const res = await fetch(`${BACKEND_URL}/api/v1/sessions`, {
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load queue");
      const data: QueueSession[] = await res.json();
      return data.filter(
        (s) => s.status === "escalated" || s.status === "waiting",
      );
    },
    refetchInterval: 5000,
  });

  // Refresh the queue when a new escalation notification arrives.
  useEffect(() => {
    const channel = supabase
      .channel("queue-escalations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => queryClient.invalidateQueries({ queryKey: ["escalation-queue"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Escalations currently shown: server results minus optimistically accepted.
  const visibleSessions = useMemo(
    () => sessions.filter((s) => !removedIds.has(s.id)),
    [sessions, removedIds],
  );

  const restore = (id: string) =>
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const acceptMutation = useMutation({
    mutationFn: async (s: QueueSession) => {
      const res = await fetch(`${BACKEND_URL}/api/v1/sessions/${s.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) throw new Error("Accept failed");
      return res.json();
    },
    onSuccess: (_data, s) => {
      // Confirmation identifying the accepted escalation (Requirement 15.4).
      notifySuccess(
        t("queue.acceptedNamed", {
          name: s.customer_name || t("queue.unknownCustomer"),
        }),
      );
      queryClient.invalidateQueries({ queryKey: ["escalation-queue"] });
    },
    onError: (_error, s) => {
      // Retain the escalation in the queue presentation and offer recovery
      // (Requirement 15.5).
      restore(s.id);
      notifyError(t("queue.acceptFailed"), {
        action: { label: t("feedback.retry"), onClick: () => onAccept(s) },
      });
    },
  });

  const callbackMutation = useMutation({
    mutationFn: async (s: QueueSession) => {
      const res = await fetch(`${BACKEND_URL}/api/v1/sessions/${s.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({ status: "waiting" }),
      });
      if (!res.ok) throw new Error("Callback failed");
      return res.json();
    },
    onSuccess: () => {
      notifySuccess(t("queue.callbackToast"));
      queryClient.invalidateQueries({ queryKey: ["escalation-queue"] });
    },
    onError: () => notifyError(t("queue.callbackFailed")),
  });

  const onAccept = (s: QueueSession) => {
    // Optimistically remove from the queue presentation (Requirement 15.4).
    setRemovedIds((prev) => new Set(prev).add(s.id));
    acceptMutation.mutate(s);
  };

  const onCallback = (s: QueueSession) => callbackMutation.mutate(s);

  const onOpen = (s: QueueSession) => navigate(`/sessions/${s.id}`);

  const status: ViewStatus = isError
    ? "error"
    : isLoading
      ? "loading"
      : visibleSessions.length === 0
        ? "empty"
        : "loaded";

  // How the queue is doing against its SLA, at a glance. Each card carries its
  // own countdown, but with more than a handful of cards the one number that
  // decides whether to pull someone off another task -- how many have already
  // breached -- had to be counted by eye.
  //
  // Recomputed on the same 5s tick as the query rather than per second: the
  // buckets are a summary, and a whole page re-render every second to move one
  // card between two of them is not worth it.
  const slaSummary = useMemo(() => {
    const window = isBusinessHours()
      ? SLA_BUSINESS_HOURS_SECONDS
      : SLA_OUT_OF_HOURS_SECONDS;
    const now = Date.now();

    let breached = 0;
    let dueSoon = 0;
    let withinSla = 0;

    for (const session of visibleSessions) {
      const started = session.started_at
        ? new Date(session.started_at).getTime()
        : now;
      const remaining =
        window - Math.max(0, Math.floor((now - started) / 1000));
      if (remaining <= 0) breached += 1;
      else if (remaining <= SLA_DUE_SOON_SECONDS) dueSoon += 1;
      else withinSla += 1;
    }

    return { breached, dueSoon, withinSla };
  }, [visibleSessions]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={t("queue.title")}
          description={t("queue.subtitle")}
        />

        {status === "loaded" && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-secondary/40 px-5 py-3">
            <SlaTally
              tone="error"
              label={t("queue.summary.breached")}
              count={slaSummary.breached}
            />
            <SlaTally
              tone="warning"
              label={t("queue.summary.dueSoon", {
                seconds: SLA_DUE_SOON_SECONDS,
              })}
              count={slaSummary.dueSoon}
            />
            <SlaTally
              tone="success"
              label={t("queue.summary.withinSla")}
              count={slaSummary.withinSla}
            />
            {/* The list moves on its own; say so rather than leaving a reader
                wondering whether what they see is current. */}
            <span className="ms-auto text-body-sm text-muted-foreground">
              {t("queue.summary.refreshHint")}
            </span>
          </div>
        )}

        <AsyncBoundary
          status={status}
          skeleton={<QueueSkeleton />}
          onRetry={() => refetch()}
          emptyTitle={t("queue.emptyTitle")}
          emptyDescription={t("queue.empty")}
          emptyIcon={<Clock />}
          errorTitle={t("queue.loadErrorTitle")}
          errorDescription={t("queue.loadErrorDescription")}
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleSessions.map((s) => (
              <QueueCard
                key={s.id}
                session={s}
                isAccepting={
                  acceptMutation.isPending &&
                  acceptMutation.variables?.id === s.id
                }
                onAccept={onAccept}
                onCallback={onCallback}
                onOpen={onOpen}
              />
            ))}
          </div>
        </AsyncBoundary>
      </div>
    </DashboardLayout>
  );
}
