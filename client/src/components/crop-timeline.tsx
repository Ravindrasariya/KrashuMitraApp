import { useTranslation } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Sprout, Droplets, Bug, Leaf, Trash2, Circle } from "lucide-react";
import type { CropEvent } from "@shared/schema";
import { format } from "date-fns";

const eventIcons: Record<string, typeof Sprout> = {
  plantation: Sprout,
  fertiliser: Leaf,
  pesticide: Bug,
  watering: Droplets,
};

const eventBgColors: Record<string, string> = {
  plantation: "bg-green-500",
  fertiliser: "bg-amber-500",
  pesticide: "bg-red-500",
  watering: "bg-blue-500",
};

const eventLightBg: Record<string, string> = {
  plantation: "bg-green-50 dark:bg-green-950/30",
  fertiliser: "bg-amber-50 dark:bg-amber-950/30",
  pesticide: "bg-red-50 dark:bg-red-950/30",
  watering: "bg-blue-50 dark:bg-blue-950/30",
};

const eventTypeLabels: Record<string, Record<string, string>> = {
  plantation: { hi: "बुवाई", en: "Plantation" },
  fertiliser: { hi: "खाद", en: "Fertiliser" },
  pesticide: { hi: "कीटनाशक", en: "Pesticide" },
  watering: { hi: "सिंचाई", en: "Watering" },
};

interface CropTimelineProps {
  events: CropEvent[];
  isLoading: boolean;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}

export function CropTimeline({ events, isLoading, onToggle, onDelete }: CropTimelineProps) {
  const { t, language } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        {language === "hi" ? "कोई गतिविधि नहीं जोड़ी गई" : "No events added yet"}
      </p>
    );
  }

  return (
    <div className="relative" data-testid="crop-timeline">
      <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-border" />

      <div className="space-y-1">
        {events.map((event, index) => {
          const Icon = eventIcons[event.eventType] || Circle;
          const bgColor = eventBgColors[event.eventType] || "bg-muted";
          const lightBg = eventLightBg[event.eventType] || "bg-muted/50";
          const label = eventTypeLabels[event.eventType]?.[language] || event.eventType;

          return (
            <div
              key={event.id}
              className={`relative flex items-start gap-3 p-2 rounded-md transition-all ${lightBg}`}
              data-testid={`timeline-event-${event.id}`}
            >
              <button
                onClick={() => onToggle(event.id)}
                className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                  event.isCompleted
                    ? `${bgColor} text-white`
                    : "bg-background border-2 border-muted"
                }`}
                data-testid={`button-toggle-event-${event.id}`}
              >
                {event.isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Icon className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-xs font-semibold ${event.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                    {label}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(event.eventDate), "dd MMM")}
                    </span>
                    <button
                      onClick={() => onDelete(event.id)}
                      className="p-1 rounded hover-elevate"
                      data-testid={`button-delete-event-${event.id}`}
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
                {event.description && (
                  <p className={`text-xs mt-0.5 ${event.isCompleted ? "line-through text-muted-foreground" : "text-muted-foreground"}`}>
                    {event.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
