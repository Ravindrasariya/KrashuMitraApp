import { useLocation, Link } from "wouter";
import { Home, Stethoscope, ShoppingBag, Sprout, BookOpen, Menu, LogOut, User, Globe, Shield } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";

const navItems = [
  { path: "/", icon: Home, labelKey: "home" as const },
  { path: "/digital-clinic", icon: Stethoscope, labelKey: "digitalClinic" as const },
  { path: "/marketplace", icon: ShoppingBag, labelKey: "marketplace" as const },
  { path: "/farm-management", icon: Sprout, labelKey: "farmManagement" as const },
  { path: "/farm-khata", icon: BookOpen, labelKey: "farmKhata" as const },
];

export function BottomNav() {
  const [location] = useLocation();
  const { t, language, toggleLanguage } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t safe-area-bottom md:hidden" data-testid="bottom-nav">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-1">
        {navItems.map(item => {
          const isActive = location === item.path;
          return (
            <Link key={item.path} href={item.path}>
              <button
                className={`flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-md transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
                data-testid={`nav-${item.labelKey}`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5px]" : ""}`} />
                <span className="text-[10px] font-medium leading-tight truncate">{t(item.labelKey)}</span>
              </button>
            </Link>
          );
        })}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button
              className="flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-md text-muted-foreground"
              data-testid="nav-more"
            >
              <Menu className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight">{t("more")}</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-8">
            <div className="space-y-2 pt-4">
              <button
                onClick={toggleLanguage}
                className="flex items-center gap-3 w-full p-3 rounded-md hover-elevate"
                data-testid="button-language-toggle"
              >
                <Globe className="w-5 h-5 text-primary" />
                <span className="font-medium">{language === "hi" ? "English" : "हिंदी"}</span>
              </button>

              <Separator />

              {isAuthenticated ? (
                <>
                  <div className="flex items-center gap-3 p-3">
                    <User className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-medium" data-testid="text-username">
                        {user?.firstName || user?.email || "User"}
                      </p>
                      {user?.phoneNumber && (
                        <p className="text-xs text-muted-foreground">+91 {user.phoneNumber}</p>
                      )}
                    </div>
                  </div>
                  <Separator />
                  <button
                    onClick={() => { logout(); setSheetOpen(false); }}
                    className="flex items-center gap-3 w-full p-3 rounded-md hover-elevate text-destructive"
                    data-testid="button-logout"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">{t("logout")}</span>
                  </button>
                </>
              ) : (
                <Link
                  href="/auth"
                  onClick={() => setSheetOpen(false)}
                  className="flex items-center gap-3 w-full p-3 rounded-md hover-elevate"
                  data-testid="button-login"
                >
                  <User className="w-5 h-5 text-primary" />
                  <span className="font-medium">{t("login")}</span>
                </Link>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
