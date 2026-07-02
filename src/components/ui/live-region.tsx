import * as React from "react";

import { cn } from "@/lib/utils";

export interface LiveRegionProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The message to announce. Whenever this value changes to a new non-empty
   * string, assistive technology re-announces it. An empty string clears the
   * region without announcing anything.
   */
  message: string;
  /**
   * How urgently the change is announced. `polite` (default) waits for the
   * screen reader to finish its current utterance; `assertive` interrupts.
   */
  politeness?: "polite" | "assertive";
  /**
   * The ARIA live-region role. `status` (default) pairs with `polite`;
   * `alert` pairs with `assertive` for failures.
   */
  role?: "status" | "alert";
}

/**
 * Visually hidden ARIA live region that announces text changes to assistive
 * technology. The region element is present in the DOM from first render so
 * that subsequent `message` changes are picked up by screen readers (live
 * regions must exist *before* their content changes to be reliably announced).
 *
 * The announcement is applied on the next microtask after the `message` prop
 * changes, which is effectively immediate and well within the 1-second
 * transition-announcement budget (Requirement 5.4).
 *
 * The container is removed from the visual flow using the standard
 * screen-reader-only technique while remaining perceivable to AT.
 *
 * Requirements: 5.4, 10.6, 10.8
 */
const LiveRegion = React.forwardRef<HTMLDivElement, LiveRegionProps>(
  (
    { message, politeness = "polite", role = "status", className, ...props },
    ref,
  ) => {
    // Mirror the incoming message into local state on a fresh tick so the live
    // region is guaranteed to be mounted before its text content updates.
    const [announced, setAnnounced] = React.useState("");

    React.useEffect(() => {
      setAnnounced(message);
    }, [message]);

    return (
      <div
        ref={ref}
        role={role}
        aria-live={politeness}
        aria-atomic="true"
        className={cn(
          // sr-only: perceivable to assistive technology, hidden visually.
          "absolute -m-px h-px w-px overflow-hidden whitespace-nowrap border-0 p-0",
          "[clip:rect(0,0,0,0)]",
          className,
        )}
        {...props}
      >
        {announced}
      </div>
    );
  },
);
LiveRegion.displayName = "LiveRegion";

export { LiveRegion };
