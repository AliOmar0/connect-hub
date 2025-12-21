import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MoreHorizontal, Phone, MessageSquare, Star } from "lucide-react";
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

const statusConfig = {
  online: {
    label: "Online",
    className: "bg-chart-success text-chart-success",
    dotClass: "bg-chart-success pulse-green",
  },
  busy: {
    label: "Busy",
    className: "bg-destructive text-destructive",
    dotClass: "bg-destructive",
  },
  away: {
    label: "Away",
    className: "bg-chart-warning text-chart-warning",
    dotClass: "bg-chart-warning",
  },
  offline: {
    label: "Offline",
    className: "bg-muted-foreground text-muted-foreground",
    dotClass: "bg-muted-foreground",
  },
};

export default function EmployeesTable({ employees = [] }: EmployeesTableProps) {
  const { data: employeeStats } = useQuery({
    queryKey: ["employee-stats", employees.map(e => e.id)],
    queryFn: async () => {
      const today = startOfDay(new Date());
      const stats: Record<string, { activeSessions: number; todayHandled: number }> = {};

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
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No employees found
                </TableCell>
              </TableRow>
            ) : (
              displayEmployees.map((employee, index) => {
                const profile = employee.profile;
                const name = profile
                  ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown"
                  : "Unknown";
                const initials = name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase() || "?";
                const status = profile?.status || "offline";
                const stats = employeeStats?.[employee.id] || { activeSessions: 0, todayHandled: 0 };
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
                              "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card",
                              statusConfig[status as keyof typeof statusConfig]?.dotClass || statusConfig.offline.dotClass
                            )}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{name}</p>
                          <p className="text-xs text-muted-foreground">{employee.department || "Agent"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] font-medium",
                          statusConfig[status as keyof typeof statusConfig]?.className || statusConfig.offline.className
                        )}
                      >
                        {statusConfig[status as keyof typeof statusConfig]?.label || "Offline"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-semibold",
                        stats.activeSessions > 0 ? "text-foreground" : "text-muted-foreground"
                      )}>
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
                        <span className="font-medium text-sm">{rating.toFixed(1)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
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
