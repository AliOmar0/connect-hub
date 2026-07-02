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
    : "Unknown";

  const performancePercent = (employee.performance_score || 0) * 100;

  return (
    <Card className="group hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 transition-all duration-500 border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-primary/0 group-hover:bg-primary/40 transition-all duration-500" />
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-12 w-12 ring-2 ring-background">
                {profile?.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} alt={fullName} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {profile?.first_name?.charAt(0) || "?"}
                  {profile?.last_name?.charAt(0) || ""}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background",
                  statusDotColors[profile?.status ?? ""] ??
                    "bg-muted-foreground",
                )}
                aria-hidden="true"
              />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{fullName}</h3>
              <p className="text-xs text-muted-foreground">
                {employee.employee_code || "No ID"} •{" "}
                {employee.department || "No Dept"}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("employees.card.actions", { name: fullName })}
                className={touchTargetClass(
                  "extend",
                  "h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                )}
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit?.(employee)}>
                <Edit className="h-4 w-4 mr-2" aria-hidden="true" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDelete?.(employee)}
              >
                <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Shift Info */}
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {employee.shift_start && employee.shift_end
              ? `${employee.shift_start.slice(0, 5)} - ${employee.shift_end.slice(0, 5)}`
              : "No shift assigned"}
          </span>
        </div>

        {/* Assigned Channels */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">Channels</p>
          <div className="flex flex-wrap gap-1.5">
            {employee.assigned_channels?.map((channel) => {
              const Icon = channelIcons[channel];
              return (
                <div
                  key={channel}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-full text-xs",
                    channelColors[channel],
                  )}
                >
                  <Icon className="h-3 w-3" />
                  <span className="capitalize">{channel}</span>
                </div>
              );
            })}
            {(!employee.assigned_channels ||
              employee.assigned_channels.length === 0) && (
              <span className="text-xs text-muted-foreground">No channels</span>
            )}
          </div>
        </div>

        {/* Languages */}
        {profile?.languages && profile.languages.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Languages</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.languages.map((lang) => (
                <Badge key={lang} variant="secondary" className="text-xs">
                  {lang}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Performance Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Overall Performance
            </p>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/5 border border-primary/10">
              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
              <span className="text-xs font-bold text-primary">
                {performancePercent.toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="relative h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-1000 ease-out rounded-full"
              style={{ width: `${performancePercent}%` }}
            />
          </div>
        </div>

        {/* Status Badge */}
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <Badge variant={employee.is_active ? "default" : "secondary"}>
            {employee.is_active ? "Active" : "Inactive"}
          </Badge>
          <span className="text-xs text-muted-foreground capitalize">
            {profile?.status || "offline"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
