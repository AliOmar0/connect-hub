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

interface Employee {
  id: string;
  name: string;
  role: string;
  status: "online" | "busy" | "away" | "offline";
  activeSessions: number;
  todayHandled: number;
  avgResponseTime: string;
  rating: number;
}

const employees: Employee[] = [
  {
    id: "1",
    name: "Mohammed Ali",
    role: "Senior Agent",
    status: "online",
    activeSessions: 2,
    todayHandled: 24,
    avgResponseTime: "1.2m",
    rating: 4.8,
  },
  {
    id: "2",
    name: "Sara Ibrahim",
    role: "Agent",
    status: "busy",
    activeSessions: 3,
    todayHandled: 18,
    avgResponseTime: "2.1m",
    rating: 4.6,
  },
  {
    id: "3",
    name: "Omar Yousef",
    role: "Agent",
    status: "online",
    activeSessions: 1,
    todayHandled: 15,
    avgResponseTime: "1.8m",
    rating: 4.7,
  },
  {
    id: "4",
    name: "Rania Ahmed",
    role: "Team Lead",
    status: "away",
    activeSessions: 0,
    todayHandled: 12,
    avgResponseTime: "1.5m",
    rating: 4.9,
  },
  {
    id: "5",
    name: "Khalid Hassan",
    role: "Agent",
    status: "offline",
    activeSessions: 0,
    todayHandled: 0,
    avgResponseTime: "-",
    rating: 4.5,
  },
];

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

export default function EmployeesTable() {
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
            {employees.map((employee, index) => (
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
                          {employee.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card",
                          statusConfig[employee.status].dotClass
                        )}
                      />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{employee.name}</p>
                      <p className="text-xs text-muted-foreground">{employee.role}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] font-medium bg-opacity-10",
                      `bg-${statusConfig[employee.status].className.split(" ")[0].replace("bg-", "")}/10`,
                      statusConfig[employee.status].className.split(" ")[1]
                    )}
                  >
                    {statusConfig[employee.status].label}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <span className={cn(
                    "font-semibold",
                    employee.activeSessions > 0 ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {employee.activeSessions}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="font-medium">{employee.todayHandled}</span>
                </TableCell>
                <TableCell className="text-center">
                  <span className={cn(
                    "text-sm",
                    employee.avgResponseTime !== "-" ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {employee.avgResponseTime}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Star className="h-3.5 w-3.5 text-gold fill-gold" />
                    <span className="font-medium text-sm">{employee.rating}</span>
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
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
