import { Globe } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export function AppHeader() {
  const { t, language, toggleLanguage } = useTranslation();

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b" data-testid="app-header">
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-sm font-bold">KM</span>
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight" data-testid="text-app-name">{t("appName")}</h1>
            <p className="text-[10px] text-primary leading-tight">{t("appTagline")}</p>
          </div>
        </div>
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm hover-elevate"
          data-testid="button-header-language"
        >
          <Globe className="w-4 h-4" />
          <span className="font-medium">{language === "hi" ? "हिंदी" : "EN"}</span>
        </button>
      </div>
    </header>
  );
}
