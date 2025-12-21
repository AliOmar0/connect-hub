import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, MessageSquare, MoreVertical, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Session {
  id: string;
  customerName: string;
  type: "call" | "message";
  channel: "whatsapp" | "messenger" | "phone";
  agent: string;
  duration: string;
  status: "active" | "on-hold" | "transferring";
}

const sessions: Session[] = [
  {
    id: "1",
    customerName: "Fatima Hassan",
    type: "call",
    channel: "phone",
    agent: "Mohammed Ali",
    duration: "12:34",
    status: "active",
  },
  {
    id: "2",
    customerName: "Ahmad Khalil",
    type: "message",
    channel: "whatsapp",
    agent: "Sara Ibrahim",
    duration: "05:22",
    status: "active",
  },
  {
    id: "3",
    customerName: "Noor Saleh",
    type: "message",
    channel: "messenger",
    agent: "Omar Yousef",
    duration: "08:15",
    status: "on-hold",
  },
  {
    id: "4",
    customerName: "Layla Mahmoud",
    type: "call",
    channel: "phone",
    agent: "Rania Ahmed",
    duration: "03:47",
    status: "active",
  },
  {
    id: "5",
    customerName: "Karim Nasser",
    type: "message",
    channel: "whatsapp",
    agent: "Mohammed Ali",
    duration: "15:02",
    status: "transferring",
  },
];

const statusConfig = {
  active: {
    label: "Active",
    className: "bg-chart-success/10 text-chart-success border-chart-success/20",
  },
  "on-hold": {
    label: "On Hold",
    className: "bg-chart-warning/10 text-chart-warning border-chart-warning/20",
  },
  transferring: {
    label: "Transferring",
    className: "bg-chart-info/10 text-chart-info border-chart-info/20",
  },
};

const channelIcons = {
  whatsapp: "🟢",
  messenger: "🔵",
  phone: "📞",
};

export default function ActiveSessionsPanel() {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg font-semibold flex items-center gap-2">
            Active Sessions
            <Badge variant="secondary" className="bg-gold/10 text-gold border border-gold/20">
              {sessions.length} live
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sessions.map((session, index) => (
          <div
            key={session.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group fade-in-up"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Customer Avatar */}
            <Avatar className="h-10 w-10 border-2 border-border">
              <AvatarFallback className="bg-navy/10 text-navy font-semibold text-sm">
                {session.customerName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>

            {/* Session Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">
                  {session.customerName}
                </span>
                <span className="text-sm">{channelIcons[session.channel]}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Agent: {session.agent}</span>
              </div>
            </div>

            {/* Duration & Type */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                <Clock className="h-3 w-3" />
                {session.duration}
              </div>
              {session.type === "call" ? (
                <Phone className="h-4 w-4 text-gold" />
              ) : (
                <MessageSquare className="h-4 w-4 text-navy" />
              )}
            </div>

            {/* Status */}
            <Badge
              variant="outline"
              className={cn("text-[10px] font-medium", statusConfig[session.status].className)}
            >
              {statusConfig[session.status].label}
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
        ))}
      </CardContent>
    </Card>
  );
}
