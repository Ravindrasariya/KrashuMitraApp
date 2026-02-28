import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sprout, Stethoscope, ShoppingBag, BookOpen, Mic, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export default function HomePage() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading } = useAuth();

  return (
    <div className="pb-20 md:pb-8" data-testid="page-home">
      <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-background px-4 md:px-8 py-8 md:py-14">
        <div className="max-w-lg md:max-w-4xl mx-auto">
          {isAuthenticated && user && (
            <p className="text-sm text-muted-foreground mb-2" data-testid="text-welcome">
              {t("welcome")}, <span className="font-semibold text-foreground">{user.firstName || user.email}</span>
            </p>
          )}
          <h2 className="text-2xl md:text-3xl font-bold leading-tight mb-2" data-testid="text-hero-title">
            {t("heroTitle")}
          </h2>
          <p className="text-sm md:text-base text-muted-foreground mb-5 md:max-w-xl" data-testid="text-hero-subtitle">
            {t("heroSubtitle")}
          </p>
          {!isAuthenticated && !isLoading && (
            <a href="/api/login">
              <Button data-testid="button-hero-login">
                {t("getStarted")}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
          )}
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-lg md:max-w-4xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Link href="/farm-management">
            <Card className="p-4 md:p-5 hover-elevate cursor-pointer h-full" data-testid="card-farm-management">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                <Sprout className="w-5 h-5 md:w-6 md:h-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-semibold text-sm md:text-base mb-1">{t("farmManagement")}</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {t("myCropCards")}
              </p>
            </Card>
          </Link>

          <Link href="/digital-clinic">
            <Card className="p-4 md:p-5 hover-elevate cursor-pointer h-full" data-testid="card-digital-clinic">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-3">
                <Stethoscope className="w-5 h-5 md:w-6 md:h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-sm md:text-base mb-1">{t("digitalClinic")}</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {t("comingSoon")}
              </p>
            </Card>
          </Link>

          <Link href="/marketplace">
            <Card className="p-4 md:p-5 hover-elevate cursor-pointer h-full" data-testid="card-marketplace">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-3">
                <ShoppingBag className="w-5 h-5 md:w-6 md:h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="font-semibold text-sm md:text-base mb-1">{t("marketplace")}</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {t("comingSoon")}
              </p>
            </Card>
          </Link>

          <Link href="/farm-khata">
            <Card className="p-4 md:p-5 hover-elevate cursor-pointer h-full" data-testid="card-farm-khata">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-3">
                <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="font-semibold text-sm md:text-base mb-1">{t("farmKhata")}</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {t("comingSoon")}
              </p>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
