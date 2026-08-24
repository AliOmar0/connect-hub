import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Circle,
  CircleDot,
  Clock,
  MessageSquare,
  MinusCircle,
  MoreHorizontal,
  Phone,
  Star,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Employee, Profile } from "@/types/database";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay } from "date-fns";

interface EmployeesTableProps {
  employees?: Array<Employee & { profile?: Profile }>;
}

// Presence pairs a token-backed colour with BOTH a shape (icon) and a text
// label, so meaning never rests on colour alone (Requirement 3.5). The previous
// config used raw `emerald/rose/amber/slate` hues -- bypassing the `--status-*`
// tokens entirely -- and rendered a colour-only dot with no icon or label.
const presenceConfig: Record<
  string,
  { tone: StatusTone; icon: typeof CircleDot; labelKey: string; dot: string }
> = {
  online: {
    tone: "success",
    icon: CircleDot,
    labelKey: "employees.presence.online",
    dot: "bg-status-success",
  },
  busy: {
    tone: "error",
    icon: MinusCircle,
    labelKey: "employees.presence.busy",
    dot: "bg-status-error",
  },
  away: {
    tone: "warning",
    icon: Clock,
    labelKey: "employees.presence.away",
    dot: "bg-status-warning",
  },
  offline: {
    tone: "neutral",
    icon: Circle,
    labelKey: "employees.presence.offline",
    dot: "bg-status-neutral",
  },
};

export default function EmployeesTable({
  employees = [],
}: EmployeesTableProps) {
  const { t } = useTranslation();
  const { data: employeeStats } = useQuery({
    queryKey: ["employee-stats", employees.map((e) => e.id)],
    queryFn: async () => {
      const today = startOfDay(new Date());
      const stats: Record<
        string,
        { activeSessions: number; todayHandled: number }
      > = {};

      for (const emp of employees) {
        const { count: activeSessions } = await supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("employee_id", emp.id)
          .eq("status", "active");

        const { count: todayHandled } = await supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("employee_id", emp.id)
          .gte("started_at", today.toISOString());

        stats[emp.id] = {
          activeSessions: activeSessions || 0,
          todayHandled: todayHandled || 0,
        };
      }

      return stats;
    },
    enabled: employees.length > 0,
  });

  const displayEmployees = employees.slice(0, 5);

  return (
    <Card className="shadow-card col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg font-semibold">
            Team Overview
          </CardTitle>
          <Button variant="outline" size="sm">
            Manage Team
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="text-center">Handled</TableHead>
              <TableHead className="text-center">Avg. Response</TableHead>
              <TableHead className="text-center">Rating</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayEmployees.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  No employees found
                </TableCell>
              </TableRow>
            ) : (
              displayEmployees.map((employee, index) => {
                const profile = employee.profile;
                const name = profile
                  ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
                    "Unknown"
                  : "Unknown";
                const initials =
                  name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase() || "?";
                const status = profile?.status || "offline";
                const stats = employeeStats?.[employee.id] || {
                  activeSessions: 0,
                  todayHandled: 0,
                };
                const rating = employee.performance_score || 0;

                return (
                  <TableRow
                    key={employee.id}
                    className="fade-in-up"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-navy/10 text-navy font-semibold text-xs">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            aria-hidden="true"
                            className={cn(
                              "absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full border-2 border-card",
                              (presenceConfig[status] ?? presenceConfig.offline)
                                .dot,
                            )}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{name}</p>
                          <p className="text-xs text-muted-foreground">
                            {employee.department || "Agent"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        size="sm"
                        tone={
                          (presenceConfig[status] ?? presenceConfig.offline)
                            .tone
                        }
                        icon={
                          (presenceConfig[status] ?? presenceConfig.offline)
                            .icon
                        }
                        label={t(
                          (presenceConfig[status] ?? presenceConfig.offline)
                            .labelKey,
                        )}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          "font-semibold",
                          stats.activeSessions > 0
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {stats.activeSessions}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-medium">{stats.todayHandled}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm text-muted-foreground">-</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Star className="h-3.5 w-3.5 text-gold fill-gold" />
                        <span className="font-medium text-sm">
                          {rating.toFixed(1)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>View Profile</DropdownMenuItem>
                          <DropdownMenuItem>View Sessions</DropdownMenuItem>
                          <DropdownMenuItem>Assign Task</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
