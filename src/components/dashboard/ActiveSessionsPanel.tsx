import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ChevronRight,
  Clock,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Session,
  Customer,
  Employee,
  Profile,
  Message,
} from "@/types/database";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

type PanelSession = Session & {
  customer?: Customer;
  employee?: Employee & { profile?: Profile };
  messages?: Pick<Message, "content" | "sent_at" | "direction">[];
};

interface ActiveSessionsPanelProps {
  sessions?: PanelSession[];
}

const statusConfig: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  active: {
    label: "Active",
    className: "bg-chart-success/10 text-chart-success border-chart-success/20",
    dot: "bg-chart-success",
  },
  escalated: {
    label: "Escalated",
    className: "bg-chart-warning/10 text-chart-warning border-chart-warning/20",
    dot: "bg-chart-warning",
  },
  transferring: {
    label: "Transferring",
    className: "bg-chart-info/10 text-chart-info border-chart-info/20",
    dot: "bg-chart-info",
  },
  waiting: {
    label: "Waiting",
    className: "bg-chart-info/10 text-chart-info border-chart-info/20",
    dot: "bg-chart-info",
  },
  "on-hold": {
    label: "On Hold",
    className: "bg-muted text-muted-foreground border-muted/20",
    dot: "bg-muted-foreground",
  },
  // An escalation the cleanup loop ended after ESCALATION_TIMEOUT_MINUTES.
  // Muted, like the other states where nothing is happening any more.
  auto_closed: {
    label: "Auto-closed",
    className: "bg-muted text-muted-foreground border-muted/20",
    dot: "bg-muted-foreground",
  },
};

// Channels are drawn as stroke icons on token-backed tints, matching
// SessionsTable. They used to be emoji (🟢🔵📞💬📧), which do not recolour with
// the theme, render differently on every platform, and are decorative glyphs in
// interface copy (Requirement 2.4).
const channelMeta: Record<
  string,
  { Icon: LucideIcon; label: string; className: string }
> = {
  whatsapp: {
    Icon: MessageCircle,
    label: "WhatsApp",
    className: "bg-chart-success/10 text-chart-success",
  },
  messenger: {
    Icon: MessageSquare,
    label: "Messenger",
    className: "bg-chart-info/10 text-chart-info",
  },
  voice: {
    Icon: Phone,
    label: "Voice call",
    className: "bg-chart-warning/10 text-chart-warning",
  },
  sms: {
    Icon: MessageSquare,
    label: "SMS",
    className: "bg-chart-secondary/10 text-chart-secondary",
  },
  email: {
    Icon: Mail,
    label: "Email",
    className: "bg-chart-primary/10 text-chart-primary",
  },
};

function formatDurationFromSeconds(seconds: number): string {
  if (!seconds || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function lastMessage(session: PanelSession): string | null {
  const msgs = session.messages;
  if (!msgs || msgs.length === 0) return null;
  const sorted = [...msgs].sort(
    (a, b) => new Date(b.sent_at).valueOf() - new Date(a.sent_at).valueOf(),
  );
  const latest = sorted[0];
  if (!latest?.content) return null;
  const prefix = latest.direction === "outbound" ? "AI: " : "";
  return `${prefix}${latest.content}`;
}

export default function ActiveSessionsPanel({
  sessions = [],
}: ActiveSessionsPanelProps) {
  const navigate = useNavigate();
  const displaySessions = sessions.slice(0, 5);

  // Re-render every second so live durations tick up.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const liveCount = sessions.filter(
    (s) => s.status === "active" || s.status === "escalated",
  ).length;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg font-semibold flex items-center gap-2">
            Active AI Sessions
            <Badge
              variant="secondary"
              className="bg-gold/10 text-gold border border-gold/20 gap-1.5"
            >
              <span className="relative flex h-2 w-2">
                {liveCount > 0 && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-success opacity-75" />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    liveCount > 0 ? "bg-chart-success" : "bg-muted-foreground",
                  )}
                />
              </span>
              {sessions.length} live
            </Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => navigate("/sessions")}
          >
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {displaySessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary/50">
              <MessageSquare className="h-5 w-5 opacity-60" />
            </div>
            <p className="text-sm font-medium">No active sessions</p>
            <p className="text-xs opacity-70">
              Live calls and chats will appear here in real time.
            </p>
          </div>
        ) : (
          displaySessions.map((session, index) => {
            const customerName = session.customer?.name || "Unknown";
            const phone = session.customer?.phone;
            const agentName = session.employee?.profile
              ? `${session.employee.profile.first_name || ""} ${session.employee.profile.last_name || ""}`.trim()
              : session.status === "escalated" || session.status === "waiting"
                ? "Unassigned"
                : "AI Agent";
            const seconds = session.duration_seconds
              ? session.duration_seconds
              : Math.floor(
                  (Date.now() - new Date(session.started_at).getTime()) / 1000,
                );
            const duration = formatDurationFromSeconds(seconds);
            const isCall = session.channel === "voice";
            const channel = channelMeta[session.channel] || {
              Icon: MessageSquare,
              label: session.channel,
              className: "bg-status-neutral/10 text-status-neutral",
            };
            const status =
              statusConfig[session.status as keyof typeof statusConfig] ||
              statusConfig.active;
            const preview = lastMessage(session);
            const startedAgo = formatDistanceToNowStrict(
              new Date(session.started_at),
              { addSuffix: true },
            );

            return (
              <button
                key={session.id}
                type="button"
                onClick={() => navigate(`/sessions/${session.id}`)}
                className="w-full flex items-start gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors group fade-in-up text-left"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {/* Avatar with channel badge */}
                <div className="relative shrink-0">
                  <Avatar className="h-10 w-10 border-2 border-border">
                    <AvatarFallback
                      className={cn(
                        "font-semibold text-sm",
                        isCall
                          ? "bg-gold/10 text-gold"
                          : "bg-navy/10 text-navy",
                      )}
                    >
                      {customerName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    title={channel.label}
                    className={cn(
                      "absolute -bottom-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full border border-card",
                      channel.className,
                    )}
                  >
                    <channel.Icon aria-hidden="true" className="h-2.5 w-2.5" />
                    <span className="sr-only">{channel.label}</span>
                  </span>
                </div>

                {/* Session info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {customerName}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-overline font-medium gap-1 py-0",
                        status.className,
                      )}
                    >
                      <span
                        className={cn("h-1.5 w-1.5 rounded-full", status.dot)}
                      />
                      {status.label}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {preview ? (
                      <span dir="auto">{preview}</span>
                    ) : (
                      <span className="opacity-70">
                        {channel.label}
                        {phone ? ` · ${phone}` : ""}
                        {agentName ? ` · ${agentName}` : ""}
                      </span>
                    )}
                  </p>

                  <div className="flex items-center gap-3 text-caption text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      {isCall ? (
                        <Phone className="h-3 w-3 text-gold" />
                      ) : (
                        <MessageSquare className="h-3 w-3 text-navy" />
                      )}
                      {channel.label}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {duration}
                    </span>
                    <span className="opacity-70">{startedAgo}</span>
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground self-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
