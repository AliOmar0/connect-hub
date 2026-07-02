import * as React from "react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Short, human-readable heading explaining that there is nothing to show. */
  title: string;
  /** Optional supporting copy that clarifies the absence of records. */
  description?: string;
  /**
   * Optional next action (e.g. a Button) offered when a sensible next step
   * exists for the empty view (Requirement 10.7).
   */
  action?: React.ReactNode;
  /** Optional decorative icon shown above the title. Hidden from AT. */
  icon?: React.ReactNode;
}

/**
 * Standard, token-styled Empty_State shown when a data view has zero records.
 *
 * It explains the absence of records via `title`/`description` and, where a
 * next action exists, surfaces it through `action` (Requirement 10.7). All
 * color, spacing, radius, and typography come from design tokens via Tailwind
 * utilities. The container carries `role="status"` so the empty condition is
 * discoverable by assistive technology; the icon is decorative and hidden.
 *
 * Text is supplied by the caller (already internationalized) so the component
 * stays i18n-friendly without owning translation keys.
 *
 * Requirements: 10.4, 10.7
 */
const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ title, description, action, icon, className, ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="text-muted-foreground [&_svg]:h-10 [&_svg]:w-10"
        >
          {icon}
        </div>
      ) : null}
      <p className="text-lg font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  ),
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
