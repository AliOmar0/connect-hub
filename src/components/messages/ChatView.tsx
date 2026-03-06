import { useState, useRef, useEffect, useCallback } from "react";
import {
  Message,
  Session,
  Customer,
  ChannelType,
  SessionMainType,
  ChatShortcut,
} from "@/types/database";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import ChatShortcuts from "./ChatShortcuts";
import { ChatVoicePlayer } from "./ChatVoicePlayer";

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
  const [showShortcutMenu, setShowShortcutMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  // ---- Customer Typing Indicator ----
  const [customerTyping, setCustomerTyping] = useState(false);
  const [bufferedCount, setBufferedCount] = useState(0);

  // Poll typing status every 3 seconds when a session is selected
  useEffect(() => {
    if (!session?.id) {
      setCustomerTyping(false);
      setBufferedCount(0);
      return;
    }

    let cancelled = false;

    const pollTypingStatus = async () => {
      try {
        const response = await fetch(
          `http://localhost:5000/api/v1/sessions/${session.id}/typing`,
        );
        if (response.ok && !cancelled) {
          const data = await response.json();
          setCustomerTyping(data.is_typing || false);
          setBufferedCount(data.buffered_count || 0);
        }
      } catch {
        // Silently fail - typing indicator is non-critical
      }
    };

    // Poll immediately and then every 3 seconds
    pollTypingStatus();
    const interval = setInterval(pollTypingStatus, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session?.id]);

  // Fetch shortcuts for the \ trigger
  const { data: shortcuts } = useQuery({
    queryKey: ["chat-shortcuts", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("chat_shortcuts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) return [];
      return data as ChatShortcut[];
    },
    enabled: !!user?.id,
  });

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
    setShowShortcutMenu(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (
        showShortcutMenu &&
        filteredShortcuts &&
        filteredShortcuts.length > 0
      ) {
        // If menu is open, maybe select first? Or just let it be.
        // For now, normal enter sends message.
      }
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    // Trigger menu if value ends with \ or contains \ and we are filtering
    if (value.endsWith("\\")) {
      setShowShortcutMenu(true);
    } else if (!value.includes("\\")) {
      setShowShortcutMenu(false);
    }
  };

  const selectShortcut = (content: string) => {
    // Replace the \ and any text after it with the shortcut content
    // For simplicity, if we just typed \ at the end, replace it.
    if (newMessage.endsWith("\\")) {
      setNewMessage(newMessage.slice(0, -1) + content);
    } else {
      // Handle mid-text \ if needed, but for now just append/replace last
      setNewMessage((prev) => {
        const parts = prev.split("\\");
        parts.pop(); // remove the part after last \
        return parts.join("\\") + content;
      });
    }
    setShowShortcutMenu(false);
  };

  // Get text after the last backslash for filtering
  const lastBackslashIndex = newMessage.lastIndexOf("\\");
  const shortcutQuery =
    lastBackslashIndex !== -1
      ? newMessage.slice(lastBackslashIndex + 1).toLowerCase()
      : "";

  const filteredShortcuts = shortcuts?.filter(
    (s) =>
      s.title.toLowerCase().includes(shortcutQuery) ||
      s.content.toLowerCase().includes(shortcutQuery),
  );

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/10 text-muted-foreground p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-6">
          <MessageCircle className="h-10 w-10 text-primary/40" />
        </div>
        <h3 className="text-xl font-semibold mb-2 text-foreground">
          لم يتم اختيار محادثة
        </h3>
        <p className="text-sm max-w-[280px] leading-relaxed">
          الرجاء اختيار محادثة من القائمة الجانبية للبدء في متابعة مراسلات
          العملاء
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
    <div className="flex-1 flex flex-col bg-background relative h-full">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
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
        {/* <div className="hidden lg:flex items-center gap-6 border-x border-border px-6 mx-6 h-10">
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
        </div> */}

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
      <ScrollArea
        className="flex-1 p-6 min-h-0 custom-scrollbar"
        ref={scrollRef}
      >
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
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8 opacity-20" />
            </div>
            <p className="text-sm font-medium">لا توجد رسائل بعد</p>
            <p className="text-xs mt-1">ابدأ المحادثة الآن مع العميل</p>
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
                    {message.media_url &&
                      message.media_type?.startsWith("audio") && (
                        <div className="mb-2 mt-1">
                          <ChatVoicePlayer
                            url={message.media_url}
                            isOutbound={isOutbound}
                          />
                        </div>
                      )}
                    {message.media_url &&
                      message.media_type?.startsWith("image") && (
                        <div className="mb-2 mt-1">
                          <img
                            src={message.media_url}
                            alt="Sticker"
                            className="max-w-[120px] h-auto rounded-lg shadow-sm"
                          />
                        </div>
                      )}
                    {!(
                      message.media_url &&
                      message.media_type?.startsWith("audio")
                    ) && (
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </p>
                    )}
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

      {/* Customer Typing Indicator */}
      {customerTyping && (
        <div className="px-6 py-2.5 bg-background/95 backdrop-blur-sm flex items-center gap-3 border-t border-border/40 absolute bottom-[72px] left-0 right-0 z-10 fade-in">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-primary/5 rounded-full border border-primary/10">
            <div className="flex gap-1">
              <span
                className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
            <span className="text-[11px] font-semibold text-primary/80 uppercase tracking-tighter">
              {bufferedCount > 1
                ? `العميل يكتب (${bufferedCount} رسائل)...`
                : "العميل يكتب الآن..."}
            </span>
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="p-4 bg-card border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.03)] z-20 shrink-0">
        {showShortcutMenu &&
          filteredShortcuts &&
          filteredShortcuts.length > 0 && (
            <div className="absolute bottom-full left-4 mb-2 w-64 max-h-48 bg-popover border border-border rounded-lg shadow-xl overflow-y-auto z-50">
              <div className="p-2 border-b border-border bg-muted/50">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Quick Shortcuts
                </span>
              </div>
              {filteredShortcuts.map((shortcut) => (
                <button
                  key={shortcut.id}
                  className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors flex flex-col gap-0.5 border-b border-border/50 last:border-0"
                  onClick={() => selectShortcut(shortcut.content)}
                >
                  <span className="text-sm font-medium">{shortcut.title}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {shortcut.content}
                  </span>
                </button>
              ))}
            </div>
          )}
        <div className="flex items-center gap-2">
          <ChatShortcuts
            onSelect={(content) => {
              setNewMessage((prev) =>
                prev ? `${prev.trim()} ${content}` : content,
              );
            }}
          />
          <Button variant="ghost" size="icon" className="shrink-0">
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            placeholder="اكتب رسالة هنا... (استخدم \ للاختصارات)"
            value={newMessage}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            className="flex-1 bg-muted/30 border-muted-foreground/10 focus-visible:ring-primary/20 h-11"
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
