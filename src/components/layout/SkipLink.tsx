// SkipLink: the first focusable element in the App_Shell. It is visually hidden
// until it receives keyboard focus, and when activated it moves keyboard focus
// to the main content region (Requirement 4.6).
import { MouseEvent, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface SkipLinkProps {
  /** Id of the main content region to move focus to. Defaults to "main-content". */
  targetId?: string;
  className?: string;
}

/**
 * Moves keyboard focus (and scroll) to the target element. The target is made
 * programmatically focusable via a temporary tabindex when it is not natively
 * focusable, so focus lands inside the main region rather than staying on the link.
 */
function focusTarget(targetId: string) {
  if (typeof document === "undefined") return;
  const target = document.getElementById(targetId);
  if (!target) return;

  const hadTabIndex = target.hasAttribute("tabindex");
  if (!hadTabIndex) {
    target.setAttribute("tabindex", "-1");
  }

  target.focus();
  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView();
  }

  // Clean up the temporary tabindex once focus moves elsewhere so we do not
  // leave a non-interactive element in the tab order.
  if (!hadTabIndex) {
    const cleanup = () => {
      target.removeAttribute("tabindex");
      target.removeEventListener("blur", cleanup);
    };
    target.addEventListener("blur", cleanup);
  }
}

export default function SkipLink({
  targetId = "main-content",
  className,
}: SkipLinkProps) {
  const { t } = useTranslation();

  const handleActivate = (
    event: MouseEvent<HTMLAnchorElement> | KeyboardEvent<HTMLAnchorElement>,
  ) => {
    event.preventDefault();
    focusTarget(targetId);
  };

  return (
    <a
      href={`#${targetId}`}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          handleActivate(event);
        }
      }}
      className={cn(
        // Visually hidden until focused.
        "sr-only",
        // On focus, reveal as a token-styled, clearly visible control anchored
        // to the top-start corner, above all other content.
        "focus-visible:not-sr-only focus:not-sr-only",
        "focus:fixed focus:start-4 focus:top-4 focus:z-[100]",
        "focus:inline-flex focus:items-center focus:justify-center",
        "focus:min-h-[44px] focus:rounded-md focus:px-4 focus:py-2",
        "focus:bg-primary focus:text-primary-foreground focus:shadow-elevated",
        "focus:text-sm focus:font-medium focus:no-underline",
        className,
      )}
    >
      {t("accessibility.skipToContent")}
    </a>
  );
}
