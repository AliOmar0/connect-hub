import * as React from "react";

/**
 * The four reference breakpoints used across the redesign.
 * - 375  → mobile  (width < 768)
 * - 768  → tablet  (768 <= width < 1024)
 * - 1024 → laptop  (1024 <= width < 1440)
 * - 1440 → desktop (width >= 1440)
 */
export type Breakpoint = 375 | 768 | 1024 | 1440;

// Lower bounds (in CSS px) at which each reference breakpoint becomes active.
export const BREAKPOINTS = {
  mobile: 375,
  tablet: 768,
  laptop: 1024,
  desktop: 1440,
} as const;

/** Map a viewport width to its active reference breakpoint. */
export function widthToBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS.desktop) return 1440;
  if (width >= BREAKPOINTS.laptop) return 1024;
  if (width >= BREAKPOINTS.tablet) return 768;
  return 375;
}

/**
 * Reports the active reference breakpoint (375 / 768 / 1024 / 1440) for the
 * current viewport width, updating as the viewport crosses a breakpoint.
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = React.useState<Breakpoint>(() =>
    typeof window !== "undefined" ? widthToBreakpoint(window.innerWidth) : 1024,
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => setBreakpoint(widthToBreakpoint(window.innerWidth));

    // Watch the three breakpoint boundaries so we react exactly when the
    // active reference breakpoint changes.
    const queries = [
      window.matchMedia(`(min-width: ${BREAKPOINTS.tablet}px)`),
      window.matchMedia(`(min-width: ${BREAKPOINTS.laptop}px)`),
      window.matchMedia(`(min-width: ${BREAKPOINTS.desktop}px)`),
    ];

    queries.forEach((mql) => mql.addEventListener("change", update));
    update();

    return () => {
      queries.forEach((mql) => mql.removeEventListener("change", update));
    };
  }, []);

  return breakpoint;
}
