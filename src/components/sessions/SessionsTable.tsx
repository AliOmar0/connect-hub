import { Session, Customer, Employee, ChannelType } from '@/types/database';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { 
  MessageCircle, 
  MessageSquare, 
  Phone, 
  Mail,
  Star,
  MoreVertical,
  Clock,
  ArrowUpRight
} from 'lucide-react';
import { format, formatDistanceToNow, intervalToDuration, formatDuration } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface SessionsTableProps {
  sessions: (Session & { customer?: Customer; employee?: Employee })[];
  loading?: boolean;
  onViewSession?: (session: Session) => void;
}

const channelIcons: Record<ChannelType, React.ElementType> = {
  whatsapp: MessageCircle,
  messenger: MessageSquare,
  sms: MessageSquare,
  voice: Phone,
  email: Mail,
};

const statusStyles: Record<string, { bg: string; text: string }> = {
  active: { bg: 'bg-green-500/10', text: 'text-green-600' },
  waiting: { bg: 'bg-yellow-500/10', text: 'text-yellow-600' },
  completed: { bg: 'bg-blue-500/10', text: 'text-blue-600' },
  escalated: { bg: 'bg-orange-500/10', text: 'text-orange-600' },
  missed: { bg: 'bg-red-500/10', text: 'text-red-600' },
};

function formatSessionDuration(seconds: number | null): string {
  if (!seconds) return '-';
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  return formatDuration(duration, { format: ['hours', 'minutes'], delimiter: ' ' })
    .replace(/ hours?/, 'h')
    .replace(/ minutes?/, 'm') || '< 1m';
}

export default function SessionsTable({ sessions, loading, onViewSession }: SessionsTableProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Wait Time</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Satisfaction</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(9)].map((_, j) => (
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
            <TableHead className="font-semibold">Channel</TableHead>
            <TableHead className="font-semibold">Customer</TableHead>
            <TableHead className="font-semibold">Agent</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold">Wait Time</TableHead>
            <TableHead className="font-semibold">Duration</TableHead>
            <TableHead className="font-semibold">Satisfaction</TableHead>
            <TableHead className="font-semibold">Started</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                No sessions found
              </TableCell>
            </TableRow>
          ) : (
            sessions.map((session) => {
              const ChannelIcon = channelIcons[session.channel];
              const style = statusStyles[session.status] || statusStyles.waiting;
              
              return (
                <TableRow 
                  key={session.id} 
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => onViewSession?.(session)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "p-1.5 rounded-lg",
                        session.channel === 'whatsapp' && 'bg-green-500/10',
                        session.channel === 'messenger' && 'bg-blue-500/10',
                        session.channel === 'sms' && 'bg-purple-500/10',
                        session.channel === 'voice' && 'bg-orange-500/10',
                        session.channel === 'email' && 'bg-red-500/10',
                      )}>
                        <ChannelIcon className={cn(
                          "h-4 w-4",
                          session.channel === 'whatsapp' && 'text-green-600',
                          session.channel === 'messenger' && 'text-blue-600',
                          session.channel === 'sms' && 'text-purple-600',
                          session.channel === 'voice' && 'text-orange-600',
                          session.channel === 'email' && 'text-red-600',
                        )} />
                      </div>
                      <span className="text-sm capitalize">{session.channel}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {session.customer?.name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {session.customer?.name || 'Unknown'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {session.customer?.phone || '-'}
                        </span>
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
                    ) : (
                      <span className="text-sm text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline"
                      className={cn(style.bg, style.text, 'border-transparent')}
                    >
                      {session.status}
                    </Badge>
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
                                : "text-muted-foreground/30"
                            )}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(session.started_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <ArrowUpRight className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem>Assign Agent</DropdownMenuItem>
                        <DropdownMenuItem>Add Notes</DropdownMenuItem>
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
