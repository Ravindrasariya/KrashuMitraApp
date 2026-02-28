import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Trash2, Plus, Sprout, Droplets, Bug, Leaf } from "lucide-react";
import { AddEventDialog } from "@/components/add-event-dialog";
import { CropTimeline } from "@/components/crop-timeline";
import type { CropCard, CropEvent } from "@shared/schema";
import { format } from "date-fns";

const eventIcons: Record<string, typeof Sprout> = {
  plantation: Sprout,
  fertiliser: Leaf,
  pesticide: Bug,
  watering: Droplets,
};

const eventColors: Record<string, string> = {
  plantation: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  fertiliser: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  pesticide: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  watering: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

interface CropCardItemProps {
  card: CropCard;
  onDelete: () => void;
}

export function CropCardItem({ card, onDelete }: CropCardItemProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: events = [], isLoading: eventsLoading } = useQuery<CropEvent[]>({
    queryKey: ["/api/crop-cards", card.id, "events"],
    queryFn: async () => {
      const res = await fetch(`/api/crop-cards/${card.id}/events`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    enabled: isOpen,
  });

  const toggleMutation = useMutation({
    mutationFn: (eventId: number) => apiRequest("POST", `/api/crop-events/${eventId}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crop-cards", card.id, "events"] });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: number) => apiRequest("DELETE", `/api/crop-events/${eventId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crop-cards", card.id, "events"] });
    },
  });

  const completedCount = events.filter(e => e.isCompleted).length;
  const totalCount = events.length;
  const isActive = card.status === "active";

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="relative" data-testid={`card-crop-${card.id}`}>
        <CollapsibleTrigger className="w-full text-left" data-testid={`button-expand-crop-${card.id}`}>
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isActive ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
                }`}>
                  <Sprout className={`w-5 h-5 ${isActive ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base truncate" data-testid={`text-crop-name-${card.id}`}>
                      {card.cropName}
                    </h3>
                    {card.variety && (
                      <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0" data-testid={`text-variety-${card.id}`}>
                        {card.variety}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    {card.farmName && (
                      <>
                        <span className="truncate" data-testid={`text-farm-name-${card.id}`}>{card.farmName}</span>
                        <span>·</span>
                      </>
                    )}
                    <span>{format(new Date(card.startDate), "dd MMM yyyy")}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className="text-xs no-default-active-elevate"
                  data-testid={`badge-status-${card.id}`}
                >
                  {isActive ? t("active") : t("completed")}
                </Badge>
                {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>

            {totalCount > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${(completedCount / totalCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {completedCount}/{totalCount}
                </span>
              </div>
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 border-t pt-3">
            <CropTimeline
              events={events}
              isLoading={eventsLoading}
              onToggle={(id) => toggleMutation.mutate(id)}
              onDelete={(id) => deleteEventMutation.mutate(id)}
            />

            <div className="flex items-center justify-between gap-2 mt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddEvent(true)}
                data-testid={`button-add-event-${card.id}`}
              >
                <Plus className="w-3 h-3 mr-1" />
                {t("addEvent")}
              </Button>

              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-destructive">{t("deleteConfirm")}</span>
                  <Button size="sm" variant="destructive" onClick={onDelete} data-testid={`button-confirm-delete-${card.id}`}>
                    {t("yes")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                    {t("no")}
                  </Button>
                </div>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid={`button-delete-crop-${card.id}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Card>

      <AddEventDialog
        open={showAddEvent}
        onOpenChange={setShowAddEvent}
        cropCardId={card.id}
      />
    </Collapsible>
  );
}
