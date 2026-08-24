import { Employee, Profile, ChannelType } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  MessageCircle,
  MessageSquare,
  Phone,
  Mail,
  MoreVertical,
  Clock,
  Star,
  Edit,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { touchTargetClass } from "@/lib/touch-target";
import { useTranslation } from "react-i18next";

interface EmployeeCardProps {
  employee: Employee & { profile?: Profile };
  onEdit?: (employee: Employee) => void;
  onDelete?: (employee: Employee) => void;
}

const channelIcons: Record<ChannelType, React.ElementType> = {
  whatsapp: MessageCircle,
  messenger: MessageSquare,
  sms: MessageSquare,
  voice: Phone,
  email: Mail,
};

// Channel accents reference semantic status/chart design tokens rather than
// literal Tailwind hues so styling stays consistent with the token system
// (Requirement 18.1). The channel name text alongside each icon is the
// non-color cue.
const channelColors: Record<ChannelType, string> = {
  whatsapp: "bg-status-success/10 text-status-success",
  messenger: "bg-status-info/10 text-status-info-foreground",
  sms: "bg-chart-secondary/10 text-chart-secondary",
  voice: "bg-status-warning/10 text-status-warning-foreground",
  email: "bg-status-error/10 text-status-error",
};

// Presence status dot color, paired with the textual status shown on the card
// so meaning never depends on color alone (Property 2 / Requirement 18.5).
const statusDotColors: Record<string, string> = {
  online: "bg-status-success",
  busy: "bg-status-warning",
  away: "bg-status-info",
};

export default function EmployeeCard({
  employee,
  onEdit,
  onDelete,
}: EmployeeCardProps) {
  const { t } = useTranslation();
  const profile = employee.profile;
  const fullName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
    : t("employees.card.unknownName");

  const performancePercent = (employee.performance_score || 0) * 100;

  return (
    // One wide row, not a tall card: avatar and identity lead, then the facts
    // that differ between people (shift, channels, performance, presence), then
    // the row's actions. Everything wraps rather than truncating on a phone.
    <Card className="overflow-hidden border-border shadow-card transition-shadow hover:shadow-elevated">
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-4 p-4">
        {/* Identity */}
        <div className="flex min-w-[15rem] flex-1 items-center gap-3">
          <div className="relative shrink-0">
            <Avatar className="h-11 w-11 ring-2 ring-background">
              {profile?.avatar_url ? (
                <AvatarImage src={profile.avatar_url} alt={fullName} />
              ) : null}
              <AvatarFallback className="bg-primary/10 font-display font-bold text-primary">
                {profile?.first_name?.charAt(0) || "?"}
                {profile?.last_name?.charAt(0) || ""}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                // Logical inset so the presence dot stays on the avatar's
                // outer corner under RTL instead of jumping across it.
                "absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full border-2 border-background",
                statusDotColors[profile?.status ?? ""] ?? "bg-muted-foreground",
              )}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-body-sm font-semibold">{fullName}</h3>
            <p className="truncate text-caption text-muted-foreground">
              {employee.employee_code || t("employees.card.noCode")} ·{" "}
              {employee.department || t("employees.card.noDepartment")}
            </p>
          </div>
        </div>

        {/* Shift */}
        <div className="flex items-center gap-2 text-body-sm">
          <Clock
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="tabular-nums text-muted-foreground">
            {employee.shift_start && employee.shift_end
              ? `${employee.shift_start.slice(0, 5)} – ${employee.shift_end.slice(0, 5)}`
              : t("employees.card.noShift")}
          </span>
        </div>

        {/* Channels */}
        <div className="flex flex-wrap items-center gap-1.5">
          {employee.assigned_channels?.map((channel) => {
            const Icon = channelIcons[channel];
            return (
              <span
                key={channel}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-1 text-overline",
                  channelColors[channel],
                )}
              >
                <Icon className="h-3 w-3" aria-hidden="true" />
                {t(`sessions.channels.${channel}`, { defaultValue: channel })}
              </span>
            );
          })}
          {(!employee.assigned_channels ||
            employee.assigned_channels.length === 0) && (
            <span className="text-caption text-muted-foreground">
              {t("employees.card.noChannels")}
            </span>
          )}
        </div>

        {/* Performance */}
        <div className="flex w-32 shrink-0 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-overline uppercase text-muted-foreground">
              {t("employees.card.performance")}
            </span>
            <span className="text-body-sm font-bold tabular-nums text-foreground">
              {performancePercent.toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
              style={{ width: `${performancePercent}%` }}
            />
          </div>
        </div>

        {/* Presence and languages */}
        <div className="flex shrink-0 flex-col items-start gap-1">
          <Badge variant={employee.is_active ? "default" : "secondary"}>
            {employee.is_active
              ? t("employees.card.active")
              : t("employees.card.inactive")}
          </Badge>
          <span className="text-overline text-muted-foreground">
            {t(`employees.presence.${profile?.status || "offline"}`, {
              defaultValue: profile?.status || "offline",
            })}
            {profile?.languages && profile.languages.length > 0
              ? ` · ${profile.languages.join(", ")}`
              : ""}
          </span>
        </div>

        {/* Row actions. Always visible -- the menu used to be `opacity-0`
            until the card was hovered, which meant it did not exist at all on
            a touch device. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("employees.card.actions", { name: fullName })}
              className={touchTargetClass("extend", "h-11 w-11 shrink-0")}
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit?.(employee)}>
              <Edit className="h-4 w-4 me-2" aria-hidden="true" />
              {t("employees.card.edit")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete?.(employee)}
            >
              <Trash2 className="h-4 w-4 me-2" aria-hidden="true" />
              {t("employees.card.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  );
}
