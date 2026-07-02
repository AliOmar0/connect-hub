import * as React from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Read the user's `prefers-reduced-motion` preference.
 *
 * Returns `true` when the user requests reduced motion. When the preference
 * cannot be read from the system (no `matchMedia`, or it throws), the hook
 * defaults to the reduced-motion behavior (`true`) per Requirement 9.5.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = React.useState<boolean>(() =>
    readReducedMotion(),
  );

  React.useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      // Preference cannot be read: default to reduced motion.
      setReducedMotion(true);
      return;
    }

    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(REDUCED_MOTION_QUERY);
    } catch {
      // matchMedia threw: default to reduced motion.
      setReducedMotion(true);
      return;
    }

    const onChange = () => setReducedMotion(mql.matches);
    setReducedMotion(mql.matches);

    // Safari < 14 only supports the deprecated addListener API.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return reducedMotion;
}

// Synchronous read used for the initial state so the first render already
// reflects the preference (and defaults to reduced when unreadable).
function readReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return true;
  }
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return true;
  }
}
