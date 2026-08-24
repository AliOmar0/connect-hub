import { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Send,
  Paperclip,
  Phone,
  CheckCheck,
  Check,
  CheckCircle,
  CircleDot,
  Hourglass,
  AlertTriangle,
  TimerOff,
  XCircle,
  MessageCircle,
  MessageSquare,
  Mail,
  Tag,
  User,
  Headset,
  Bot,
  UserPlus,
  MoreVertical,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { ar as arLocale } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { BidiText } from "@/components/ui/bidi-text";
import { ErrorState } from "@/components/ui/error-state";
import { resolveStatusCue, type MessageAuthor } from "@/lib/status-cue";
import ChatShortcuts from "./ChatShortcuts";
import { ChatVoicePlayer } from "./ChatVoicePlayer";
import CallRecordingPlayer from "./CallRecordingPlayer";
import LiveVoiceTranscript from "@/components/sessions/LiveVoiceTranscript";

// Same status vocabulary as SessionList/SessionsTable: one tone plus one
// shape per status, so state is never carried by colour alone.
const statusTones: Record<string, StatusTone> = {
  active: "success",
  waiting: "warning",
  completed: "info",
  escalated: "error",
  auto_closed: "neutral",
  missed: "neutral",
};

const statusIcons: Record<string, LucideIcon> = {
  active: CircleDot,
  waiting: Hourglass,
  completed: CheckCircle,
  escalated: AlertTriangle,
  auto_closed: TimerOff,
  missed: XCircle,
};

// A voice call only has a recording once it is over, and only has a live
// transcript while it is not. These are the statuses that mean "over".
const ENDED_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "auto_closed",
  "missed",
]);

// /api/v1/sessions/* routes are protected by verify_jwt on the backend, so
// every call needs the current Supabase access token attached (same pattern
// as SessionsPage.tsx / KnowledgePage.tsx).
async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

/**
 * Non-color authorship cue (Requirement 14.7 / Property 2): each message
 * authorship maps to a lucide icon (shape) rendered alongside a text label, so
 * customer / agent / bot messages are distinguishable without relying on color.
 */
const AUTHOR_ICON_COMPONENTS: Record<MessageAuthor, React.ElementType> = {
  customer: User,
  agent: Headset,
  bot: Bot,
};

interface ChatViewProps {
  session: (Session & { customer?: Customer }) | null;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onJoinSession?: () => void;
  onUpdateType?: (typeId: string) => void;
  onUpdateStatus?: (status: string) => void;
  sessionTypes?: SessionMainType[];
  loading?: boolean;
  /** Transcript load failed; render an ErrorState in the messages region. */
  error?: boolean;
  /** Recovery action for a failed transcript load (Requirement 14.5). */
  onRetryMessages?: () => void;
  /** Opens the assign-agent dialog for this session. Omitted when the
   *  current user lacks permission to assign. */
  onAssignAgent?: () => void;
  /** Marks the session escalated. Only offered while it is still open. */
  onEscalate?: () => void;
  /** Navigates to the session's activity timeline. */
  onViewActivity?: () => void;
}

// Statuses from which a session can still be escalated -- once it has ended
// (completed/auto-closed/missed) or is already escalated, the action no
// longer applies.
const ESCALATABLE_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "waiting",
]);

