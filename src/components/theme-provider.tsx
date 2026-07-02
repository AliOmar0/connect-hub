// Lightweight class-strategy ThemeProvider (design: "Theme & Direction Application").
// Toggles the `.dark` class on the document root, persists the choice to
// localStorage, and applies within 1s without a reload (CSS-cascade driven).
// Requirements: 11.4, 19.5, 19.7
import * as React from "react";

export type Theme = "light" | "dark";

const THEMES: readonly Theme[] = ["light", "dark"] as const;

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" && (THEMES as readonly string[]).includes(value)
  );
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined);

/** Reads the persisted theme, falling back to the provided default. */
function readStoredTheme(storageKey: string, defaultTheme: Theme): Theme {
  if (typeof window === "undefined") return defaultTheme;
  try {
    const stored = window.localStorage.getItem(storageKey);
    return isTheme(stored) ? stored : defaultTheme;
  } catch {
    // localStorage may be unavailable (private mode, disabled cookies).
    return defaultTheme;
  }
}

/** Applies the theme by toggling `.dark` on the document root. */
function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Theme used when nothing is persisted. Defaults to "light". */
  defaultTheme?: Theme;
  /** localStorage key used to persist the choice. */
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "connect-hub-theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() =>
    readStoredTheme(storageKey, defaultTheme),
  );

  // Apply the class on mount and whenever the theme changes so the CSS
  // token set resolves across every page without a reload.
  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      setThemeState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Persistence is best-effort; the class toggle still applies.
      }
    },
    [storageKey],
  );

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = React.useMemo<ThemeProviderState>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

/** Access the current theme and setters. Must be used within a ThemeProvider. */
export function useTheme(): ThemeProviderState {
  const context = React.useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
