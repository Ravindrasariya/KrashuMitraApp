import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Plus, Sprout } from "lucide-react";
import { CropCardItem } from "@/components/crop-card-item";
import { AddCropCardDialog } from "@/components/add-crop-card-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { CropCard } from "@shared/schema";

export default function FarmManagementPage() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: cropCards, isLoading } = useQuery<CropCard[]>({
    queryKey: ["/api/crop-cards"],
    enabled: isAuthenticated,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/crop-cards/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crop-cards"] });
    },
  });

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 pb-20 md:pb-8" data-testid="page-farm-management-login">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Sprout className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-2">{t("farmManagement")}</h2>
        <p className="text-sm text-muted-foreground mb-4 text-center">{t("loginRequired")}</p>
        <a href="/api/login">
          <Button data-testid="button-login-farm">{t("login")}</Button>
        </a>
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-8" data-testid="page-farm-management">
      <div className="px-4 md:px-8 pt-4 pb-2 max-w-lg md:max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-bold" data-testid="text-my-crop-cards">{t("myCropCards")}</h2>
          <Button
            size="sm"
            onClick={() => setShowAddDialog(true)}
            data-testid="button-add-crop-card"
          >
            <Plus className="w-4 h-4 mr-1" />
            {t("addCropCard")}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 w-full rounded-md" />
            ))}
          </div>
        ) : cropCards && cropCards.length > 0 ? (
          <div className="space-y-3">
            {cropCards.map(card => (
              <CropCardItem
                key={card.id}
                card={card}
                onDelete={() => deleteMutation.mutate(card.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-4">
              <Sprout className="w-10 h-10 text-primary/40" />
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-no-cards">{t("noCropCards")}</p>
          </div>
        )}
      </div>

      <AddCropCardDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
    </div>
  );
}
