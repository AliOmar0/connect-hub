import * as React from "react";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatusTone } from "@/components/ui/status-badge";

/** Icon tint per tone. Token-backed only — no raw palette hues. */
const toneIcon: Record<StatusTone, string> = {
  success: "text-status-success",
  warning: "text-status-warning",
  info: "text-status-info",
  error: "text-status-error",
  neutral: "text-muted-foreground",
};

export interface MetricCardProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "title"
> {
  /** Short, already-translated label for what is being measured. */
  label: string;
  /** The figure itself, pre-formatted for the active locale by the caller. */
  value: React.ReactNode;
  /** Optional supporting line — a breakdown, comparison, or qualifier. */
  hint?: string;
  /** Optional icon, tinted by `tone`. */
  icon?: LucideIcon;
  /** Which status tone the icon and trend carry. Defaults to neutral. */
  tone?: StatusTone;
  /**
   * Optional period-over-period movement. `direction` is stated separately from
   * color and carries its own arrow icon, so the movement is legible without
   * relying on green/red (Requirement 3.5).
   */
  trend?: { label: string; direction: "up" | "down" };
  /**
   * `hero` is the one card on the page that carries the number a supervisor
   * actually acts on: a navy panel with a 56px figure, sized and coloured so it
   * wins against the three supporting cards beside it. Six coequal white cards
   * meant nothing was primary.
   */
  variant?: "default" | "hero";
  /** Small gold eyebrow above the label. `hero` only. */
  overline?: string;
  /**
   * Right-aligned status pill — "Live" on the hero card. Rendered as given so
   * the caller decides the wording; the live dot is drawn here.
   */
  badge?: string;
}

/**
 * The single metric card for the whole Dashboard.
 *
 * Replaces four incompatible implementations — `dashboard/StatsCard` plus
 * bespoke inline versions on SessionsPage, EmployeesPage and AnalyticsPage —
 * which disagreed on border, radius, padding, value size and, most
 * consequentially, color: `StatsCard` tinted its icons with raw `emerald-500` /
 * `amber-500` / `sky-500` hues and arbitrary `shadow-[0_0_20px_rgba(...)]`
 * glows that bypassed the token system entirely.
 *
 * Figures render with tabular numerals so stacked cards align on the decimal.
 *
 * Requirements: 1.2, 12.1, 24.2
 */
const MetricCard = React.forwardRef<HTMLDivElement, MetricCardProps>(
  (
    {
      label,
      value,
      hint,
      icon: Icon,
      tone = "neutral",
      trend,
      variant = "default",
      overline,
      badge,
      className,
      ...props
    },
    ref,
  ) => {
    const isHero = variant === "hero";

    const TrendIcon = trend?.direction === "up" ? TrendingUp : TrendingDown;

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col justify-between rounded-xl shadow-card",
          isHero
            ? // `bg-navy` rather than `bg-primary`: `--primary` flips to gold in
              // dark mode, which would turn this panel gold-on-white. The brand
              // navy is theme-independent, so the white text holds in both.
              "min-h-[9rem] gap-6 bg-navy p-5 text-white"
            : "min-h-[7rem] gap-4 border border-border bg-card p-[18px]",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {isHero && overline ? (
              <span className="text-overline uppercase text-gold-light">
                {overline}
              </span>
            ) : null}
            <span
              className={cn(
                "font-medium",
                isHero
                  ? "text-body-sm text-white/75"
                  : "text-body-sm text-muted-foreground",
              )}
            >
              {label}
            </span>
          </div>

          {isHero && badge ? (
            <span className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full bg-white/[0.14] px-2.5 text-overline font-semibold">
              <span
                className="h-1.5 w-1.5 rounded-full bg-status-success motion-safe:animate-pulse"
                aria-hidden="true"
              />
              {badge}
            </span>
          ) : Icon ? (
            <Icon
              aria-hidden="true"
              className={cn("h-4 w-4 shrink-0", toneIcon[tone])}
            />
          ) : null}
        </div>

        {isHero ? (
          // Figure and its context sit on one baseline: the number is the
          // thing, the delta and breakdown are read off it.
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <span className="font-display text-[56px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
              {value}
            </span>
            {(trend || hint) && (
              <div className="flex flex-col gap-0.5 pb-1.5">
                {trend ? (
                  <span className="inline-flex items-center gap-1 text-caption font-semibold text-status-success">
                    <TrendIcon
                      aria-hidden="true"
                      className="h-3 w-3 shrink-0"
                    />
                    {trend.label}
                  </span>
                ) : null}
                {hint ? (
                  <span className="text-caption text-white/60">{hint}</span>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="font-display text-h2 tabular-nums tracking-tight text-foreground">
              {value}
            </span>
            {trend ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-caption font-semibold",
                  trend.direction === "up"
                    ? "text-status-success"
                    : "text-status-error",
                )}
              >
                <TrendIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
                {trend.label}
              </span>
            ) : null}
            {hint ? (
              <span className="text-caption text-muted-foreground">{hint}</span>
            ) : null}
          </div>
        )}
      </div>
    );
  },
);
MetricCard.displayName = "MetricCard";

/**
 * Loading placeholder occupying the same footprint as {@link MetricCard}, so
 * a metric row does not reflow when its data arrives (Requirement 12.2).
 */
function MetricCardSkeleton({
  variant = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "hero";
}) {
  const isHero = variant === "hero";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex flex-col justify-between rounded-xl shadow-card",
        isHero
          ? "min-h-[9rem] gap-6 bg-navy p-5 lg:w-[356px] lg:shrink-0"
          : "min-h-[7rem] gap-4 border border-border bg-card p-[18px]",
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-2">
        <Skeleton className={cn("h-4 w-24", isHero && "bg-white/20")} />
        <Skeleton
          className={cn(
            isHero
              ? "h-[22px] w-14 rounded-full bg-white/20"
              : "h-4 w-4 rounded-sm",
          )}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton
          className={cn(isHero ? "h-14 w-24 bg-white/20" : "h-7 w-16")}
        />
        <Skeleton className={cn("h-3 w-20", isHero && "bg-white/20")} />
      </div>
    </div>
  );
}

export { MetricCard, MetricCardSkeleton };
