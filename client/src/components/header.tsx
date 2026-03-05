import { Globe, User, LogOut, Shield, ChevronDown } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import logoPath from "@assets/Gemini_Generated_Image_lu75dlu75dlu75dl(1)_1772735328079.png";

function BrandingText({ language }: { language: string }) {
  if (language === "hi") {
    return (
      <p className="text-xs leading-tight mt-1">
        <span className="text-green-600 font-semibold">कृषु</span>
        <span className="text-orange-600 font-semibold">वेद</span>
        <span className="text-muted-foreground"> द्वारा</span>
      </p>
    );
  }
  return (
    <p className="text-xs leading-tight mt-1">
      <span className="text-muted-foreground">by </span>
      <span className="text-green-600 font-semibold">Krashu</span>
      <span className="text-orange-600 font-semibold">Ved</span>
    </p>
  );
}

export function AppHeader() {
  const { t, language, toggleLanguage } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b md:hidden" data-testid="app-header">
      <div className="flex items-center justify-between px-3 h-16 max-w-lg mx-auto">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer">
            <img src={logoPath} alt="Logo" className="w-10 h-10 rounded-full object-cover" />
            <div className="leading-none">
              <h1 className="text-base font-bold leading-tight" data-testid="text-app-name">{t("appName")}</h1>
              <BrandingText language={language} />
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors"
            data-testid="button-header-language"
          >
            <Globe className="w-4 h-4" />
            <span className="font-medium text-xs">{language === "hi" ? "EN" : "हिंदी"}</span>
          </button>

          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-0.5 px-1.5 py-1.5 rounded-md hover:bg-muted transition-colors"
              data-testid="button-mobile-profile"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${profileOpen ? "rotate-180" : ""}`} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-background border rounded-lg shadow-lg z-50 py-1" data-testid="mobile-profile-dropdown">
                {isAuthenticated ? (
                  <>
                    <Link href="/profile" onClick={() => setProfileOpen(false)}>
                      <div className="px-3 py-2.5 hover:bg-muted cursor-pointer" data-testid="mobile-dropdown-profile">
                        <p className="text-sm font-medium truncate">{user?.firstName || user?.email || "User"}</p>
                        {user?.phoneNumber && (
                          <p className="text-[11px] text-muted-foreground">+91 {user.phoneNumber}</p>
                        )}
                      </div>
                    </Link>
                    {user?.isAdmin && (
                      <Link href="/admin" onClick={() => setProfileOpen(false)}>
                        <div className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted cursor-pointer" data-testid="mobile-dropdown-admin">
                          <Shield className="w-4 h-4" />
                          <span>{t("admin")}</span>
                        </div>
                      </Link>
                    )}
                    <div className="border-t my-1" />
                    <button
                      onClick={() => { logout(); setProfileOpen(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                      data-testid="mobile-dropdown-logout"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{t("logout")}</span>
                    </button>
                  </>
                ) : (
                  <Link href="/auth" onClick={() => setProfileOpen(false)}>
                    <div className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted cursor-pointer" data-testid="mobile-dropdown-login">
                      <User className="w-4 h-4 text-primary" />
                      <span>{t("login")}</span>
                    </div>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
