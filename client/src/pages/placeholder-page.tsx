import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { Construction } from "lucide-react";

interface PlaceholderPageProps {
  titleKey: TranslationKey;
}

export default function PlaceholderPage({ titleKey }: PlaceholderPageProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 pb-20 md:pb-8" data-testid={`page-${titleKey}`}>
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Construction className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-bold mb-2">{t(titleKey)}</h2>
      <p className="text-sm text-muted-foreground text-center">{t("featureComingSoon")}</p>
    </div>
  );
}
