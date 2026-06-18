import { useEffect } from "react";
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
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BACKEND_URL } from "@/lib/config";
import { maskText } from "@/lib/mask";
import { useSlaTimer, formatCountdown } from "@/hooks/useSlaTimer";
import { cn } from "@/lib/utils";

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

function SlaBadge({ startedAt }: { startedAt: string }) {
  const { t } = useTranslation();
  const sla = useSlaTimer(startedAt);
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-mono",
        sla.breached
          ? "border-red-500/40 text-red-600 bg-red-500/10"
          : sla.remainingSeconds < 30
            ? "border-orange-500/40 text-orange-600 bg-orange-500/10"
            : "border-green-500/40 text-green-600 bg-green-500/10",
      )}
    >
      <AlarmClock className="h-3 w-3" />
      {sla.breached
        ? t("queue.slaBreached")
        : formatCountdown(sla.remainingSeconds)}
    </Badge>
  );
}

function QueueCard({
  session,
  onAccept,
  onCallback,
  onOpen,
}: {
  session: QueueSession;
  onAccept: (s: QueueSession) => void;
  onCallback: (s: QueueSession) => void;
  onOpen: (s: QueueSession) => void;
}) {
  const { t } = useTranslation();
  const ChannelIcon = channelIcons[session.channel] || MessageSquare;

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ChannelIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">
              {session.customer_name || "Unknown"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {maskText(session.customer_phone)} · {session.channel}
            </p>
          </div>
        </div>
        <SlaBadge startedAt={session.started_at} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {maskText(session.last_message) || "—"}
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          {t("queue.maskedNotice")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="min-h-[44px] sm:min-h-9"
            onClick={() => onAccept(session)}
          >
            <Check className="h-4 w-4 me-1" />
            {t("queue.accept")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] sm:min-h-9"
            onClick={() => onCallback(session)}
          >
            <PhoneCall className="h-4 w-4 me-1" />
            {t("queue.offerCallback")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-[44px] sm:min-h-9"
            onClick={() => onOpen(session)}
          >
            {t("handoff.transcript")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function QueuePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["escalation-queue"],
    queryFn: async (): Promise<QueueSession[]> => {
      const res = await fetch(`${BACKEND_URL}/api/v1/sessions`);
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

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`${BACKEND_URL}/api/v1/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["escalation-queue"] }),
    onError: () => toast.error("Could not update the session."),
  });

  const onAccept = (s: QueueSession) => {
    updateStatus.mutate({ id: s.id, status: "active" });
    toast.success(t("queue.acceptedToast"));
  };

  const onCallback = (s: QueueSession) => {
    updateStatus.mutate({ id: s.id, status: "waiting" });
    toast.success(t("queue.callbackToast"));
  };

  const onOpen = (s: QueueSession) => navigate(`/sessions/${s.id}`);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t("queue.title")}</h1>
          <p className="text-muted-foreground">{t("queue.subtitle")}</p>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : sessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <Clock className="h-8 w-8 opacity-40" />
              <p>{t("queue.empty")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sessions.map((s) => (
              <QueueCard
                key={s.id}
                session={s}
                onAccept={onAccept}
                onCallback={onCallback}
                onOpen={onOpen}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
