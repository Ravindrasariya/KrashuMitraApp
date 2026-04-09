import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageContext, useLanguage, useTranslation } from "@/lib/i18n";
import { BottomNav } from "@/components/bottom-nav";
import { SidebarNav } from "@/components/sidebar-nav";
import { AppHeader } from "@/components/header";
import { Chatbot } from "@/components/chatbot";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import FarmManagementPage from "@/pages/farm-management";
import AuthPage from "@/pages/auth-page";
import MarketplacePage from "@/pages/marketplace";
import AdminPage from "@/pages/admin-page";
import FarmKhataPage from "@/pages/farm-khata";
import DigitalClinicPage from "@/pages/digital-clinic";
import ProfilePage from "@/pages/profile";
import { useState, useEffect, useCallback } from "react";
import logoPath from "@assets/Gemini_Generated_Image_lu75dlu75dlu75dl(1)_1772735328079.png";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/farm-management" component={FarmManagementPage} />
      <Route path="/digital-clinic" component={DigitalClinicPage} />
      <Route path="/marketplace" component={MarketplacePage} />
      <Route path="/farm-khata" component={FarmKhataPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 2000);
    const removeTimer = setTimeout(() => onComplete(), 2500);
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer); };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] bg-white dark:bg-background flex flex-col items-center justify-center transition-opacity duration-500 ${fading ? "opacity-0" : "opacity-100"}`}
    >
      <img src={logoPath} alt="KrashuVed" className="w-28 h-28 rounded-full object-cover mb-6" />
      <h1 className="text-3xl font-bold mb-3">
        <span className="text-green-600">Krashu</span>
        <span className="text-orange-600">Ved</span>
      </h1>
      <p className="text-lg font-semibold">
        <span className="text-green-600">आपका विश्वास</span>
        <span className="text-muted-foreground">, </span>
        <span className="text-orange-600">हमारी प्राथमिकता</span>
      </p>
    </div>
  );
}

function KrashuVedBrand() {
  return (
    <>
      <span className="text-green-600 font-semibold">Krashu</span>
      <span className="text-orange-600 font-semibold">Ved</span>
    </>
  );
}

function AppFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t bg-muted/30 px-4 py-4 mb-16 md:mb-0" data-testid="section-footer">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col items-center text-center md:flex-row md:text-left md:items-center md:justify-between gap-2">
          <div className="text-sm text-muted-foreground" data-testid="text-footer-help">
            {t("needHelp")} <KrashuVedBrand /> - +918882589392
          </div>
          <div className="flex flex-col items-center md:flex-row md:items-center gap-1 md:gap-3 text-sm text-muted-foreground">
            <span data-testid="text-footer-powered">{t("poweredBy")} <KrashuVedBrand /></span>
            <span data-testid="text-footer-rights">{t("allRightsReserved")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function AppContent() {
  useEffect(() => {
    let vid = localStorage.getItem("krashu-visitor-id");
    if (!vid) {
      vid = crypto.randomUUID();
      localStorage.setItem("krashu-visitor-id", vid);
    }
    fetch("/api/track-visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: vid }),
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SidebarNav />
      <AppHeader />
      <main className="flex-1">
        <Router />
      </main>
      <AppFooter />
      <BottomNav />
      <Chatbot />
    </div>
  );
}

function App() {
  const langContext = useLanguage();
  const [showSplash, setShowSplash] = useState(true);
  const hideSplash = useCallback(() => setShowSplash(false), []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageContext.Provider value={langContext}>
          {showSplash && <SplashScreen onComplete={hideSplash} />}
          <AppContent />
          <Toaster />
        </LanguageContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
