import {
  Session,
  Customer,
  Employee,
  ChannelType,
  SessionMainType,
} from "@/types/database";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  MessageCircle,
  MessageSquare,
  Phone,
  Mail,
  Star,
  MoreVertical,
  Clock,
  ArrowUpRight,
  Users,
  CircleDot,
  Hourglass,
  CheckCircle2,
  AlertTriangle,
  TimerOff,
  XCircle,
  Bot,
} from "lucide-react";
import {
  format,
  formatDistanceToNow,
  intervalToDuration,
  formatDuration,
} from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { BidiText } from "@/components/ui/bidi-text";

interface SessionsTableProps {
  sessions: (Session & { customer?: Customer; employee?: Employee })[];
  sessionTypes?: SessionMainType[];
  loading?: boolean;
  onViewSession?: (session: Session) => void;
  onAssignAgent?: (session: Session) => void;
}

const channelIcons: Record<ChannelType, React.ElementType> = {
  whatsapp: MessageCircle,
  messenger: MessageSquare,
  sms: MessageSquare,
  voice: Phone,
  email: Mail,
};

const statusStyles: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-status-success/10", text: "text-status-success" },
  waiting: { bg: "bg-status-warning/10", text: "text-status-warning" },
  completed: { bg: "bg-status-info/10", text: "text-status-info" },
  escalated: { bg: "bg-status-error/10", text: "text-status-error" },
  // Deliberately NOT completed's info blue: an escalation that timed out was
  // never resolved, and the whole point of the separate status is that it
  // should not look like one that was.
  auto_closed: { bg: "bg-status-neutral/10", text: "text-status-neutral" },
  missed: { bg: "bg-status-neutral/10", text: "text-status-neutral" },
};

// Non-color cue for session status (Requirement 3.5): each status pairs its
// color with a lucide icon (shape) in addition to the translated text label.
const statusIcons: Record<string, React.ElementType> = {
  active: CircleDot,
  waiting: Hourglass,
  completed: CheckCircle2,
  escalated: AlertTriangle,
  auto_closed: TimerOff,
  missed: XCircle,
};

function formatSessionDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  return (
    formatDuration(duration, { format: ["hours", "minutes"], delimiter: " " })
      .replace(/ hours?/, "h")
      .replace(/ minutes?/, "m") || "< 1m"
  );
}

