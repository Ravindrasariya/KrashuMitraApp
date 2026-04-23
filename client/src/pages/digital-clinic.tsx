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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FlaskConical, Leaf, Camera, Loader2, ClipboardList, ChevronDown, ChevronUp, Sparkles, Star } from "lucide-react";
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
  const onionFileInputRef = useRef<HTMLInputElement>(null);
  const [onionBenchmark, setOnionBenchmark] = useState<string>("");
  const [onionImageBase64, setOnionImageBase64] = useState<string | null>(null);
  const [onionImageMime, setOnionImageMime] = useState<string>("");
  const [onionImagePreview, setOnionImagePreview] = useState<string | null>(null);
  const [latestOnionResult, setLatestOnionResult] = useState<string | null>(null);

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

  const onionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/service-requests", {
        serviceType: "onion_price_predictor",
        imageData: onionImageBase64,
        imageMimeType: onionImageMime,
        benchmarkRate: Number(onionBenchmark),
      });
      return res.json() as Promise<ServiceRequest>;
    },
    onSuccess: (data: ServiceRequest) => {
      setLatestOnionResult(data.aiDiagnosis || null);
      setOnionImagePreview(null);
      setOnionImageBase64(null);
      setOnionImageMime("");
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

  function handleOnionFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOnionImageMime(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setOnionImagePreview(result);
      setOnionImageBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const serviceLabel = (type: string) => {
    if (type === "soil_test") return t("soilTest");
    if (type === "potato_perishability_test") return t("potatoPerishTest");
    if (type === "crop_doctor") return t("cropDoctorAI");
    if (type === "onion_price_predictor") return t("onionPricePredictor");
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

        <Card className="p-4 md:p-5" data-testid="card-onion-price-predictor">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base mb-1">{t("onionPricePredictor")}</h3>
              <p className="text-sm text-muted-foreground mb-3">{t("onionPricePredictorDesc")}</p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="onion-benchmark" className="text-xs">{t("benchmarkRateLabel")}</Label>
                  <Input
                    id="onion-benchmark"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder={t("benchmarkRatePlaceholder")}
                    value={onionBenchmark}
                    onChange={(e) => setOnionBenchmark(e.target.value)}
                    className="mt-1"
                    data-testid="input-onion-benchmark"
                  />
                </div>
                <input
                  ref={onionFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleOnionFileSelect}
                  data-testid="input-onion-photo"
                />
                {onionImagePreview && (
                  <img
                    src={onionImagePreview}
                    alt=""
                    className="w-full max-h-48 object-contain rounded-md border"
                    data-testid="img-onion-preview"
                  />
                )}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => onionFileInputRef.current?.click()}
                    disabled={onionMutation.isPending}
                    data-testid="button-upload-onion-photo"
                  >
                    <Camera className="w-4 h-4 mr-1" />
                    {t("uploadOnionPhoto")}
                  </Button>
                  <Button
                    onClick={() => {
                      if (!onionImageBase64 || !onionBenchmark || Number(onionBenchmark) <= 0) {
                        toast({ title: t("benchmarkRequired"), variant: "destructive" });
                        return;
                      }
                      onionMutation.mutate();
                    }}
                    disabled={onionMutation.isPending || !onionImageBase64 || !onionBenchmark}
                    data-testid="button-analyze-onion"
                  >
                    {onionMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        {t("analyzing")}
                      </>
                    ) : (
                      t("analyzePhoto")
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {latestOnionResult && (
            <div className="mt-4" data-testid="card-onion-result">
              <OnionResultView raw={latestOnionResult} />
            </div>
          )}
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
              const isOnion = req.serviceType === "onion_price_predictor" && req.aiDiagnosis;
              const isExpandable = isCropDoctor || isOnion;
              const isExpanded = expandedRequestId === req.id;
              const onionParsed = isOnion ? safeParseOnion(req.aiDiagnosis!) : null;
              const onionScore = onionParsed?.lot_analysis?.overall_score;
              const onionVerdict = onionParsed?.lot_analysis?.valuation?.commercial_verdict;
              return (
                <Card
                  key={req.id}
                  className={`p-3 ${isExpandable ? "cursor-pointer" : ""}`}
                  data-testid={`card-request-${req.id}`}
                  onClick={isExpandable ? () => setExpandedRequestId(isExpanded ? null : req.id) : undefined}
                >
                  <div className="flex items-start gap-3 flex-wrap">
                    {isExpandable && req.imageData && !isExpanded && (
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
                        {isOnion && onionScore != null && (
                          <Badge variant="outline" className="gap-1" data-testid={`badge-onion-score-${req.id}`}>
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            {Number(onionScore).toFixed(1)}
                          </Badge>
                        )}
                        {isOnion && onionVerdict && (
                          <Badge className={verdictColor(onionVerdict)} data-testid={`badge-onion-verdict-${req.id}`}>
                            {verdictLabel(onionVerdict, t)}
                          </Badge>
                        )}
                        {isExpandable && (
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
                  {isExpandable && isExpanded && (
                    <div className="mt-3 pt-3 border-t" data-testid={`text-diagnosis-full-${req.id}`}>
                      {req.imageData && (
                        <img
                          src={`/api/service-requests/${req.id}/image`}
                          alt=""
                          className="w-full max-h-64 object-contain rounded-md mb-3"
                          data-testid={`img-request-full-${req.id}`}
                        />
                      )}
                      {isCropDoctor && <MarkdownText text={req.aiDiagnosis!} />}
                      {isOnion && <OnionResultView raw={req.aiDiagnosis!} />}
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

type OnionParsed = {
  lot_analysis?: {
    overall_score?: number;
    benchmark_used?: string;
    parameters?: {
      neck_rating?: number;
      shoulder_geometry?: string;
      skin_quality?: number;
      uniformity?: number;
    };
    valuation?: {
      expected_rate?: string;
      price_delta?: string;
      commercial_verdict?: string;
      ltv_recommendation?: string;
      summary?: string;
    };
  };
  error?: string;
  message?: string;
  raw?: string;
};

function safeParseOnion(raw: string): OnionParsed | null {
  try {
    return JSON.parse(raw) as OnionParsed;
  } catch {
    return null;
  }
}

function verdictColor(verdict: string): string {
  const v = verdict.toLowerCase();
  if (v.includes("store")) return "bg-green-600 hover:bg-green-700 text-white";
  if (v.includes("sell")) return "bg-amber-500 hover:bg-amber-600 text-white";
  if (v.includes("reject")) return "bg-red-600 hover:bg-red-700 text-white";
  return "";
}

function verdictLabel(verdict: string, t: (k: any) => string): string {
  const v = verdict.toLowerCase();
  if (v.includes("store")) return t("verdictStore");
  if (v.includes("sell")) return t("verdictSell");
  if (v.includes("reject")) return t("verdictReject");
  return verdict;
}

function StarBar({ value, max = 5 }: { value: number; max?: number }) {
  const filled = Math.round(value);
  return (
    <div className="flex gap-0.5" data-testid="stars-onion">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < filled ? "fill-amber-500 text-amber-500" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function OnionResultView({ raw }: { raw: string }) {
  const { t } = useTranslation();
  const parsed = safeParseOnion(raw);

  if (!parsed) {
    return <p className="text-sm whitespace-pre-wrap" data-testid="text-onion-raw">{raw}</p>;
  }
  if (parsed.error) {
    const msg = parsed.error === "image_not_onion" ? t("notOnionImage") : (parsed.message || t("onionAnalysisFailed"));
    return <p className="text-sm text-red-600 dark:text-red-400" data-testid="text-onion-error">{msg}</p>;
  }
  const la = parsed.lot_analysis;
  if (!la) return <p className="text-sm whitespace-pre-wrap">{raw}</p>;

  const score = Number(la.overall_score ?? 0);
  const v = la.valuation || {};
  const p = la.parameters || {};
  const delta = (v.price_delta || "").trim();
  const isPositiveDelta = delta.startsWith("+");
  const isNegativeDelta = delta.startsWith("-");

  return (
    <Card className="p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" data-testid="card-onion-result-view">
      <h4 className="font-semibold text-sm mb-3">{t("onionResult")}</h4>

      <div className="flex items-center gap-3 mb-4">
        <div className="text-3xl font-bold tabular-nums" data-testid="text-onion-score">{score.toFixed(1)}</div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{t("qualityScore")}</span>
          <StarBar value={score} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">{t("expectedRate")}</div>
          <div className="font-semibold" data-testid="text-onion-rate">{v.expected_rate || "-"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("priceDelta")}</div>
          <div
            className={`font-semibold ${isPositiveDelta ? "text-green-600" : isNegativeDelta ? "text-red-600" : ""}`}
            data-testid="text-onion-delta"
          >
            {delta || "-"}
          </div>
        </div>
        {v.commercial_verdict && (
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">{t("commercialVerdict")}</div>
            <Badge className={verdictColor(v.commercial_verdict)} data-testid="badge-onion-verdict-main">
              {verdictLabel(v.commercial_verdict, t)}
            </Badge>
          </div>
        )}
        {v.ltv_recommendation && (
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground">{t("ltvRecommendation")}</div>
            <div className="font-medium" data-testid="text-onion-ltv">{v.ltv_recommendation}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("paramNeck")}</div>
          <div className="font-semibold">{p.neck_rating ?? "-"}/5</div>
        </div>
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("paramShoulder")}</div>
          <div className="font-semibold">{p.shoulder_geometry ?? "-"}</div>
        </div>
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("paramSkin")}</div>
          <div className="font-semibold">{p.skin_quality ?? "-"}/5</div>
        </div>
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("paramUniformity")}</div>
          <div className="font-semibold">{p.uniformity ?? "-"}/5</div>
        </div>
      </div>

      {v.summary && (
        <p className="text-sm mt-3 text-muted-foreground" data-testid="text-onion-summary">{v.summary}</p>
      )}
    </Card>
  );
}
