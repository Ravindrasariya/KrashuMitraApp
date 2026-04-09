import { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FlaskConical, Leaf, Camera, Loader2, ClipboardList, ChevronDown, ChevronUp } from "lucide-react";
import type { ServiceRequest } from "@shared/schema";

function MarkdownText({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const elements: JSX.Element[] = [];
  let currentList: string[] = [];
  let key = 0;

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-0.5 mb-2">
          {currentList.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const renderInline = (str: string) => {
    const parts = str.split(/\*\*(.+?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
    );
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
      flushList();
      const heading = trimmed.replace(/^\*\*/, "").replace(/\*\*$/, "");
      elements.push(
        <h5 key={key++} className="font-bold text-sm mt-3 mb-1 text-foreground">{heading}</h5>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
      currentList.push(trimmed.replace(/^[-•*]\s+/, ""));
    } else {
      flushList();
      elements.push(
        <p key={key++} className="mb-1">{renderInline(trimmed)}</p>
      );
    }
  }
  flushList();

  return <div className={`text-sm text-muted-foreground ${className}`}>{elements}</div>;
}

export default function DigitalClinicPage() {
  const { t, language } = useTranslation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [bookingType, setBookingType] = useState<string | null>(null);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>("");
  const [latestDiagnosis, setLatestDiagnosis] = useState<string | null>(null);
  const [expandedRequestId, setExpandedRequestId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: requests = [], isLoading: requestsLoading } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/service-requests"],
    enabled: isAuthenticated,
  });

  const bookMutation = useMutation({
    mutationFn: async (serviceType: string) => {
      const res = await apiRequest("POST", "/api/service-requests", { serviceType });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("bookingSuccess") });
      qc.invalidateQueries({ queryKey: ["/api/service-requests"] });
      setBookingType(null);
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const cropDoctorMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/service-requests", {
        serviceType: "crop_doctor",
        imageData: imageBase64,
        imageMimeType: imageMime,
        language,
      });
      return res.json() as Promise<ServiceRequest>;
    },
    onSuccess: (data: ServiceRequest) => {
      setLatestDiagnosis(data.aiDiagnosis || null);
      setImageDialogOpen(false);
      setImagePreview(null);
      setImageBase64(null);
      qc.invalidateQueries({ queryKey: ["/api/service-requests"] });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/auth");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  if (!authLoading && !isAuthenticated) {
    return null;
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageMime(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setImageBase64(result.split(",")[1]);
      setImageDialogOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const serviceLabel = (type: string) => {
    if (type === "soil_test") return t("soilTest");
    if (type === "potato_perishability_test") return t("potatoPerishTest");
    if (type === "crop_doctor") return t("cropDoctorAI");
    return type;
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-8 px-4 md:px-8 py-6 max-w-lg md:max-w-2xl mx-auto" data-testid="page-digital-clinic">
      <h1 className="text-xl md:text-2xl font-bold mb-6" data-testid="text-digital-clinic-title">
        {t("digitalClinic")}
      </h1>

      <div className="flex flex-col gap-4 mb-8">
        <Card className="p-4 md:p-5" data-testid="card-soil-test">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <FlaskConical className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base mb-1">{t("soilTest")}</h3>
              <p className="text-sm text-muted-foreground mb-3">{t("soilTestDesc")}</p>
              <Button
                data-testid="button-book-soil-test"
                onClick={() => setBookingType("soil_test")}
              >
                {t("bookNow")}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-4 md:p-5" data-testid="card-potato-seed-test">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <Leaf className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base mb-1">{t("potatoPerishTest")}</h3>
              <p className="text-sm text-muted-foreground mb-3">{t("potatoPerishDesc")}</p>
              <Button
                data-testid="button-book-potato-seed-test"
                onClick={() => setBookingType("potato_perishability_test")}
              >
                {t("bookNow")}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-4 md:p-5" data-testid="card-crop-doctor">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base mb-1">{t("cropDoctorAI")}</h3>
              <p className="text-sm text-muted-foreground mb-3">{t("cropDoctorDesc")}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
                data-testid="input-crop-photo"
              />
              <Button
                data-testid="button-upload-crop-photo"
                onClick={() => fileInputRef.current?.click()}
              >
                {t("uploadPhoto")}
              </Button>
            </div>
          </div>

          {latestDiagnosis && (
            <Card className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" data-testid="card-diagnosis-result">
              <h4 className="font-semibold text-sm mb-2">{t("cropDoctorResult")}</h4>
              <div data-testid="text-diagnosis">
                <MarkdownText text={latestDiagnosis} />
              </div>
            </Card>
          )}
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4" data-testid="text-my-requests-title">
          {t("myRequests")}
        </h2>

        {requestsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-requests">
            <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{t("noRequests")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {requests.map((req) => {
              const isCropDoctor = req.serviceType === "crop_doctor" && req.aiDiagnosis;
              const isExpanded = expandedRequestId === req.id;
              return (
                <Card
                  key={req.id}
                  className={`p-3 ${isCropDoctor ? "cursor-pointer" : ""}`}
                  data-testid={`card-request-${req.id}`}
                  onClick={isCropDoctor ? () => setExpandedRequestId(isExpanded ? null : req.id) : undefined}
                >
                  <div className="flex items-start gap-3 flex-wrap">
                    {req.serviceType === "crop_doctor" && req.imageData && !isExpanded && (
                      <img
                        src={`/api/service-requests/${req.id}/image`}
                        alt=""
                        className="w-12 h-12 rounded-md object-cover shrink-0"
                        data-testid={`img-request-${req.id}`}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="secondary" data-testid={`badge-type-${req.id}`}>
                          {serviceLabel(req.serviceType)}
                        </Badge>
                        <Badge
                          variant={req.status === "open" ? "default" : "outline"}
                          data-testid={`badge-status-${req.id}`}
                        >
                          {req.status === "open" ? t("open") : t("closed")}
                        </Badge>
                        {isCropDoctor && (
                          <span className="ml-auto text-muted-foreground" data-testid={`button-expand-request-${req.id}`}>
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground" data-testid={`text-date-${req.id}`}>
                        {req.createdAt ? new Date(req.createdAt).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN") : ""}
                      </p>
                      {isCropDoctor && !isExpanded && (
                        <div className="mt-1 line-clamp-2" data-testid={`text-diagnosis-${req.id}`}>
                          <MarkdownText text={req.aiDiagnosis!} className="text-xs" />
                        </div>
                      )}
                    </div>
                  </div>
                  {isCropDoctor && isExpanded && (
                    <div className="mt-3 pt-3 border-t" data-testid={`text-diagnosis-full-${req.id}`}>
                      {req.imageData && (
                        <img
                          src={`/api/service-requests/${req.id}/image`}
                          alt=""
                          className="w-full max-h-64 object-contain rounded-md mb-3"
                          data-testid={`img-request-full-${req.id}`}
                        />
                      )}
                      <MarkdownText text={req.aiDiagnosis!} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!bookingType} onOpenChange={(open) => !open && setBookingType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bookingConfirm")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">{t("name")}: </span>
              <span className="font-medium" data-testid="text-booking-name">{user?.firstName || "-"}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{t("phoneNumber")}: </span>
              <span className="font-medium" data-testid="text-booking-phone">{user?.phoneNumber || "-"}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{t("farmerId")}: </span>
              <span className="font-medium" data-testid="text-booking-code">{user?.farmerCode || "-"}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{language === "hi" ? "सेवा" : "Service"}: </span>
              <span className="font-medium">{bookingType ? serviceLabel(bookingType) : ""}</span>
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBookingType(null)} data-testid="button-cancel-booking">
              {t("cancel")}
            </Button>
            <Button
              onClick={() => bookingType && bookMutation.mutate(bookingType)}
              disabled={bookMutation.isPending}
              data-testid="button-confirm-booking"
            >
              {bookMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {t("confirmBooking")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={imageDialogOpen} onOpenChange={(open) => { if (!open && !cropDoctorMutation.isPending) { setImageDialogOpen(false); setImagePreview(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cropDoctorAI")}</DialogTitle>
          </DialogHeader>
          {imagePreview && (
            <img
              src={imagePreview}
              alt=""
              className="w-full max-h-64 object-contain rounded-md"
              data-testid="img-crop-preview"
            />
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setImageDialogOpen(false); setImagePreview(null); }}
              disabled={cropDoctorMutation.isPending}
              data-testid="button-cancel-analyze"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={() => cropDoctorMutation.mutate()}
              disabled={cropDoctorMutation.isPending}
              data-testid="button-analyze-photo"
            >
              {cropDoctorMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  {t("analyzing")}
                </>
              ) : (
                t("analyzePhoto")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
