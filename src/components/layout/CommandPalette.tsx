import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";
import { filterNavByRole } from "@/lib/navigation";
import {
  NAV_GROUPS,
  PRIMARY_NAV_ITEMS,
  type NavItem,
} from "@/components/layout/PrimaryNav";

/** True when the keystroke is the platform's "open command palette" chord. */
function isPaletteChord(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Keyboard-first navigation across the destinations the current Role can reach.
 *
 * The header previously rendered a search `Input` with no `value`, `onChange` or
 * `onSubmit` — it looked like a search box and did nothing at all. This replaces
 * that affordance with a real one, built on the `cmdk` primitive that already
 * shipped in `ui/command.tsx` and had zero consumers.
 *
 * Destinations are role-filtered through the same `filterNavByRole` the sidebar
 * uses, so the palette can never offer a page the router would refuse.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const navigate = useNavigate();

  const visibleItems = React.useMemo(
    () => filterNavByRole(PRIMARY_NAV_ITEMS, userRole),
    [userRole],
  );

  const go = React.useCallback(
    (to: string) => {
      onOpenChange(false);
      navigate(to);
    },
    [navigate, onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("appShell.header.searchPlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("appShell.header.commandEmpty")}</CommandEmpty>
        {NAV_GROUPS.map((group) => {
          const groupItems = visibleItems.filter(
            (item: NavItem) => item.group === group.id,
          );
          if (groupItems.length === 0) return null;

          return (
            <CommandGroup
              key={group.id}
              heading={
                group.labelKey
                  ? t(group.labelKey)
                  : t("appShell.nav.groups.manage")
              }
            >
              {groupItems.map(({ to, icon: Icon, labelKey }) => (
                <CommandItem
                  key={to}
                  // `value` is what cmdk filters on, so it must be the visible
                  // label rather than the route.
                  value={t(labelKey)}
                  onSelect={() => go(to)}
                  className="min-h-[44px] cursor-pointer"
                >
                  <Icon aria-hidden="true" className="me-2 h-4 w-4" />
                  {t(labelKey)}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * Wires the ⌘K / Ctrl-K chord to `setOpen`. Kept separate from the dialog so the
 * header can render its trigger without mounting the palette's contents.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useCommandPaletteHotkey(
  setOpen: React.Dispatch<React.SetStateAction<boolean>>,
): void {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPaletteChord(event)) return;
      // Only intercept the chord itself; every other keystroke, including the
      // editor's undo/redo, is left alone.
      event.preventDefault();
      setOpen((prev) => !prev);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);
}
