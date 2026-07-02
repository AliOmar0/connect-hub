// Token-styled, accessible theme toggle switching between light and dark.
// Accessible name is provided via i18n; a non-icon text alternative is exposed
// to assistive technology so the control never relies on the icon alone.
// Requirements: 11.4, 19.5, 19.7
import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export default function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";
  // The label names the action the control performs (switch to the other theme).
  const label = isDark ? t("theme.switchToLight") : t("theme.switchToDark");

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