export default function SessionsTable({
  sessions,
  sessionTypes,
  loading,
  onViewSession,
  onAssignAgent,
}: SessionsTableProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("sessions.table.channel")}</TableHead>
              <TableHead>{t("sessions.table.customer")}</TableHead>
              <TableHead>{t("sessions.table.agent")}</TableHead>
              <TableHead>{t("sessions.table.type")}</TableHead>
              <TableHead>{t("sessions.table.status")}</TableHead>
              <TableHead>{t("sessions.table.waitTime")}</TableHead>
              <TableHead>{t("sessions.table.duration")}</TableHead>
              <TableHead>{t("sessions.table.satisfaction")}</TableHead>
              <TableHead>{t("sessions.table.started")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(10)].map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-4 bg-muted animate-pulse rounded" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="font-semibold">
              {t("sessions.table.channel")}
            </TableHead>
            <TableHead className="font-semibold">
              {t("sessions.table.customer")}
            </TableHead>
            <TableHead className="font-semibold">
              {t("sessions.table.agent")}
            </TableHead>
            <TableHead className="font-semibold">
              {t("sessions.table.type")}
            </TableHead>
            <TableHead className="font-semibold">
              {t("sessions.table.status")}
            </TableHead>
            <TableHead className="font-semibold">
              {t("sessions.table.waitTime")}
            </TableHead>
            <TableHead className="font-semibold">
              {t("sessions.table.duration")}
            </TableHead>
            <TableHead className="font-semibold">
              {t("sessions.table.satisfaction")}
            </TableHead>
            <TableHead className="font-semibold">
              {t("sessions.table.started")}
            </TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={10}
                className="h-32 text-center text-muted-foreground"
              >
                {t("sessions.table.empty")}
              </TableCell>
            </TableRow>
          ) : (
            sessions.map((session) => {
              const ChannelIcon =
                channelIcons[session.channel] || MessageSquare;
              if (!channelIcons[session.channel]) {
                console.warn(
                  `Unknown channel type: ${session.channel}`,
                  session,
                );
              }
              const style =
                statusStyles[session.status] || statusStyles.waiting;

              return (
                <TableRow
                  key={session.id}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => onViewSession?.(session)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "p-1.5 rounded-lg",
                          session.channel === "whatsapp" &&
                            "bg-chart-success/10",
                          session.channel === "messenger" && "bg-chart-info/10",
                          session.channel === "sms" && "bg-chart-secondary/10",
                          session.channel === "voice" && "bg-chart-warning/10",
                          session.channel === "email" && "bg-chart-primary/10",
                          !channelIcons[session.channel] &&
                            "bg-status-neutral/10",
                        )}
                      >
                        <ChannelIcon
                          className={cn(
                            "h-4 w-4",
                            session.channel === "whatsapp" &&
                              "text-chart-success",
                            session.channel === "messenger" &&
                              "text-chart-info",
                            session.channel === "sms" && "text-chart-secondary",
                            session.channel === "voice" && "text-chart-warning",
                            session.channel === "email" && "text-chart-primary",
                          )}
                        />
                      </div>
                      <span className="text-sm capitalize">
                        {t(`sessions.channels.${session.channel}`, {
                          defaultValue: session.channel,
                        })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {session.customer?.name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {session.customer?.name ||
                            t("sessions.table.unknown")}
                        </span>
                        {session.customer?.phone ? (
                          <BidiText
                            value={session.customer.phone}
                            className="text-xs text-muted-foreground"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {session.employee?.profile ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] bg-accent">
                            {session.employee.profile.first_name?.charAt(0)}
                            {session.employee.profile.last_name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">
                          {session.employee.profile.first_name}
                        </span>
                      </div>
                    ) : session.status === "escalated" ||
                      session.status === "waiting" ? (
                      <span className="text-sm text-muted-foreground">
                        {t("sessions.table.unassigned")}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6 border border-primary/30 bg-primary/10">
                          <AvatarFallback className="text-[10px] text-primary font-bold flex items-center justify-center">
                            <Bot className="h-3.5 w-3.5" />
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-primary">
                          {t("sessions.table.aiAgent")}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {session.main_type_id && sessionTypes ? (
                      (() => {
                        const matchedType = sessionTypes.find(
                          (t) => t.id === session.main_type_id,
                        );
                        return matchedType ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge
                              variant="outline"
                              className="bg-status-info/10 text-status-info border-status-info/20 text-xs"
                            >
                              {matchedType.name}
                            </Badge>
                            {matchedType.parent_category && (
                              <span className="text-[10px] text-muted-foreground pl-1">
                                {matchedType.parent_category}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        );
                      })()
                    ) : (
                      // Distinct from the "-" a failed type lookup gives: this
                      // session simply has no type yet.
                      <Badge
                        variant="outline"
                        className="border-dashed text-xs text-muted-foreground"
                      >
                        {t("sessions.table.untyped")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const StatusIcon =
                        statusIcons[session.status] ?? CircleDot;
                      return (
                        <Badge
                          variant="outline"
                          className={cn(
                            style.bg,
                            style.text,
                            "border-transparent gap-1",
                          )}
                        >
                          <StatusIcon className="h-3 w-3" aria-hidden="true" />
                          {t(`sessions.status.${session.status}`, {
                            defaultValue: session.status,
                          })}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {session.wait_time_seconds ? (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">
                          {session.wait_time_seconds}s
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {formatSessionDuration(session.duration_seconds)}
                  </TableCell>
                  <TableCell>
                    {session.satisfaction_score ? (
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              "h-3.5 w-3.5",
                              i < session.satisfaction_score!
                                ? "text-accent fill-accent"
                                : "text-muted-foreground/30",
                            )}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(session.started_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => onViewSession?.(session)}
                        >
                          <ArrowUpRight className="h-4 w-4 mr-2" />
                          {t("sessions.viewConversation")}
                        </DropdownMenuItem>
                        {onAssignAgent && (
                          <DropdownMenuItem
                            onClick={() => onAssignAgent(session)}
                          >
                            <Users className="h-4 w-4 mr-2" />
                            {t("sessions.assign.title")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
