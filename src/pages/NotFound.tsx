import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

/**
 * Fallback page for unmatched routes (Requirement 22).
 *
 * The message and recovery control are fully token-styled and internationalized
 * (Requirement 22.1). The return control is a single-activation, keyboard
 * accessible link that performs client-side navigation to the default landing
 * page "/" (Requirement 22.2). The centered, width-constrained layout keeps
 * content within the viewport without horizontal overflow across all reference
 * breakpoints in both LTR and RTL (Requirement 22.3).
 */
const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <main
      id="main-content"
      role="main"
      className="flex h-full min-h-screen w-full overflow-y-auto items-center justify-center bg-background px-4 py-8"
    >
      <div className="w-full max-w-md text-center">
        <p className="text-6xl font-bold tracking-tight text-primary">
          {t("notFoundPage.code")}
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">
          {t("notFoundPage.title")}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {t("notFoundPage.description")}
        </p>
        <Button asChild className="mt-6">
          <Link to="/">{t("notFoundPage.returnHome")}</Link>
        </Button>
      </div>
    </main>
  );
};

export default NotFound;
