import { Call, Customer, Employee } from "@/types/database";
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
import {
  PhoneIncoming,
  PhoneOutgoing,
  Play,
  MoreVertical,
  PhoneMissed,
} from "lucide-react";
import { format, formatDuration, intervalToDuration } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CallsTableProps {
  calls: (Call & { customer?: Customer; employee?: Employee })[];
  loading?: boolean;
}

const statusColors: Record<string, string> = {
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
  missed: "bg-red-500/10 text-red-600 border-red-500/20",
  "in-progress": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  initiated: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
};

function formatCallDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  return formatDuration(duration, {
    format: ["hours", "minutes", "seconds"],
    delimiter: ":",
  })
    .replace(/ hours?/, "h")
    .replace(/ minutes?/, "m")
    .replace(/ seconds?/, "s");
}

export default function CallsTable({ calls, loading }: CallsTableProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Direction</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(8)].map((_, j) => (
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
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="font-semibold">Direction</TableHead>
            <TableHead className="font-semibold">Customer</TableHead>
            <TableHead className="font-semibold">Phone</TableHead>
            <TableHead className="font-semibold">Agent</TableHead>
            <TableHead className="font-semibold">Duration</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold">Time</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calls.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="h-32 text-center text-muted-foreground"
              >
                No calls found
              </TableCell>
            </TableRow>
          ) : (
            calls.map((call) => (
              <TableRow
                key={call.id}
                className="hover:bg-muted/30 transition-colors"
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    {call.status === "missed" ? (
                      <PhoneMissed className="h-4 w-4 text-destructive" />
                    ) : call.direction === "inbound" ? (
                      <PhoneIncoming className="h-4 w-4 text-green-500" />
                    ) : (
                      <PhoneOutgoing className="h-4 w-4 text-blue-500" />
                    )}
                    <span className="text-sm capitalize">{call.direction}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {call.customer?.name?.charAt(0) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">
                      {call.customer?.name || "Unknown"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {call.phone_number || "-"}
                </TableCell>
                <TableCell>
                  {call.employee?.profile ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px] bg-accent">
                          {call.employee.profile.first_name?.charAt(0)}
                          {call.employee.profile.last_name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">
                        {call.employee.profile.first_name}{" "}
                        {call.employee.profile.last_name}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Unassigned
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm font-mono">
                  {formatCallDuration(call.duration_seconds)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={statusColors[call.status] || "bg-muted"}
                  >
                    {call.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(call.started_at), "MMM d, HH:mm")}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {call.recording_url && (
                        <DropdownMenuItem>
                          <Play className="h-4 w-4 mr-2" />
                          Play Recording
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem>View Details</DropdownMenuItem>
                      <DropdownMenuItem>Call Back</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
