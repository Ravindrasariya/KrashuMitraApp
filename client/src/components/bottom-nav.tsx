import { useLocation, Link } from "wouter";
import { Home, Stethoscope, ShoppingBag, Sprout, BookOpen } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const navItems = [
  { path: "/", icon: Home, labelKey: "home" as const },
  { path: "/marketplace", icon: ShoppingBag, labelKey: "navMarket" as const },
  { path: "/farm-management", icon: Sprout, labelKey: "navCrops" as const },
  { path: "/farm-khata", icon: BookOpen, labelKey: "navKhata" as const },
  { path: "/digital-clinic", icon: Stethoscope, labelKey: "navClinic" as const },
];

export function BottomNav() {
  const [location] = useLocation();
  const { t } = useTranslation();

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
      </div>
    </nav>
  );
}
