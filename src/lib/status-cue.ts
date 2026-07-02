// Status non-color cue helper.
//
// A status must never rely on color alone (Requirements 3.5, 14.7, 15.2, 18.5,
// 20.2 / Property 2). Every status indicator across the Dashboard — a generic
// status pill, message authorship, an SLA countdown, a Role label, or a
// notification read/unread state — pairs its color with at least one non-color
// cue: a lucide icon (shape) and a text label.
//
// This module is a pure, framework-agnostic mapping from a status kind/value to
// a descriptor carrying those non-color cues. It is the single source of truth
// for the documented status convention in `design-system.md`
// (success → check-circle-2, warning → alert-triangle, info → info,
// error → x-circle, neutral → circle) so components render the same
// icon + label everywhere. Callers translate `label` when it is an i18n key.

/**
 * The documented generic-status convention: each status maps to a lucide icon
 * name that is rendered alongside (never instead of) its color. Mirrors the
 * "Color — Status" table in `design-system.md`.
 */
export const STATUS_ICONS = {
  success: "check-circle-2",
  warning: "alert-triangle",
  info: "info",
  error: "x-circle",
  neutral: "circle",
} as const;

export type GenericStatus = keyof typeof STATUS_ICONS;

/** Message authorship on SessionsPage (Requirement 14.7). */
export type MessageAuthor = "customer" | "agent" | "bot";

/** Staff Role label on EmployeesPage (Requirement 18.5). */
export type Role = "agent" | "supervisor" | "manager" | "admin";

/** Notification read/unread state on NotificationsPage (Requirement 20.2). */
export type ReadState = "read" | "unread";

/** The categories of status indicator that carry a non-color cue. */
export type StatusCueKind =
  | "generic"
  | "authorship"
  | "role"
  | "notification"
  | "sla";

/**
 * A resolved status indicator. `icon` (shape) and `label` (text) are the
 * non-color cues; both are always non-empty so meaning is never carried by
 * color alone. `label` is an i18n key for enumerated statuses and a
 * ready-to-render text value for the SLA countdown.
 */
export interface StatusCueDescriptor {
  kind: StatusCueKind;
  /** The originating status value, stringified (e.g. "success", "unread"). */
  value: string;
  /** lucide icon name — a non-color shape cue. Never empty. */
  icon: string;
  /** i18n key or literal text — a non-color text cue. Never empty. */
  label: string;
}

const AUTHOR_ICONS: Record<MessageAuthor, string> = {
  customer: "user",
  agent: "headset",
  bot: "bot",
};

const ROLE_ICONS: Record<Role, string> = {
  agent: "user",
  supervisor: "user-check",
  manager: "users",
  admin: "shield",
};

const READ_STATE_ICONS: Record<ReadState, string> = {
  read: "mail-open",
  unread: "mail",
};

/** Discriminated input accepted by {@link resolveStatusCue}. */
export type StatusCueInput =
  | { kind: "generic"; value: GenericStatus }
  | { kind: "authorship"; value: MessageAuthor }
  | { kind: "role"; value: Role }
  | { kind: "notification"; value: ReadState }
  | { kind: "sla"; remainingSeconds: number };

/**
 * Format an SLA countdown as a readable text label (the non-color cue for
 * Requirement 15.2). Negative or zero time is rendered as a breached label
 * rather than a negative clock, so the text is always meaningful.
 */
export function formatSlaCountdown(remainingSeconds: number): string {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) {
    return "sla.breached";
  }
  const total = Math.floor(remainingSeconds);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Severity icon for an SLA countdown, escalating as time runs out. */
function slaIcon(remainingSeconds: number): string {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) {
    return "timer-off";
  }
  if (remainingSeconds <= 60) {
    return "alarm-clock";
  }
  return "timer";
}

/**
 * Map any status kind/value to a descriptor whose non-color cues (`icon` and
 * `label`) are guaranteed non-empty, so no status depends on color alone.
 */
export function resolveStatusCue(input: StatusCueInput): StatusCueDescriptor {
  switch (input.kind) {
    case "generic":
      return {
        kind: "generic",
        value: input.value,
        icon: STATUS_ICONS[input.value],
        label: `status.${input.value}`,
      };
    case "authorship":
      return {
        kind: "authorship",
        value: input.value,
        icon: AUTHOR_ICONS[input.value],
        label: `authorship.${input.value}`,
      };
    case "role":
      return {
        kind: "role",
        value: input.value,
        icon: ROLE_ICONS[input.value],
        label: `role.${input.value}`,
      };
    case "notification":
      return {
        kind: "notification",
        value: input.value,
        icon: READ_STATE_ICONS[input.value],
        label: `notification.${input.value}`,
      };
    case "sla":
      return {
        kind: "sla",
        value: String(input.remainingSeconds),
        icon: slaIcon(input.remainingSeconds),
        label: formatSlaCountdown(input.remainingSeconds),
      };
  }
}
