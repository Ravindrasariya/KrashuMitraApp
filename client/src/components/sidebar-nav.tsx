import { useLocation, Link } from "wouter";
import { Home, Stethoscope, ShoppingBag, Sprout, BookOpen, Globe, LogOut, User } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { path: "/", icon: Home, labelKey: "home" as const },
  { path: "/farm-management", icon: Sprout, labelKey: "farmManagement" as const },
  { path: "/digital-clinic", icon: Stethoscope, labelKey: "digitalClinic" as const },
  { path: "/marketplace", icon: ShoppingBag, labelKey: "marketplace" as const },
  { path: "/farm-khata", icon: BookOpen, labelKey: "farmKhata" as const },
];

export function SidebarNav() {
  const [location] = useLocation();
  const { t, language, toggleLanguage } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();

  const { data: profile } = useQuery<{ farmerCode: string }>({
    queryKey: ["/api/farmer/profile"],
    enabled: isAuthenticated,
  });

  return (
    <aside
      className="hidden md:flex flex-col w-60 border-r bg-background h-screen sticky top-0 z-40 shrink-0"
      data-testid="sidebar-nav"
    >
      <div className="flex items-center gap-2.5 px-5 h-16 border-b shrink-0">
        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
          <span className="text-primary-foreground text-sm font-bold">KM</span>
        </div>
        <div>
          <h1 className="text-sm font-bold leading-tight" data-testid="text-sidebar-app-name">{t("appName")}</h1>
          <p className="text-[10px] text-primary leading-tight">{t("appTagline")}</p>
        </div>
      </div>

      <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const isActive = location === item.path;
          return (
            <Link key={item.path} href={item.path}>
              <button
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                data-testid={`sidebar-nav-${item.labelKey}`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5px]" : ""}`} />
                <span>{t(item.labelKey)}</span>
              </button>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4 space-y-1 shrink-0">
        <Separator className="mb-3" />

        <button
          onClick={toggleLanguage}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          data-testid="sidebar-language-toggle"
        >
          <Globe className="w-5 h-5" />
          <span>{language === "hi" ? "English" : "हिंदी"}</span>
        </button>

        {isAuthenticated ? (
          <>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <User className="w-5 h-5 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" data-testid="sidebar-username">
                  {user?.firstName || user?.email || "User"}
                </p>
                {profile?.farmerCode && (
                  <p className="text-[11px] text-primary font-medium truncate" data-testid="sidebar-farmer-code">
                    {profile.farmerCode}
                  </p>
                )}
                {user?.phoneNumber && (
                  <p className="text-[11px] text-muted-foreground truncate">+91 {user.phoneNumber}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => logout()}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
              data-testid="sidebar-logout"
            >
              <LogOut className="w-5 h-5" />
              <span>{t("logout")}</span>
            </button>
          </>
        ) : (
          <Link
            href="/auth"
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            data-testid="sidebar-login"
          >
            <User className="w-5 h-5 text-primary" />
            <span>{t("login")}</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
