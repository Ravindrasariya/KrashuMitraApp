import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageContext, useLanguage } from "@/lib/i18n";
import { BottomNav } from "@/components/bottom-nav";
import { SidebarNav } from "@/components/sidebar-nav";
import { AppHeader } from "@/components/header";
import { Chatbot } from "@/components/chatbot";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import FarmManagementPage from "@/pages/farm-management";
import AuthPage from "@/pages/auth-page";
import PlaceholderPage from "@/pages/placeholder-page";
import AdminPage from "@/pages/admin-page";
import FarmKhataPage from "@/pages/farm-khata";
import DigitalClinicPage from "@/pages/digital-clinic";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/farm-management" component={FarmManagementPage} />
      <Route path="/digital-clinic" component={DigitalClinicPage} />
      <Route path="/marketplace">
        <PlaceholderPage titleKey="marketplace" />
      </Route>
      <Route path="/farm-khata" component={FarmKhataPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  return (
    <div className="min-h-screen bg-background flex">
      <SidebarNav />
      <div className="flex-1 flex flex-col min-h-screen">
        <AppHeader />
        <main className="flex-1">
          <Router />
        </main>
        <BottomNav />
      </div>
      <Chatbot />
    </div>
  );
}

function App() {
  const langContext = useLanguage();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageContext.Provider value={langContext}>
          <AppContent />
          <Toaster />
        </LanguageContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
