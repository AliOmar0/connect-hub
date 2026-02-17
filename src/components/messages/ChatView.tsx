import { useState, useRef, useEffect } from "react";
import {
  Message,
  Session,
  Customer,
  ChannelType,
  SessionMainType,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  Paperclip,
  Phone,
  Video,
  MoreVertical,
  CheckCheck,
  Check,
  CheckCircle,
  MessageCircle,
  MessageSquare,
  Mail,
  Tag,
  Clock,
  Star,
  Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, intervalToDuration, formatDuration } from "date-fns";

function formatSessionDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  return (
    formatDuration(duration, { format: ["hours", "minutes"], delimiter: " " })
      .replace(/ hours?/, "h")
      .replace(/ minutes?/, "m") || "< 1m"
  );
}

interface ChatViewProps {
  session: (Session & { customer?: Customer }) | null;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onJoinSession?: () => void;
  onUpdateType?: (typeId: string) => void;
  onUpdateStatus?: (status: string) => void;
  sessionTypes?: SessionMainType[];
  loading?: boolean;
}

const channelLabels: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  sms: "SMS",
  voice: "Voice",
  email: "Email",
};

const channelIcons: Record<ChannelType, React.ElementType> = {
  whatsapp: MessageCircle,
  messenger: MessageSquare,
  sms: MessageSquare,
  voice: Phone,
  email: Mail,
};

export default function ChatView({
  session,
  messages,
  onSendMessage,
  onJoinSession,
  onUpdateType,
  onUpdateStatus,
  sessionTypes,
  loading,
}: ChatViewProps) {
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim()) return;
    onSendMessage(newMessage);
    setNewMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 text-muted-foreground">
        <MessageSquare className="h-16 w-16 mb-4 opacity-30" />
        <h3 className="text-lg font-medium mb-1">No conversation selected</h3>
        <p className="text-sm">
          Choose a conversation from the list to start messaging
        </p>
      </div>
    );
  }

  const ChannelIcon = channelIcons[session.channel] || MessageSquare;
  if (!channelIcons[session.channel]) {
    console.warn(
      `ChatView: Unknown channel type for session ${session.id}:`,
      session.channel,
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary">
              {session.customer?.name?.charAt(0) || "?"}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-medium">
              {session.customer?.name || "Unknown"}
            </h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ChannelIcon className="h-3 w-3" />
              <span>
                {channelLabels[session.channel] || session.channel || "Unknown"}
              </span>
              <span>•</span>
              <span>{session.customer?.phone || "No phone"}</span>
            </div>
          </div>
        </div>

        {/* Actionable Metrics */}
        <div className="hidden lg:flex items-center gap-6 border-x border-border px-6 mx-6 h-10">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
              Wait Time
            </span>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-yellow-500" />
              <span className="text-sm font-medium">
                {session.wait_time_seconds
                  ? `${session.wait_time_seconds}s`
                  : "-"}
              </span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
              Duration
            </span>
            <div className="flex items-center gap-1.5">
              <Hourglass className="h-3 w-3 text-blue-500" />
              <span className="text-sm font-medium">
                {formatSessionDuration(session.duration_seconds)}
              </span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
              Satisfaction
            </span>
            <div className="flex items-center gap-1.5">
              {session.satisfaction_score ? (
                <>
                  <Star className="h-3 w-3 text-orange-500 fill-orange-500" />
                  <span className="text-sm font-medium">
                    {session.satisfaction_score}/5
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sessionTypes && onUpdateType && (
            <div className="flex items-center gap-1.5 mr-2">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              <Select
                value={session.main_type_id || "none"}
                onValueChange={(val) => onUpdateType(val === "none" ? "" : val)}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Set Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Type</SelectItem>
                  {sessionTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!session.employee_id && onJoinSession && (
            <Button
              variant="outline"
              size="sm"
              onClick={onJoinSession}
              className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20"
            >
              Join Conversation
            </Button>
          )}
          {session.status === "escalated" && onUpdateStatus && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onUpdateStatus("completed")}
              className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-500/20"
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              Complete Session
            </Button>
          )}
          <Badge
            variant={session.status === "active" ? "default" : "secondary"}
          >
            {session.status}
          </Badge>
          <Button variant="ghost" size="icon">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-6" ref={scrollRef}>
        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  i % 2 === 0 ? "justify-start" : "justify-end",
                )}
              >
                <div
                  className={cn(
                    "w-48 h-16 rounded-2xl animate-pulse",
                    i % 2 === 0 ? "bg-muted" : "bg-primary/20",
                  )}
                />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isOutbound = message.direction === "outbound";

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    isOutbound ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-2xl px-4 py-2.5",
                      isOutbound
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted rounded-bl-md",
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">
                      {message.content}
                    </p>
                    <div
                      className={cn(
                        "flex items-center justify-end gap-1 mt-1",
                        isOutbound
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      <span className="text-[10px]">
                        {format(new Date(message.sent_at), "HH:mm")}
                      </span>
                      {isOutbound &&
                        (message.read_at ? (
                          <CheckCheck className="h-3 w-3" />
                        ) : message.delivered_at ? (
                          <CheckCheck className="h-3 w-3 opacity-50" />
                        ) : (
                          <Check className="h-3 w-3 opacity-50" />
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Message Input */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="shrink-0">
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!newMessage.trim()}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
