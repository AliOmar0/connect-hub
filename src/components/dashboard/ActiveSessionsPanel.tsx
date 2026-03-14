import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, MessageSquare, MoreVertical, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatDistanceToNow,
  intervalToDuration,
  formatDuration,
} from "date-fns";
import { Session, Customer, Employee, Profile } from "@/types/database";
import { useNavigate } from "react-router-dom";

interface ActiveSessionsPanelProps {
  sessions?: Array<
    Session & {
      customer?: Customer;
      employee?: Employee & { profile?: Profile };
    }
  >;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-chart-success/10 text-chart-success border-chart-success/20",
  },
  escalated: {
    label: "Escalated",
    className: "bg-chart-warning/10 text-chart-warning border-chart-warning/20",
  },
  transferring: {
    label: "Transferring",
    className: "bg-chart-info/10 text-chart-info border-chart-info/20",
  },
  waiting: {
    label: "Waiting",
    className: "bg-chart-info/10 text-chart-info border-chart-info/20",
  },
  "on-hold": {
    label: "On Hold",
    className: "bg-muted text-muted-foreground border-muted/20",
  },
};

const channelIcons: Record<string, string> = {
  whatsapp: "🟢",
  messenger: "🔵",
  voice: "📞",
  sms: "💬",
  email: "📧",
};

function formatDurationFromSeconds(seconds: number | null): string {
  if (!seconds) return "0:00";
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  return (
    formatDuration(duration, { format: ["minutes", "seconds"] })
      .replace(/ minutes?/, "m")
      .replace(/ seconds?/, "s") || "0:00"
  );
}

import { useState, useEffect } from "react";

export default function ActiveSessionsPanel({
  sessions = [],
}: ActiveSessionsPanelProps) {
  const navigate = useNavigate();
  const displaySessions = sessions.slice(0, 5);

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg font-semibold flex items-center gap-2">
            Active AI Sessions
            <Badge
              variant="secondary"
              className="bg-gold/10 text-gold border border-gold/20"
            >
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
      <CardContent className="space-y-3">
        {displaySessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No active sessions
          </div>
        ) : (
          displaySessions.map((session, index) => {
            const customerName = session.customer?.name || "Unknown";
            const agentName = session.employee?.profile
              ? `${session.employee.profile.first_name || ""} ${session.employee.profile.last_name || ""}`.trim()
              : "Unassigned";
            const duration = session.duration_seconds
              ? formatDurationFromSeconds(session.duration_seconds)
              : formatDurationFromSeconds(
                  Math.floor(
                    (Date.now() - new Date(session.started_at).getTime()) /
                      1000,
                  ),
                );
            const isCall = session.channel === "voice";

            return (
              <div
                key={session.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group fade-in-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Customer Avatar */}
                <Avatar className="h-10 w-10 border-2 border-border">
                  <AvatarFallback className="bg-navy/10 text-navy font-semibold text-sm">
                    {customerName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>

                {/* Session Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {customerName}
                    </span>
                    <span className="text-sm">
                      {channelIcons[session.channel] || "💬"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Agent: {agentName}</span>
                  </div>
                </div>

                {/* Duration & Type */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                    <Clock className="h-3 w-3" />
                    {duration}
                  </div>
                  {isCall ? (
                    <Phone className="h-4 w-4 text-gold" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-navy" />
                  )}
                </div>

                {/* Status */}
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-medium",
                    statusConfig[session.status as keyof typeof statusConfig]
                      ?.className || statusConfig.active.className,
                  )}
                >
                  {statusConfig[session.status as keyof typeof statusConfig]
                    ?.label || "Active"}
                </Badge>

                {/* Actions */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
