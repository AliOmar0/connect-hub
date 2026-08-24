import * as React from "react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The page's single top-level heading (Requirement 5.2). Supplied
   * already-internationalized by the caller.
   */
  title: string;
  /** Optional supporting copy explaining what the page is for. */
  description?: string;
  /**
   * Page-level actions, right-aligned (start-aligned mirrors under RTL).
   * At most one should be a primary Button — the action the page exists for.
   */
  actions?: React.ReactNode;
  /**
   * Optional filter/search row rendered beneath the title block, full width.
   * Keeps filters in one predictable place instead of the four different
   * placements the pages had grown.
   */
  filters?: React.ReactNode;
}

/**
 * The standard page header for every authenticated Page.
 *
 * Before this component each Page rolled its own `<h1>`: three sizes
 * (`text-2xl` / `text-3xl`), two weights, two families, one in `text-primary`,
 * one with an inline icon, one with no description at all. This fixes a single
 * treatment — the token-defined `text-h2` level in the display family — so the
 * heading scale is applied identically across all Pages (Requirements 1.4,
 * 24.1) and the typography tokens are actually consumed rather than bypassed
 * by ad-hoc utilities.
 *
 * Layout uses flex + `gap` so the action group survives wrapping at narrow
 * widths, and logical alignment so it mirrors correctly under RTL
 * (Requirement 8.3).
 *
 * Requirements: 5.2, 11.1, 24.1, 24.2, 24.3
 */
const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ title, description, actions, filters, className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-4", className)} {...props}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-h2 tracking-tight text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="text-body-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {filters ? (
        <div className="flex flex-wrap items-center gap-2">{filters}</div>
      ) : null}
    </div>
  ),
);
PageHeader.displayName = "PageHeader";

export { PageHeader };
