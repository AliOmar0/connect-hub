import { Bell, Search, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export default function DashboardHeader() {
  return (
    <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between gap-4">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search conversations, employees..."
            className="pl-10 bg-secondary/50 border-0 focus-visible:ring-1"
          />
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Integration Status */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-chart-success pulse-green" />
            <span className="text-xs font-medium text-muted-foreground">WhatsApp</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-chart-success pulse-green" />
            <span className="text-xs font-medium text-muted-foreground">Messenger</span>
          </div>
        </div>

        {/* Quick Actions */}
        <Button variant="outline" size="icon" className="relative">
          <MessageSquare className="h-4 w-4" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-gold text-navy-dark text-[10px] font-bold rounded-full flex items-center justify-center">
            3
          </span>
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                8
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              <Badge variant="secondary">8 new</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto">
              <DropdownMenuItem className="flex flex-col items-start gap-1 py-3 cursor-pointer">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gold" />
                  <span className="font-medium text-sm">New WhatsApp message</span>
                </div>
                <span className="text-xs text-muted-foreground pl-4">
                  Customer inquiry about loan services
                </span>
                <span className="text-xs text-muted-foreground pl-4">2 min ago</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex flex-col items-start gap-1 py-3 cursor-pointer">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-chart-info" />
                  <span className="font-medium text-sm">Call ended</span>
                </div>
                <span className="text-xs text-muted-foreground pl-4">
                  Duration: 12:34 with Fatima Hassan
                </span>
                <span className="text-xs text-muted-foreground pl-4">5 min ago</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex flex-col items-start gap-1 py-3 cursor-pointer">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-chart-success" />
                  <span className="font-medium text-sm">Session transferred</span>
                </div>
                <span className="text-xs text-muted-foreground pl-4">
                  Assigned to Mohammed Ali
                </span>
                <span className="text-xs text-muted-foreground pl-4">10 min ago</span>
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-center justify-center text-sm text-primary font-medium">
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Time display */}
        <div className="hidden lg:flex flex-col items-end text-right px-3">
          <span className="text-sm font-semibold font-display">
            {new Date().toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </header>
  );
}
