// Mid-conversation language switcher (G11, G12).
// Changing language updates direction immediately and persists the choice,
// without losing session context (context lives server-side in Redis).
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Languages } from "lucide-react";

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="flex items-center gap-2">
      <Languages className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Select
        value={i18n.language?.startsWith("ar") ? "ar" : "en"}
        onValueChange={changeLanguage}
      >
        <SelectTrigger
          className="h-9 min-w-[44px] w-[120px]"
          aria-label={t("language.label")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">{t("language.english")}</SelectItem>
          <SelectItem value="ar">{t("language.arabic")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
