import { useTranslation } from "react-i18next";

import VoiceAgentWidget from "@/components/VoiceAgentWidget";

/**
 * Public, unauthenticated page hosting the ElevenLabs voice-call widget.
 * Every other route in this app sits behind ProtectedRoute (staff-only) --
 * this is deliberately the one customer-facing surface, since callers can't
 * hold a staff JWT.
 */
const SupportPage = () => {
  const { t } = useTranslation();

  return (
    <main
      id="main-content"
      role="main"
      className="flex h-full min-h-screen w-full overflow-y-auto items-center justify-center bg-background px-4 py-8"
    >
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("supportPage.title")}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {t("supportPage.description")}
        </p>
        <div className="mt-8">
          <VoiceAgentWidget />
        </div>
      </div>
    </main>
  );
};

export default SupportPage;
