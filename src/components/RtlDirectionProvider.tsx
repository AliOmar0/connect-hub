import { ReactNode } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useDirection } from "@/hooks/use-direction";

/**
 * Radix primitives (ScrollArea, Select, Tooltip, ...) resolve their own
 * layout/keyboard direction from `@radix-ui/react-direction`'s
 * `useDirection()`, which defaults to "ltr" unless a `DirectionProvider`
 * ancestor says otherwise -- it does NOT look at `<html dir>`. Without this,
 * every Radix component silently stayed left-to-right under Arabic, which is
 * how a ScrollArea viewport ended up forcing `dir="ltr"` on the whole message
 * transcript and left-aligning Arabic chat bubbles.
 */
export function RtlDirectionProvider({ children }: { children: ReactNode }) {
  const dir = useDirection();

  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}