const channelLabelKeys: Record<ChannelType, string> = {
  whatsapp: "sessions.channels.whatsapp",
  messenger: "sessions.channels.messenger",
  sms: "sessions.channels.sms",
  voice: "sessions.channels.voice",
  email: "sessions.channels.email",
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
  error,
  onRetryMessages,
  onAssignAgent,
  onEscalate,
  onViewActivity,
}: ChatViewProps) {
  const { t, i18n } = useTranslation();
  const [newMessage, setNewMessage] = useState("");
  const [showShortcutMenu, setShowShortcutMenu] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
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
          { headers: await authHeaders() },
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
    // Jump to the latest message whenever the transcript changes -- including
    // right after picking a different session, so opening a conversation
    // lands on its messages instead of wherever the previous scroll sat.
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [session?.id, messages]);

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

  // Turns the flat transcript into day separators plus a `showAuthor` flag
  // per message, so consecutive messages from the same author (a common
  // back-and-forth burst) read as one visual group instead of repeating the
  // same avatar/label over and over -- the thing that made a busy transcript
  // hard to scan at a glance.
  type TranscriptItem =
    | { kind: "separator"; key: string; label: string }
    | {
        kind: "message";
        message: Message;
        author: MessageAuthor;
        showAuthor: boolean;
      };

  const transcript = useMemo<TranscriptItem[]>(() => {
    const items: TranscriptItem[] = [];
    let lastDayKey: string | null = null;
    let lastAuthor: MessageAuthor | null = null;

    for (const message of messages) {
      const sentAt = new Date(message.sent_at);
      const dayKey = format(sentAt, "yyyy-MM-dd");
      const author: MessageAuthor =
        message.direction === "outbound"
          ? session?.employee_id
            ? "agent"
            : "bot"
          : "customer";

      if (dayKey !== lastDayKey) {
        items.push({
          kind: "separator",
          key: dayKey,
          label: isToday(sentAt)
            ? t("notifications.groups.today")
            : isYesterday(sentAt)
              ? t("notifications.groups.yesterday")
              : format(sentAt, "d MMMM yyyy", {
                  locale: i18n.language.startsWith("ar") ? arLocale : undefined,
                }),
        });
        lastDayKey = dayKey;
        lastAuthor = null;
      }

      items.push({
        kind: "message",
        message,
        author,
        showAuthor: author !== lastAuthor,
      });
      lastAuthor = author;
    }

    return items;
  }, [messages, session?.employee_id, t, i18n.language]);

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/10 text-muted-foreground p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-6">
          <MessageCircle className="h-10 w-10 text-primary/40" />
        </div>
        <h3 className="text-xl font-semibold mb-2 text-foreground">
          {t("sessions.noSelection.title")}
        </h3>
        <p className="text-sm max-w-[280px] leading-relaxed">
          {t("sessions.noSelection.description")}
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
              {session.customer?.name || t("sessions.detail.unknownCustomer")}
            </h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ChannelIcon className="h-3 w-3" />
              <span>
                {channelLabelKeys[session.channel]
                  ? t(channelLabelKeys[session.channel])
                  : session.channel || t("sessions.detail.unknownCustomer")}
              </span>
              <span>•</span>
              {session.customer?.phone ? (
                <BidiText value={session.customer.phone} />
              ) : (
                <span>{t("sessions.detail.noPhone")}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sessionTypes && onUpdateType && (
            <div className="flex items-center gap-1.5 me-2">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              <Select
                value={session.main_type_id || "none"}
                onValueChange={(val) => onUpdateType(val === "none" ? "" : val)}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder={t("sessions.detail.setType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t("sessions.detail.noType")}
                  </SelectItem>
                  {sessionTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
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
              {t("sessions.detail.joinConversation")}
            </Button>
          )}
          {session.status === "escalated" && onUpdateStatus && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onUpdateStatus("completed")}
              className="bg-status-info/10 text-status-info hover:bg-status-info/20 border-status-info/20"
            >
              <CheckCircle className="h-3.5 w-3.5 me-1.5" />
              {t("sessions.detail.completeSession")}
            </Button>
          )}
          {onAssignAgent && (
            <Button variant="outline" size="sm" onClick={onAssignAgent}>
              <UserPlus className="h-3.5 w-3.5 me-1.5" aria-hidden="true" />
              {t("sessions.detail.assign")}
            </Button>
          )}
          {onEscalate && ESCALATABLE_STATUSES.has(session.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={onEscalate}
              className="bg-status-error/10 text-status-error hover:bg-status-error/20 border-status-error/20"
            >
              <AlertTriangle
                className="h-3.5 w-3.5 me-1.5"
                aria-hidden="true"
              />
              {t("sessions.detail.escalate")}
            </Button>
          )}
          <StatusBadge
            tone={statusTones[session.status] ?? "neutral"}
            icon={statusIcons[session.status]}
            label={t(`sessions.status.${session.status}`, {
              defaultValue: session.status,
            })}
          />
          {onViewActivity && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t("sessions.detail.moreOptions")}
                >
                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onViewActivity}>
                  <Clock className="h-4 w-4 me-2" aria-hidden="true" />
                  {t("sessions.activity.viewLink")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Voice call: live transcript while it runs, recording once it ends.
          Both are keyed off external_conversation_id, which the backend only
          sets for the ElevenLabs channel. */}
      {session.channel === "voice" &&
        session.external_conversation_id &&
        !ENDED_STATUSES.has(session.status) && (
          <LiveVoiceTranscript
            conversationId={session.external_conversation_id}
          />
        )}
      {session.channel === "voice" &&
        session.external_conversation_id &&
        ENDED_STATUSES.has(session.status) && (
          <CallRecordingPlayer sessionId={session.id} />
        )}

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-6 min-h-0 custom-scrollbar">
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
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <ErrorState
              title={t("feedback.errorTitle")}
              description={t("feedback.errorDescription")}
              onRetry={onRetryMessages}
              className="border-0 bg-transparent"
            />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8 opacity-20" />
            </div>
            <p className="text-sm font-medium">
              {t("sessions.detail.noMessagesTitle")}
            </p>
            <p className="text-xs mt-1">
              {t("sessions.detail.noMessagesDescription")}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {transcript.map((item) => {
              if (item.kind === "separator") {
                return (
                  <div
                    key={item.key}
                    role="separator"
                    className="flex items-center justify-center py-3 first:pt-0"
                  >
                    <span className="rounded-full bg-muted px-3 py-1 text-caption font-medium text-muted-foreground">
                      {item.label}
                    </span>
                  </div>
                );
              }

              const { message, author, showAuthor } = item;
              const isOutbound = message.direction === "outbound";
              // Authorship non-color cue (Requirement 14.7): inbound is the
              // customer; an outbound message is attributed to the assigned
              // agent when one is present, otherwise to the automated bot.
              const cue = resolveStatusCue({
                kind: "authorship",
                value: author,
              });
              const AuthorIcon = AUTHOR_ICON_COMPONENTS[author];

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex flex-col gap-1",
                    isOutbound ? "items-end" : "items-start",
                    // Grouped messages from the same author sit close
                    // together; a new author (or the first message of the
                    // day) gets breathing room above it.
                    showAuthor ? "mt-3 first:mt-0" : "mt-0.5",
                  )}
                >
                  {showAuthor && (
                    <span className="flex items-center gap-1 text-caption font-medium text-muted-foreground">
                      <AuthorIcon className="h-3 w-3" aria-hidden="true" />
                      {t(cue.label)}
                    </span>
                  )}
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
                      <span className="text-caption">
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
            <div ref={bottomRef} />
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
            <span className="text-overline font-semibold text-primary/80 uppercase tracking-tighter">
              {bufferedCount > 1
                ? t("sessions.detail.customerTypingCount", {
                    count: bufferedCount,
                  })
                : t("sessions.detail.customerTyping")}
            </span>
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="p-4 bg-card border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.03)] z-20 shrink-0">
        {showShortcutMenu &&
          filteredShortcuts &&
          filteredShortcuts.length > 0 && (
            <div className="absolute bottom-full start-4 mb-2 w-64 max-h-48 bg-popover border border-border rounded-lg shadow-xl overflow-y-auto z-50">
              <div className="p-2 border-b border-border bg-muted/50">
                <span className="text-overline font-bold uppercase tracking-wider text-muted-foreground">
                  {t("sessions.detail.quickShortcuts")}
                </span>
              </div>
              {filteredShortcuts.map((shortcut) => (
                <button
                  key={shortcut.id}
                  className="w-full text-start px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors flex flex-col gap-0.5 border-b border-border/50 last:border-0"
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
            placeholder={t("sessions.detail.messagePlaceholder")}
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
