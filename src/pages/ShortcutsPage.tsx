import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard } from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BidiText } from "@/components/ui/bidi-text";
import { groupShortcuts, type Shortcut } from "@/lib/shortcuts";

/**
 * Static definition of a keyboard shortcut in the reference catalog.
 *
 * `keys` is either a single rendered combo or a platform-specific pair so the
 * modifier matches the user's OS (⌘ on macOS, Ctrl elsewhere). `descriptionKey`
 * and `group` are i18n keys resolved at render time so every visible string
 * flows through the internationalization layer (Requirement 8.4).
 */
interface ShortcutDef {
  id: string;
  group: string;
  descriptionKey: string;
  keys: string | { mac: string; other: string };
}

/**
 * The dashboard's keyboard shortcuts. Every entry maps to a real, functional
 * interaction: standard focus/activation keys handled by the browser, and the
 * sidebar toggle wired in `components/ui/sidebar.tsx` (Ctrl/⌘ + B).
 */
const SHORTCUT_DEFS: ShortcutDef[] = [
  {
    id: "focus-next",
    group: "general",
    descriptionKey: "shortcutsPage.items.focusNext",
    keys: "Tab",
  },
  {
    id: "focus-previous",
    group: "general",
    descriptionKey: "shortcutsPage.items.focusPrevious",
    keys: "Shift + Tab",
  },
  {
    id: "activate",
    group: "general",
    descriptionKey: "shortcutsPage.items.activate",
    keys: "Enter",
  },
  {
    id: "dismiss",
    group: "general",
    descriptionKey: "shortcutsPage.items.dismiss",
    keys: "Esc",
  },
  {
    id: "toggle-sidebar",
    group: "navigation",
    descriptionKey: "shortcutsPage.items.toggleSidebar",
    keys: { mac: "⌘ B", other: "Ctrl + B" },
  },
];

/** A shortcut with its display strings resolved, ready to group and render. */
interface ResolvedShortcut extends Shortcut {
  id: string;
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export default function ShortcutsPage() {
  const { t } = useTranslation();

  // Resolve platform-specific key combos and descriptions, then partition into
  // labeled context groups. `groupShortcuts` guarantees every shortcut lands in
  // exactly one group and never emits an empty group (Requirement 21.1, 21.3).
  const groups = useMemo(() => {
    const mac = isMacPlatform();
    const resolved: ResolvedShortcut[] = SHORTCUT_DEFS.map((def) => ({
      id: def.id,
      group: def.group,
      keys:
        typeof def.keys === "string"
          ? def.keys
          : mac
            ? def.keys.mac
            : def.keys.other,
      description: t(def.descriptionKey),
    }));
    return groupShortcuts(resolved);
  }, [t]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Keyboard className="h-6 w-6 text-primary" aria-hidden="true" />
            {t("shortcutsPage.title")}
          </h1>
          <p className="text-muted-foreground">{t("shortcutsPage.subtitle")}</p>
        </div>

        {groups.length === 0 ? (
          <EmptyState
            icon={<Keyboard />}
            title={t("shortcutsPage.emptyTitle")}
            description={t("shortcutsPage.emptyDescription")}
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {groups.map((group) => (
              <Card key={group.group} className="border-border/60 shadow-card">
                <CardHeader>
                  {/* h2 keeps a well-formed heading order under the page h1
                      (Requirement 5.2). */}
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    {t(`shortcutsPage.groups.${group.group}`, {
                      defaultValue: group.group,
                    })}
                  </h2>
                </CardHeader>
                <CardContent>
                  <dl className="divide-y divide-border">
                    {group.shortcuts.map((shortcut) => (
                      <div
                        key={(shortcut as ResolvedShortcut).id}
                        className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                      >
                        {/* Description flows in the active direction (RTL for
                            Arabic per Requirement 21.4). */}
                        <dt className="text-sm text-foreground">
                          {shortcut.description}
                        </dt>
                        {/* Key combo stays left-to-right via BidiText even under
                            RTL (Requirement 8.8, 21.4). */}
                        <dd className="shrink-0">
                          <BidiText
                            value={shortcut.keys}
                            className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground"
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
