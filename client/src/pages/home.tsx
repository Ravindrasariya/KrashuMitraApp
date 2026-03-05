import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sprout, Stethoscope, ShoppingBag, BookOpen, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { WeatherWidget } from "@/components/weather-widget";
import { useState, useEffect, useCallback } from "react";
import type { Banner } from "@shared/schema";

type BannerWithImage = Banner & { hasImage: boolean };

function BannerCarousel({ banners, language }: { banners: BannerWithImage[]; language: string }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => {
    setCurrent(c => (c + 1) % banners.length);
  }, [banners.length]);

  const prev = useCallback(() => {
    setCurrent(c => (c - 1 + banners.length) % banners.length);
  }, [banners.length]);

  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const timer = setInterval(next, 4500);
    return () => clearInterval(timer);
  }, [banners.length, paused, next]);

  if (banners.length === 0) return null;

  const banner = banners[current];

  return (
    <div
      className="relative overflow-hidden rounded-xl md:rounded-2xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-testid="banner-carousel"
    >
      <div className="relative min-h-[180px] md:min-h-[253px]">
        {banner.type === "text" ? (
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 py-8 md:px-12 md:py-10 min-h-[180px] md:min-h-[253px] flex flex-col justify-center">
            <h2 className="text-2xl md:text-3xl font-bold leading-tight mb-2" data-testid="text-banner-heading">
              {language === "hi" ? banner.headingHi : banner.headingEn}
            </h2>
            {(banner.subHeadingHi || banner.subHeadingEn) && (
              <p className="text-base md:text-lg font-medium text-foreground/80 mb-1" data-testid="text-banner-subheading">
                {language === "hi" ? banner.subHeadingHi : banner.subHeadingEn}
              </p>
            )}
            {(banner.descriptionHi || banner.descriptionEn) && (
              <p className="text-sm md:text-base text-muted-foreground md:max-w-xl" data-testid="text-banner-description">
                {language === "hi" ? banner.descriptionHi : banner.descriptionEn}
              </p>
            )}
          </div>
        ) : (
          <div className="relative min-h-[180px] md:min-h-[253px]">
            {banner.hasImage && (
              <img
                src={`/api/banners/${banner.id}/image`}
                alt=""
                className="w-full h-[180px] md:h-[220px] object-cover"
                data-testid="img-banner"
              />
            )}
            {(banner.captionHi || banner.captionEn) && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-6 py-4">
                <p className="text-white text-sm md:text-base font-medium" data-testid="text-banner-caption">
                  {language === "hi" ? banner.captionHi : banner.captionEn}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {banners.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 flex items-center justify-center shadow hover:bg-background transition-colors"
            data-testid="button-banner-prev"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 flex items-center justify-center shadow hover:bg-background transition-colors"
            data-testid="button-banner-next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {banners.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className={`w-2 h-2 rounded-full transition-colors ${idx === current ? "bg-primary" : "bg-muted-foreground/30"}`}
                data-testid={`button-banner-dot-${idx}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function HomePage() {
  const { t, language } = useTranslation();
  const { user, isAuthenticated, isLoading } = useAuth();

  const { data: banners = [] } = useQuery<BannerWithImage[]>({
    queryKey: ["/api/banners"],
  });

  return (
    <div className="pb-20 md:pb-8" data-testid="page-home">
      <div className="px-4 md:px-12 pt-6 md:pt-8 pb-4">
        <div className="max-w-lg md:max-w-5xl mx-auto">
          <div className="flex items-start justify-between mb-4">
            <div>
              {isAuthenticated && user && (
                <p className="text-sm text-muted-foreground" data-testid="text-welcome">
                  {t("welcome")}, <span className="font-semibold text-foreground">{user.firstName || user.email}</span>
                </p>
              )}
              {!isAuthenticated && !isLoading && (
                <Link href="/auth">
                  <Button size="sm" data-testid="button-hero-login">
                    {t("getStarted")}
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
            <WeatherWidget />
          </div>
        </div>
      </div>

      <div className="px-4 md:px-12 pb-6">
        <div className="max-w-lg md:max-w-5xl mx-auto">
          {banners.length > 0 ? (
            <BannerCarousel banners={banners} language={language} />
          ) : (
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background rounded-xl md:rounded-2xl px-6 py-8 md:px-12 md:py-10 min-h-[180px] md:min-h-[253px] flex flex-col justify-center">
              <h2 className="text-2xl md:text-3xl font-bold leading-tight mb-2" data-testid="text-hero-title">
                {t("heroTitle")}
              </h2>
              <p className="text-sm md:text-base text-muted-foreground mb-5 md:max-w-xl" data-testid="text-hero-subtitle">
                {t("heroSubtitle")}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-lg md:max-w-5xl mx-auto">
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
                {t("clinicServices")}
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
                {t("marketplaceDesc")}
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
