import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MoreHorizontal, Star } from "lucide-react";
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
import { useNavigate } from "react-router-dom";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import type { ViewStatus } from "@/types/presentation";

interface EmployeesTableProps {
  employees?: Array<Employee & { profile?: Profile }>;
}

const statusConfig = {
  online: {
    label: "Online",
    className: "border-chart-success/30 bg-chart-success/10 text-chart-success",
    dotClass: "bg-chart-success pulse-green",
  },
  busy: {
    label: "Busy",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    dotClass: "bg-destructive",
  },
  away: {
    label: "Away",
    className: "border-chart-warning/30 bg-chart-warning/10 text-chart-warning",
    dotClass: "bg-chart-warning",
  },
  offline: {
    label: "Offline",
    className: "border-border bg-muted text-muted-foreground",
    dotClass: "bg-muted-foreground",
  },
};

export default function EmployeesTable({
  employees = [],
}: EmployeesTableProps) {
  const navigate = useNavigate();
  const {
    data: employeeStats,
    isLoading: employeeStatsLoading,
    isError: employeeStatsError,
    refetch: refetchEmployeeStats,
  } = useQuery({
    queryKey: ["employee-stats", employees.map((employee) => employee.id)],
    queryFn: async () => {
      const today = startOfDay(new Date());
      const entries = await Promise.all(
        employees.map(async (employee) => {
          const [activeResult, handledResult] = await Promise.all([
            supabase
              .from("sessions")
              .select("*", { count: "exact", head: true })
              .eq("employee_id", employee.id)
              .eq("status", "active"),
            supabase
              .from("sessions")
              .select("*", { count: "exact", head: true })
              .eq("employee_id", employee.id)
              .gte("started_at", today.toISOString()),
          ]);

          if (activeResult.error) throw activeResult.error;
          if (handledResult.error) throw handledResult.error;

          return [
            employee.id,
            {
              activeSessions: activeResult.count ?? 0,
              todayHandled: handledResult.count ?? 0,
            },
          ] as const;
        }),
      );

      return Object.fromEntries(entries) as Record<
        string,
        { activeSessions: number; todayHandled: number }
      >;
    },
    enabled: employees.length > 0,
  });

  const displayEmployees = employees.slice(0, 5);
  const statsStatus: ViewStatus =
    employees.length === 0
      ? "loaded"
      : employeeStatsLoading
        ? "loading"
        : employeeStatsError
          ? "error"
          : "loaded";

  return (
    <Card className="shadow-card col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg font-semibold">
            Team Overview
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/employees")}
          >
            Manage Team
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <AsyncBoundary
          status={statsStatus}
          skeleton={<Skeleton className="h-[280px] w-full rounded-lg" />}
          onRetry={() => refetchEmployeeStats()}
          errorTitle="Team metrics unavailable"
          errorDescription="We couldn't load today's employee activity. Try again."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-center">Handled</TableHead>
                <TableHead className="text-center">Avg. Response</TableHead>
                <TableHead className="text-center">Rating</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
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
                              className={cn(
                                "absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-card",
                                statusConfig[
                                  status as keyof typeof statusConfig
                                ]?.dotClass || statusConfig.offline.dotClass,
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
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] font-medium",
                            statusConfig[status as keyof typeof statusConfig]
                              ?.className || statusConfig.offline.className,
                          )}
                        >
                          {statusConfig[status as keyof typeof statusConfig]
                            ?.label || "Offline"}
                        </Badge>
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
                        <span className="font-medium">
                          {stats.todayHandled}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-muted-foreground">-</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Star
                            className="h-3.5 w-3.5 fill-gold text-gold"
                            aria-hidden="true"
                          />
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
                              aria-label={`Actions for ${name}`}
                            >
                              <MoreHorizontal
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => navigate("/employees")}
                            >
                              Manage Employee
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => navigate("/sessions")}
                            >
                              View Sessions
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </AsyncBoundary>
      </CardContent>
    </Card>
  );
}
