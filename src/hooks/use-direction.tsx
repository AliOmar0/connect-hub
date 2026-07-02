import * as React from "react";
import { useTranslation } from "react-i18next";

export type Direction = "ltr" | "rtl";

/**
 * Reports the active document Direction ("ltr" | "rtl") derived from the
 * current i18n language via `i18n.dir()`, updating when the language changes.
 */
export function useDirection(): Direction {
  const { i18n } = useTranslation();

  const getDirection = React.useCallback(
    (): Direction => (i18n.dir() === "rtl" ? "rtl" : "ltr"),
    [i18n],
  );

  const [direction, setDirection] = React.useState<Direction>(getDirection);

  React.useEffect(() => {
    const onLanguageChanged = () => setDirection(getDirection());
    i18n.on("languageChanged", onLanguageChanged);
    // Sync immediately in case the language changed before this effect ran.
    setDirection(getDirection());
    return () => {
      i18n.off("languageChanged", onLanguageChanged);
    };
  }, [i18n, getDirection]);

  return direction;
}
