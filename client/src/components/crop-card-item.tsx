import { useState, useMemo } from "react";
import { useTranslation } from "@/lib/i18n";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Trash2, Plus, Sprout, Archive, ArchiveRestore, CalendarClock, CloudRain, Lightbulb, Loader2, AlertTriangle, Info } from "lucide-react";
import { AddEventDialog } from "@/components/add-event-dialog";
import { CropTimeline } from "@/components/crop-timeline";
import type { CropCard, CropEvent } from "@shared/schema";
import { format } from "date-fns";

interface CropCardItemProps {
  card: CropCard;
  onDelete: () => void;
  onArchive: () => void;
}

interface SuggestionData {
  nextActivity: { name: string; daysFromNow: number; description: string } | null;
  weatherWarning: { message: string; severity: "info" | "warning" | "danger" } | null;
  suggestion: string | null;
}

function getLocationFromCache(): { lat: number; lng: number } {
  try {
    const raw = localStorage.getItem("krashu-weather-cache");
    if (raw) {
      const data = JSON.parse(raw);
      if (data.lat && data.lng) return { lat: data.lat, lng: data.lng };
    }
  } catch {}
  return { lat: 28.6139, lng: 77.2090 };
}

export function CropCardItem({ card, onDelete, onArchive }: CropCardItemProps) {
  const { t, language } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CropEvent | null>(null);
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

  const isActive = card.status === "active" && !card.isArchived;

  const location = useMemo(() => getLocationFromCache(), []);

  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<SuggestionData>({
    queryKey: ["/api/crop-cards", card.id, "suggestions", language],
    queryFn: async () => {
      const res = await fetch(
        `/api/crop-cards/${card.id}/suggestions?lat=${location.lat}&lng=${location.lng}&lang=${language}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isActive,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });

  const toggleMutation = useMutation({
    mutationFn: (eventId: number) => apiRequest("POST", `/api/crop-events/${eventId}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crop-cards", card.id, "events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crop-cards", card.id, "suggestions"] });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: number) => apiRequest("DELETE", `/api/crop-events/${eventId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crop-cards", card.id, "events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crop-cards", card.id, "suggestions"] });
    },
  });

  const completedCount = events.filter(e => e.isCompleted).length;
  const totalCount = events.length;

  const severityColors = {
    info: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    warning: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    danger: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
  };

  const SeverityIcon = ({ severity }: { severity: string }) => {
    if (severity === "danger") return <AlertTriangle className="w-3.5 h-3.5" />;
    if (severity === "warning") return <CloudRain className="w-3.5 h-3.5" />;
    return <Info className="w-3.5 h-3.5" />;
  };

  function formatDaysLabel(days: number): string {
    if (days === 0) return t("today");
    if (days < 0) return `${Math.abs(days)} ${language === "hi" ? "दिन पहले" : "days ago"}`;
    if (language === "hi") return `${days} ${t("inDays")}`;
    return `${days} ${t("inDays")}`;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={`relative ${card.isArchived ? "opacity-60" : ""}`} data-testid={`card-crop-${card.id}`}>
        <CollapsibleTrigger className={`w-full text-left ${isOpen ? "sticky top-16 md:top-0 z-10 bg-card rounded-t-xl shadow-sm" : ""}`} data-testid={`button-expand-crop-${card.id}`}>
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

            {isActive && suggestionsLoading && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid={`suggestion-loading-${card.id}`}>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{t("loadingSuggestions")}</span>
              </div>
            )}

            {isActive && suggestions?.nextActivity && !suggestionsLoading && (
              <div className="mt-2 flex items-center gap-2 flex-wrap" data-testid={`suggestion-strip-${card.id}`}>
                <div className="flex items-center gap-1.5 text-xs">
                  <CalendarClock className="w-3.5 h-3.5 text-primary" />
                  <span className="font-medium text-foreground">{suggestions.nextActivity.name}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 no-default-active-elevate ${
                      suggestions.nextActivity.daysFromNow < 0
                        ? "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
                        : suggestions.nextActivity.daysFromNow === 0
                          ? "border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400"
                          : "border-primary/30 text-primary"
                    }`}
                    data-testid={`badge-days-${card.id}`}
                  >
                    {suggestions.nextActivity.daysFromNow < 0
                      ? t("overdue")
                      : formatDaysLabel(suggestions.nextActivity.daysFromNow)}
                  </Badge>
                </div>
                {suggestions.weatherWarning && (
                  <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                    suggestions.weatherWarning.severity === "danger"
                      ? "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/40"
                      : suggestions.weatherWarning.severity === "warning"
                        ? "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40"
                        : "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/40"
                  }`} data-testid={`weather-warning-badge-${card.id}`}>
                    <SeverityIcon severity={suggestions.weatherWarning.severity} />
                  </div>
                )}
              </div>
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 border-t pt-3">
            {isActive && suggestions && (suggestions.nextActivity || suggestions.weatherWarning || suggestions.suggestion) && (
              <div className="mb-4 space-y-2" data-testid={`suggestions-detail-${card.id}`}>
                {suggestions.nextActivity && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10" data-testid={`next-activity-detail-${card.id}`}>
                    <CalendarClock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{suggestions.nextActivity.name}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 no-default-active-elevate ${
                            suggestions.nextActivity.daysFromNow < 0
                              ? "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"
                              : "border-primary/30 text-primary"
                          }`}
                        >
                          {formatDaysLabel(suggestions.nextActivity.daysFromNow)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{suggestions.nextActivity.description}</p>
                    </div>
                  </div>
                )}

                {suggestions.weatherWarning && (
                  <div className={`flex items-start gap-2 p-2.5 rounded-lg border ${severityColors[suggestions.weatherWarning.severity]}`} data-testid={`weather-warning-detail-${card.id}`}>
                    <SeverityIcon severity={suggestions.weatherWarning.severity} />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold">{t("weatherAlert")}</span>
                      <p className="text-xs mt-0.5">{suggestions.weatherWarning.message}</p>
                    </div>
                  </div>
                )}

                {suggestions.suggestion && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800" data-testid={`ai-suggestion-detail-${card.id}`}>
                    <Lightbulb className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{t("aiSuggestion")}</span>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{suggestions.suggestion}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <CropTimeline
              events={events}
              isLoading={eventsLoading}
              onToggle={(id) => toggleMutation.mutate(id)}
              onDelete={(id) => deleteEventMutation.mutate(id)}
              onEdit={(event) => setEditingEvent(event)}
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
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={onArchive}
                    data-testid={`button-archive-crop-${card.id}`}
                  >
                    {card.isArchived
                      ? <ArchiveRestore className="w-4 h-4 text-amber-600" />
                      : <Archive className="w-4 h-4 text-muted-foreground" />
                    }
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowDeleteConfirm(true)}
                    data-testid={`button-delete-crop-${card.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
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

      <AddEventDialog
        open={!!editingEvent}
        onOpenChange={(open) => { if (!open) setEditingEvent(null); }}
        cropCardId={card.id}
        editEvent={editingEvent}
      />
    </Collapsible>
  );
}
