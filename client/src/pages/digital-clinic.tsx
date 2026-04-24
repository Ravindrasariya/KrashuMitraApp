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
import { FlaskConical, Leaf, Camera, Loader2, ClipboardList, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
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
                      const b = Number(onionBenchmark);
                      if (!onionImageBase64 || !(b > 0)) {
                        toast({ title: t("benchmarkRequired"), variant: "destructive" });
                        return;
                      }
                      onionMutation.mutate();
                    }}
                    disabled={onionMutation.isPending || !onionImageBase64 || !(Number(onionBenchmark) > 0)}
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
              const onionHeat = onionParsed?.pricing_analysis?.market_heat_index;
              const onionMarketPrice = onionParsed?.pricing_analysis?.calculated_market_price;
              const onionCollateral = onionParsed?.pricing_analysis?.collateral_value;
              const onionCollateralPct =
                onionMarketPrice && onionMarketPrice > 0 && onionCollateral != null
                  ? Math.round((onionCollateral / onionMarketPrice) * 100)
                  : null;
              const onionScoreBand = onionParsed?.quality_rating?.score_band;
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
                        {isOnion && onionHeat && (
                          <Badge className={heatColor(onionHeat)} data-testid={`badge-onion-heat-${req.id}`}>
                            {heatLabel(onionHeat, t)}
                          </Badge>
                        )}
                        {isOnion && onionParsed?.pricing_analysis && (
                          <Badge variant="outline" className="gap-1 tabular-nums" data-testid={`badge-onion-collateral-${req.id}`}>
                            {onionCollateralPct != null ? `${onionCollateralPct}%` : "—"}
                          </Badge>
                        )}
                        {isOnion && onionScoreBand && (
                          <Badge className={scoreBandClass(onionScoreBand)} data-testid={`badge-onion-score-band-${req.id}`}>
                            {scoreBandLabel(onionScoreBand, t)}
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
  pricing_analysis?: {
    market_heat_index?: string;
    calculated_market_price?: number;
    collateral_value?: number;
    valuation_breakdown?: {
      base_multiplier_used?: number;
      quality_adjustments_total?: string;
      puffy_penalty_applied?: boolean;
    };
    underwriting_note?: string;
  };
  visual_parameters?: {
    size_grade?: string;
    color?: string;
    luster_score?: number;
    shape_uniformity?: string;
    neck_rating?: number;
    shoulder_geometry?: string;
  };
  quality_rating?: {
    overall_score?: number;
    score_band?: string;
    pillar_scores?: {
      neck_integrity?: number;
      shoulder_geometry?: number;
      parda_luster?: number;
      shape_roundness?: number;
      uniformity_size?: number;
    };
    rationale_markdown?: string;
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

function heatColor(heat: string): string {
  const h = heat.toLowerCase();
  if (h === "low") return "bg-blue-600 hover:bg-blue-700 text-white";
  if (h === "medium") return "bg-amber-500 hover:bg-amber-600 text-white";
  if (h === "high") return "bg-red-600 hover:bg-red-700 text-white";
  return "";
}

function heatLabel(heat: string, t: (k: any) => string): string {
  const h = heat.toLowerCase();
  if (h === "low") return t("heatLow");
  if (h === "medium") return t("heatMedium");
  if (h === "high") return t("heatHigh");
  return heat;
}

function sizeGradeLabel(grade: string, t: (k: any) => string): string {
  const g = (grade || "").toLowerCase();
  if (g === "super") return t("sizeSuper");
  if (g === "medium") return t("sizeMedium");
  if (g === "gola") return t("sizeGola");
  if (g === "golti") return t("sizeGolti");
  return grade || "-";
}

function formatINR(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const SCORE_BAND_KEYS: Record<string, string> = {
  "Elite Storage": "bandElite",
  "Premium Commercial": "bandPremium",
  "Standard/Domestic": "bandStandard",
  "High Risk/Puffy": "bandHighRisk",
  "Distress/Reject": "bandDistress",
};

function scoreBandLabel(band: string, t: (k: any) => string): string {
  const key = SCORE_BAND_KEYS[band];
  return key ? t(key) : band || "-";
}

function scoreBandClass(band: string): string {
  switch (band) {
    case "Elite Storage":
      return "bg-emerald-600 hover:bg-emerald-700 text-white";
    case "Premium Commercial":
      return "bg-green-600 hover:bg-green-700 text-white";
    case "Standard/Domestic":
      return "bg-amber-500 hover:bg-amber-600 text-white";
    case "High Risk/Puffy":
      return "bg-orange-600 hover:bg-orange-700 text-white";
    case "Distress/Reject":
      return "bg-red-600 hover:bg-red-700 text-white";
    default:
      return "";
  }
}

function StarBar({ score }: { score: number }) {
  const filled = Math.round(score);
  return (
    <div className="flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={i <= filled ? "text-amber-500" : "text-muted-foreground/30"}
        >
          ★
        </span>
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
    const msg = parsed.error === "image_not_onion" ? t("notOnionImage") : t("onionAnalysisFailed");
    return <p className="text-sm text-red-600 dark:text-red-400" data-testid="text-onion-error">{msg}</p>;
  }
  const pa = parsed.pricing_analysis;
  const vp = parsed.visual_parameters;
  if (!pa || !vp) {
    return <pre className="text-xs whitespace-pre-wrap break-all" data-testid="text-onion-raw">{raw}</pre>;
  }

  const market = Number(pa.calculated_market_price ?? 0);
  const collateral = Number(pa.collateral_value ?? 0);
  const collateralPct = market > 0 ? Math.round((collateral / market) * 100) : null;
  const heat = pa.market_heat_index || "";
  const vb = pa.valuation_breakdown || {};
  const qadj = (vb.quality_adjustments_total || "").trim();
  const qadjSign = qadj.startsWith("+") ? "text-green-600" : qadj.startsWith("-") ? "text-red-600" : "";
  const collateralPctClass =
    collateralPct == null
      ? ""
      : collateralPct >= 90
        ? "text-green-600"
        : collateralPct >= 75
          ? "text-amber-600"
          : "text-red-600";

  return (
    <Card className="p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" data-testid="card-onion-result-view">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h4 className="font-semibold text-sm">{t("onionResult")}</h4>
        {heat && (
          <Badge className={heatColor(heat)} data-testid="badge-onion-heat-main">
            {t("marketHeatIndex")}: {heatLabel(heat, t)}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-background/60 rounded p-3">
          <div className="text-xs text-muted-foreground">{t("marketPrice")}</div>
          <div className="text-2xl font-bold tabular-nums" data-testid="text-onion-market-price">
            {formatINR(market)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{t("perQuintal")}</div>
        </div>
        <div className="bg-background/60 rounded p-3">
          <div className="text-xs text-muted-foreground">{t("collateralValue")}</div>
          <div className={`text-2xl font-bold tabular-nums ${collateralPctClass}`} data-testid="text-onion-collateral-pct">
            {collateralPct != null ? `${collateralPct}%` : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{t("ofMarketPrice")}</div>
          <div className="text-[10px] text-muted-foreground mt-1 leading-tight" data-testid="text-onion-ltv-note">
            {t("collateralLtvNote")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("baseMultiplier")}</div>
          <div className="font-semibold tabular-nums" data-testid="text-onion-base-mult">
            {vb.base_multiplier_used != null ? Number(vb.base_multiplier_used).toFixed(2) : "-"}
          </div>
        </div>
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("qualityAdjustments")}</div>
          <div className={`font-semibold ${qadjSign}`} data-testid="text-onion-qadj">{qadj || "-"}</div>
        </div>
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("puffyPenaltyApplied")}</div>
          <div className="font-semibold" data-testid="text-onion-puffy">
            {vb.puffy_penalty_applied ? t("yes") : t("no")}
          </div>
        </div>
      </div>

      <QualityRatingBlock rating={parsed.quality_rating} />

      <div className="text-xs font-medium mb-2 text-muted-foreground">{t("visualParameters")}</div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("sizeGrade")}</div>
          <div className="font-semibold" data-testid="text-onion-size-grade">{sizeGradeLabel(vp.size_grade || "", t)}</div>
        </div>
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("color")}</div>
          <div className="font-semibold">{vp.color || "-"}</div>
        </div>
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("luster")}</div>
          <div className="font-semibold">{vp.luster_score != null ? `${vp.luster_score}/5` : "-"}</div>
        </div>
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("shapeUniformity")}</div>
          <div className="font-semibold">{vp.shape_uniformity || "-"}</div>
        </div>
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("paramNeck")}</div>
          <div className="font-semibold">{vp.neck_rating != null ? `${vp.neck_rating}/5` : "-"}</div>
        </div>
        <div className="bg-background/50 rounded p-2">
          <div className="text-muted-foreground">{t("paramShoulder")}</div>
          <div className="font-semibold">{vp.shoulder_geometry || "-"}</div>
        </div>
      </div>

      {pa.underwriting_note && (
        <div className="bg-background/40 rounded p-2 border-l-2 border-amber-400 mb-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{t("underwritingNote")}</div>
          <p className="text-xs" data-testid="text-onion-underwriting-note">{pa.underwriting_note}</p>
        </div>
      )}

      <QualityRatingBlock rating={parsed.quality_rating} />
    </Card>
  );
}

function QualityRatingBlock({ rating }: { rating?: OnionParsed["quality_rating"] }) {
  const { t } = useTranslation();
  if (!rating || rating.overall_score == null || !rating.score_band || !rating.pillar_scores) {
    return null;
  }
  const score = Number(rating.overall_score);
  const band = rating.score_band;
  const ps = rating.pillar_scores;
  const pillars: Array<{ key: string; labelKey: string; value?: number }> = [
    { key: "neck_integrity", labelKey: "pillarNeckIntegrity", value: ps.neck_integrity },
    { key: "shoulder_geometry", labelKey: "pillarShoulderGeometry", value: ps.shoulder_geometry },
    { key: "parda_luster", labelKey: "pillarPardaLuster", value: ps.parda_luster },
    { key: "shape_roundness", labelKey: "pillarShapeRoundness", value: ps.shape_roundness },
    { key: "uniformity_size", labelKey: "pillarUniformitySize", value: ps.uniformity_size },
  ];
  return (
    <Card
      className="p-4 bg-background border-amber-200 dark:border-amber-800 mb-3"
      data-testid="card-onion-quality-rating"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h4 className="font-semibold text-sm">{t("qualityRating")}</h4>
        <Badge className={scoreBandClass(band)} data-testid="badge-onion-score-band">
          {scoreBandLabel(band, t)}
        </Badge>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="text-3xl font-bold tabular-nums" data-testid="text-onion-overall-score">
          {score.toFixed(1)}
          <span className="text-base text-muted-foreground font-normal">/5</span>
        </div>
        <StarBar score={score} />
      </div>

      <div className="text-xs font-medium mb-2 text-muted-foreground">{t("pillarBreakdown")}</div>
      <div className="space-y-1.5 mb-3">
        {pillars.map((p) => (
          <div
            key={p.key}
            className="flex items-center justify-between bg-background/50 rounded px-2 py-1.5 text-xs"
            data-testid={`row-pillar-${p.key}`}
          >
            <span className="text-muted-foreground">{t(p.labelKey as any)}</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">
                {p.value != null ? `${p.value}/5` : "-"}
              </span>
              {p.value != null && <StarBar score={p.value} />}
            </div>
          </div>
        ))}
      </div>

      {rating.rationale_markdown && (
        <div className="bg-background/40 rounded p-2 border-l-2 border-amber-400">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            {t("ratingRationale")}
          </div>
          <div className="text-xs" data-testid="text-onion-rating-rationale">
            <MarkdownText text={rating.rationale_markdown} />
          </div>
        </div>
      )}
    </Card>
  );
}
