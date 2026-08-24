// SessionList — the left rail of the Sessions console.
//
// A conversation list, not a table. The page used to stack a seven-column
// table above a separate conversation panel, so choosing a session meant
// reading a spreadsheet and then scrolling to the reply box. A rail beside
// the conversation keeps both in view and gives each its own scroll context,
// rather than nesting a scrolling table inside a scrolling page.
//
// Each row carries the four things that decide whether to open it: who, when
// they last spoke, what they said, and what state the conversation is in.
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Hourglass,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  TimerOff,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { BidiText } from "@/components/ui/bidi-text";
import type {
  ChannelType,
  Session,
  Customer,
  Employee,
  SessionMainType,
} from "@/types/database";

export type SessionListItem = Session & {
  customer?: Customer;
  employee?: Employee;
};

interface SessionListProps {
  sessions: SessionListItem[];
  /** Used to name what each conversation is about on the row's second line. */
  sessionTypes?: SessionMainType[];
  /** Currently open conversation, given the rail's selected treatment. */
  selectedId?: string | null;
  onSelect: (session: SessionListItem) => void;
  /** Rendered in the rail header, e.g. a sort control. */
  headerAction?: React.ReactNode;
  className?: string;
}

// Same status vocabulary as SessionsTable: one tone plus one shape per status,
// so state is never carried by colour alone.
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
  completed: CheckCircle2,
  escalated: AlertTriangle,
  auto_closed: TimerOff,
  missed: XCircle,
};

// Same channel vocabulary as SessionsTable: a small glyph next to the name
// so the row's origin (chat vs. call) reads at a glance, without needing the
// subtitle text underneath it.
const channelIcons: Record<ChannelType, LucideIcon> = {
  whatsapp: MessageCircle,
  messenger: MessageSquare,
  sms: MessageSquare,
  voice: Phone,
  email: Mail,
};

/** Two initials for the avatar, falling back to a single dash. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

/**
 * Compact relative age: "2m", "6h", "3d". Deliberately not
 * `formatDistanceToNow` — "about 2 hours ago" does not fit the row and reads
 * as prose where a glanceable figure is wanted.
 */
function shortAge(value: string | null | undefined): string {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function SessionListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b border-border px-4 py-3.5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full max-w-[15rem]" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SessionList({
  sessions,
  sessionTypes,
  selectedId,
  onSelect,
  headerAction,
  className,
}: SessionListProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card",
        className,
      )}
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <span className="text-overline uppercase text-muted-foreground">
          {t("sessions.list.count", { count: sessions.length })}
        </span>
        {headerAction}
      </div>

      {/* The rail owns its own scroll, so the conversation beside it does not
          move when the list does. */}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {sessions.map((session) => {
          const selected = session.id === selectedId;
          const name = session.customer?.name || t("sessions.table.unknown");
          const tone = statusTones[session.status] ?? "neutral";
          const Icon = statusIcons[session.status] ?? CircleDot;
          const ChannelIcon = channelIcons[session.channel] ?? MessageSquare;
          const typeName = session.main_type_id
            ? sessionTypes?.find((type) => type.id === session.main_type_id)
                ?.name
            : undefined;
          const subtitle =
            typeName ||
            t(`sessions.channels.${session.channel}`, {
              defaultValue: session.channel,
            });
          const assignee = session.employee?.profile
            ? `${session.employee.profile.first_name ?? ""} ${
                session.employee.profile.last_name ?? ""
              }`.trim()
            : "";

          return (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => onSelect(session)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "relative flex w-full gap-3 border-b border-border px-4 py-3.5 text-start transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  selected ? "bg-secondary" : "hover:bg-secondary/50",
                )}
              >
                {/* Selected rail. Logical inset so it mirrors under RTL. */}
                {selected && (
                  <span
                    className="absolute bottom-0 start-0 top-0 w-[3px] bg-primary"
                    aria-hidden="true"
                  />
                )}

                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-caption font-bold",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                  aria-hidden="true"
                >
                  {initialsOf(name)}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-body-sm font-semibold text-foreground">
                      {name}
                    </span>
                    <ChannelIcon
                      className="h-3 w-3 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="ms-auto shrink-0 text-caption tabular-nums text-muted-foreground">
                      {shortAge(session.started_at)}
                    </span>
                  </span>

                  {/* What the conversation is about, falling back to the
                      channel it arrived on when it has not been typed yet. */}
                  <span className="truncate text-caption text-muted-foreground">
                    <BidiText value={subtitle} />
                  </span>

                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <StatusBadge
                      size="sm"
                      tone={tone}
                      icon={Icon}
                      label={t(`sessions.status.${session.status}`, {
                        defaultValue: session.status,
                      })}
                    />
                    {assignee ? (
                      <span className="text-overline text-muted-foreground">
                        {t("sessions.list.assignedTo", { name: assignee })}
                      </span>
                    ) : session.status === "escalated" ||
                      session.status === "waiting" ? (
                      // Genuinely needs a human and doesn't have one yet --
                      // distinct from the common case below, where the bot is
                      // handling things fine on its own.
                      <span className="text-overline text-muted-foreground">
                        {t("sessions.list.unassigned")}
                      </span>
                    ) : (
                      <span className="text-overline text-muted-foreground">
                        {t("sessions.table.aiAgent")}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
