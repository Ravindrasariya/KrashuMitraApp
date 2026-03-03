import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "@/lib/i18n";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sprout, Leaf, Bug, Droplets, Wheat } from "lucide-react";
import type { CropEvent } from "@shared/schema";

const eventFormSchema = z.object({
  eventType: z.string().min(1, "Required"),
  description: z.string().optional(),
  eventDate: z.string().min(1, "Required"),
  productionPerBigha: z.string().optional(),
});

type EventFormData = z.infer<typeof eventFormSchema>;

interface AddEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cropCardId: number;
  editEvent?: CropEvent | null;
}

const eventTypes = [
  { value: "plantation", icon: Sprout, color: "text-green-600" },
  { value: "fertiliser", icon: Leaf, color: "text-amber-600" },
  { value: "pesticide", icon: Bug, color: "text-red-600" },
  { value: "watering", icon: Droplets, color: "text-blue-600" },
  { value: "harvesting", icon: Wheat, color: "text-purple-600" },
];

const commonDescriptions: Record<string, string[]> = {
  fertiliser: ["Urea / यूरिया", "DAP / डीएपी", "NPK", "SSP", "MOP / पोटाश", "Zinc / जिंक"],
  pesticide: ["Chlorpyriphos / क्लोरपायरीफॉस", "Imidacloprid / इमिडाक्लोप्रिड", "Mancozeb / मैन्कोज़ेब", "Neem Oil / नीम तेल"],
  watering: ["Drip / ड्रिप", "Sprinkler / स्प्रिंकलर", "Flood / बाढ़ सिंचाई", "Furrow / नाली"],
  plantation: ["Direct / सीधी बुवाई", "Transplant / रोपाई", "Broadcasting / छिड़काव"],
  harvesting: ["Manual / हाथ से", "Combine / कम्बाइन", "Thresher / थ्रेसर"],
};

export function AddEventDialog({ open, onOpenChange, cropCardId, editEvent }: AddEventDialogProps) {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const isEditMode = !!editEvent;

  const { data: suggestions = [] } = useQuery<string[]>({
    queryKey: ["/api/suggestions"],
    enabled: open,
  });

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      eventType: "",
      description: "",
      eventDate: new Date().toISOString().split("T")[0],
      productionPerBigha: "",
    },
  });

  useEffect(() => {
    if (open && editEvent) {
      form.reset({
        eventType: editEvent.eventType,
        description: editEvent.description || "",
        eventDate: editEvent.eventDate,
        productionPerBigha: editEvent.productionPerBigha || "",
      });
    } else if (open && !editEvent) {
      form.reset({
        eventType: "",
        description: "",
        eventDate: new Date().toISOString().split("T")[0],
        productionPerBigha: "",
      });
    }
  }, [open, editEvent, form]);

  const selectedType = form.watch("eventType");

  const createMutation = useMutation({
    mutationFn: (data: EventFormData) =>
      apiRequest("POST", `/api/crop-cards/${cropCardId}/events`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crop-cards", cropCardId, "events"] });
      toast({ title: t("eventAdded") });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: EventFormData) =>
      apiRequest("PATCH", `/api/crop-events/${editEvent!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crop-cards", cropCardId, "events"] });
      toast({ title: t("eventUpdated") });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
  });

  const onSubmit = (data: EventFormData) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const quickDescriptions = [
    ...(commonDescriptions[selectedType] || []),
    ...suggestions.filter(s => !commonDescriptions[selectedType]?.includes(s)),
  ].slice(0, 8);

  const dialogTitle = isEditMode ? t("editEvent") : t("addEvent");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl" data-testid="dialog-add-event">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">{dialogTitle}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="eventType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("eventType")}</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {eventTypes.map(et => {
                      const Icon = et.icon;
                      const isSelected = field.value === et.value;
                      const label = language === "hi"
                        ? t(et.value as any)
                        : et.value.charAt(0).toUpperCase() + et.value.slice(1);
                      return (
                        <button
                          key={et.value}
                          type="button"
                          onClick={() => field.onChange(et.value)}
                          className={`flex items-center gap-2 p-3 rounded-md border-2 transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-transparent bg-muted/50"
                          }`}
                          data-testid={`button-event-type-${et.value}`}
                        >
                          <Icon className={`w-5 h-5 ${et.color}`} />
                          <span className="text-sm font-medium">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("description")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("enterDescription")}
                      data-testid="input-event-description"
                      {...field}
                    />
                  </FormControl>
                  {quickDescriptions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {quickDescriptions.map(desc => (
                        <button
                          key={desc}
                          type="button"
                          onClick={() => field.onChange(desc)}
                          className="px-2 py-0.5 text-[10px] rounded-full bg-muted hover-elevate"
                          data-testid={`button-quick-desc-${desc.split("/")[0].trim()}`}
                        >
                          {desc}
                        </button>
                      ))}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="eventDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("date")}</FormLabel>
                  <FormControl>
                    <Input type="date" data-testid="input-event-date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedType === "harvesting" && (
              <FormField
                control={form.control}
                name="productionPerBigha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("productionPerBigha")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={language === "hi" ? "जैसे: 2.5" : "e.g. 2.5"}
                        data-testid="input-production-per-bigha"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
                data-testid="button-cancel-event"
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isPending}
                data-testid="button-save-event"
              >
                {isPending ? t("loading") : isEditMode ? t("update") : t("save")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
