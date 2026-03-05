import { useLocation, Link } from "wouter";
import { Home, Stethoscope, ShoppingBag, Sprout, BookOpen, Globe, LogOut, User, Shield, ChevronDown } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import logoPath from "@assets/Gemini_Generated_Image_lu75dlu75dlu75dl(1)_1772735328079.png";

const navItems = [
  { path: "/", icon: Home, labelKey: "home" as const },
  { path: "/farm-management", icon: Sprout, labelKey: "farmManagement" as const },
  { path: "/digital-clinic", icon: Stethoscope, labelKey: "digitalClinic" as const },
  { path: "/marketplace", icon: ShoppingBag, labelKey: "marketplace" as const },
  { path: "/farm-khata", icon: BookOpen, labelKey: "farmKhata" as const },
];

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

export function SidebarNav() {
  const [location] = useLocation();
  const { t, language, toggleLanguage } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const { data: profile } = useQuery<{ farmerCode: string }>({
    queryKey: ["/api/farmer/profile"],
    enabled: isAuthenticated,
  });

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
    <header
      className="hidden md:flex items-center justify-center h-16 border-b bg-background/95 backdrop-blur sticky top-0 z-50 px-4 gap-3 shrink-0"
      data-testid="sidebar-nav"
    >
      <Link href="/">
        <div className="flex items-center gap-2 shrink-0 cursor-pointer">
          <img src={logoPath} alt="Logo" className="w-10 h-10 rounded-full object-cover" />
          <div className="leading-none">
            <h1 className="text-lg font-bold leading-tight" data-testid="text-sidebar-app-name">{t("appName")}</h1>
            <BrandingText language={language} />
          </div>
        </div>
      </Link>

      <nav className="flex items-center gap-1 overflow-x-auto">
        {navItems.map(item => {
          const isActive = location === item.path;
          return (
            <Link key={item.path} href={item.path}>
              <button
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-bold"
                    : "text-muted-foreground font-medium hover:bg-muted hover:text-foreground"
                }`}
                data-testid={`sidebar-nav-${item.labelKey}`}
              >
                <item.icon className={`w-4 h-4 ${isActive ? "stroke-[2.5px]" : ""}`} />
                <span>{t(item.labelKey)}</span>
              </button>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm hover:bg-muted transition-colors"
          data-testid="sidebar-language-toggle"
        >
          <Globe className="w-4 h-4" />
          <span className="font-medium">{language === "hi" ? "EN" : "हिंदी"}</span>
        </button>

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
            data-testid="button-profile-menu"
          >
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${profileOpen ? "rotate-180" : ""}`} />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-background border rounded-lg shadow-lg z-50 py-1" data-testid="profile-dropdown">
              {isAuthenticated ? (
                <>
                  <Link href="/profile" onClick={() => setProfileOpen(false)}>
                    <div className="px-3 py-2.5 hover:bg-muted cursor-pointer" data-testid="dropdown-profile-link">
                      <p className="text-sm font-medium truncate">{user?.firstName || user?.email || "User"}</p>
                      {profile?.farmerCode && (
                        <p className="text-[11px] text-primary font-medium">{profile.farmerCode}</p>
                      )}
                      {user?.phoneNumber && (
                        <p className="text-[11px] text-muted-foreground">+91 {user.phoneNumber}</p>
                      )}
                    </div>
                  </Link>
                  {user?.isAdmin && (
                    <Link href="/admin" onClick={() => setProfileOpen(false)}>
                      <div className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted cursor-pointer" data-testid="dropdown-admin-link">
                        <Shield className="w-4 h-4" />
                        <span>{t("admin")}</span>
                      </div>
                    </Link>
                  )}
                  <div className="border-t my-1" />
                  <button
                    onClick={() => { logout(); setProfileOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    data-testid="dropdown-logout"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t("logout")}</span>
                  </button>
                </>
              ) : (
                <Link href="/auth" onClick={() => setProfileOpen(false)}>
                  <div className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted cursor-pointer" data-testid="dropdown-login">
                    <User className="w-4 h-4 text-primary" />
                    <span>{t("login")}</span>
                  </div>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
