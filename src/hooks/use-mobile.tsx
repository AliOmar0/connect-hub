import { useBreakpoint } from "./use-breakpoint";

/**
 * Backward-compatible helper retained for existing consumers (e.g. the sidebar
 * primitive). Now derived from {@link useBreakpoint}: "mobile" is any viewport
 * below the tablet breakpoint (active reference breakpoint of 375).
 */
export function useIsMobile() {
  return useBreakpoint() === 375;
}
