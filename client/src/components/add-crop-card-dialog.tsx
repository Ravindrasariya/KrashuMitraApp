import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "@/lib/i18n";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sprout } from "lucide-react";

const cropCardFormSchema = z.object({
  cropName: z.string().min(1, "Required"),
  farmName: z.string().optional(),
  variety: z.string().optional(),
  startDate: z.string().min(1, "Required"),
});

type CropCardFormData = z.infer<typeof cropCardFormSchema>;

interface AddCropCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const commonCrops = [
  { hi: "गेहूँ", en: "Wheat" },
  { hi: "धान", en: "Rice" },
  { hi: "मक्का", en: "Maize" },
  { hi: "सोयाबीन", en: "Soybean" },
  { hi: "प्याज", en: "Onion" },
  { hi: "टमाटर", en: "Tomato" },
  { hi: "आलू", en: "Potato" },
  { hi: "गन्ना", en: "Sugarcane" },
  { hi: "कपास", en: "Cotton" },
  { hi: "सरसों", en: "Mustard" },
];

export function AddCropCardDialog({ open, onOpenChange }: AddCropCardDialogProps) {
  const { t, language } = useTranslation();
  const { toast } = useToast();

  const form = useForm<CropCardFormData>({
    resolver: zodResolver(cropCardFormSchema),
    defaultValues: {
      cropName: "",
      farmName: "",
      variety: "",
      startDate: new Date().toISOString().split("T")[0],
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CropCardFormData) => apiRequest("POST", "/api/crop-cards", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crop-cards"] });
      toast({ title: t("cropCardCreated") });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create crop card", variant: "destructive" });
    },
  });

  const onSubmit = (data: CropCardFormData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl" data-testid="dialog-add-crop-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sprout className="w-5 h-5 text-primary" />
            {t("addCropCard")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("addCropCard")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="cropName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("cropName")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={language === "hi" ? "फसल का नाम दर्ज करें" : "Enter crop name"}
                      data-testid="input-crop-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-wrap gap-1.5">
              {commonCrops.map(crop => (
                <button
                  key={crop.en}
                  type="button"
                  onClick={() => form.setValue("cropName", language === "hi" ? crop.hi : crop.en)}
                  className="px-2.5 py-1 text-xs rounded-full bg-primary/10 text-primary hover-elevate transition-colors"
                  data-testid={`button-crop-quick-${crop.en.toLowerCase()}`}
                >
                  {language === "hi" ? crop.hi : crop.en}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="farmName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("farmName")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("farmNamePlaceholder")}
                        data-testid="input-farm-name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="variety"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("variety")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("varietyPlaceholder")}
                        data-testid="input-variety"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("startDate")}</FormLabel>
                  <FormControl>
                    <Input type="date" data-testid="input-start-date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
                data-testid="button-cancel-crop"
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending}
                data-testid="button-save-crop"
              >
                {createMutation.isPending ? t("loading") : t("save")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
