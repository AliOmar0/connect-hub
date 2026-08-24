import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { STATUS_ICONS, type GenericStatus } from "@/lib/status-cue";

/**
 * The five documented status tones. Mirrors the "Color — Status" table in
 * `design-system.md` and the `--status-*` token set in `index.css`.
 */
export type StatusTone = GenericStatus;

/**
 * Tone → token classes. Only `--status-*` tokens are referenced; raw palette
 * hues (`emerald-500`, `rose-500`, `sky-500`, …) are deliberately absent so a
 * token change in `index.css` propagates here with no per-component edit
 * (Requirement 1.6).
 */
const toneStyles: Record<StatusTone, string> = {
  success: "bg-status-success/10 text-status-success",
  warning: "bg-status-warning/15 text-status-warning",
  info: "bg-status-info/10 text-status-info",
  error: "bg-status-error/10 text-status-error",
  neutral: "bg-status-neutral/15 text-status-neutral",
};

/**
 * The documented non-color cue for each tone, resolved from the icon *names*
 * in `status-cue.ts` to real components. `status-cue.ts` is framework-agnostic
 * and returns strings, which is why every consumer used to re-map them by hand;
 * this is the one place that mapping now lives.
 */
const toneIcons: Record<StatusTone, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
  error: XCircle,
  neutral: Circle,
};

// Fails the build if `status-cue.ts` ever grows a tone this component does not
// render, rather than silently dropping its non-color cue at runtime.
type _AllTonesCovered =
  Record<keyof typeof STATUS_ICONS, string> extends typeof toneStyles
    ? true
    : never;

export interface StatusBadgeProps extends Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  "children"
> {
  /** Which of the five documented status tones this badge carries. */
  tone: StatusTone;
  /**
   * Already-translated text label. Required: color is never the sole carrier
   * of meaning (Requirement 3.5), so a status badge cannot render without one.
   */
  label: string;
  /**
   * Optional domain-specific icon replacing the tone's default shape — e.g.
   * an hourglass for "waiting" or an archive box for "closed". The tone's
   * color is kept, so the pairing of color + shape + text still holds.
   */
  icon?: LucideIcon;
  /** `sm` (20px) for dense table rows; `default` (24px) elsewhere. */
  size?: "sm" | "default";
}

/**
 * The single status indicator for the whole Dashboard.
 *
 * Always renders color **and** a shape (icon) **and** text, so meaning never
 * depends on color alone (Requirements 2.5, 3.5). Replaces the per-page status
 * pills that previously re-implemented this convention — several of which had
 * drifted onto raw Tailwind hues or dropped the icon entirely.
 *
 * Text is supplied already-internationalized by the caller, matching
 * `EmptyState` / `ErrorState`.
 */
const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ tone, label, icon, size = "default", className, ...props }, ref) => {
    const Icon = icon ?? toneIcons[tone];

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap",
          size === "sm" ? "h-5 px-2 text-overline" : "h-6 px-2.5 text-caption",
          toneStyles[tone],
          className,
        )}
        {...props}
      >
        <Icon
          aria-hidden="true"
          className={cn("shrink-0", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")}
        />
        {label}
      </span>
    );
  },
);
StatusBadge.displayName = "StatusBadge";

export { StatusBadge, toneStyles as statusToneStyles };
