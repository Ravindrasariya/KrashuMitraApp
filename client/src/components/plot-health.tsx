import { useState, useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Rectangle, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTranslation } from "@/lib/i18n";
import { useMutation, useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PlotHealthChart } from "@/components/plot-health-chart";
import { PLOT_CROP_KEYS, PLOT_CROP_STAGES, type PlotCropKey, type SavedFarm } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  MapPin,
  Navigation,
  Satellite,
  Wind,
  Droplets,
  CloudRain,
  Thermometer,
  AlertTriangle,
  History,
  Bookmark,
  Trash2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type IndexId = "truecolor" | "ndvi" | "ndre" | "ndmi";

interface IndexStat {
  mean: number;
  min: number;
  max: number;
}
interface LotStats {
  ndvi: IndexStat | null;
  ndre: IndexStat | null;
  ndmi: IndexStat | null;
  validFraction: number;
}
type CropIndexStatus = "ok" | "low" | "na";
interface CropIndexAssessment {
  status: CropIndexStatus;
  actual: number | null;
  lower: number | null;
  typical: number | null;
  upper: number | null;
  previous?: number | null;
  declined?: boolean;
}
export interface CropAssessment {
  cropType: string;
  cropStage: string;
  overall: "healthy" | "needs_attention" | "none";
  isGeneric: boolean;
  source: string | null;
  guidanceHi: string | null;
  guidanceEn: string | null;
  messageHi: string;
  messageEn: string;
  indices: { ndvi: CropIndexAssessment; ndre: CropIndexAssessment; ndmi: CropIndexAssessment };
  weak: Array<"ndvi" | "ndre" | "ndmi">;
  declining?: Array<"ndvi" | "ndre" | "ndmi">;
  previousDate?: string | null;
}
export interface PlotHealthResult {
  lat: number;
  lng: number;
  boxSizeM: number;
  requestedDate: string;
  resolvedDate: string;
  acquisitionDate: string;
  cloudCover: number;
  stats: LotStats | null;
  noClearImage?: boolean;
  id?: number;
  cropType?: string | null;
  cropStage?: string | null;
  cropAssessment?: CropAssessment | null;
}

interface TimelinePoint {
  date: string;
  ndvi: number | null;
  ndre: number | null;
  ndmi: number | null;
  estimated: boolean;
}

interface PlotConfig {
  hasCredentials: boolean;
  defaultCenter: { lat: number; lng: number; name: string };
  minZoom: number;
  maxZoom: number;
  maxNativeZoom: number;
  boxSizes: number[];
  indexes: IndexId[];
}

// ---------------------------------------------------------------------------
// Index metadata (legends mirror the server color ramps)
// ---------------------------------------------------------------------------
const INDEX_META: Record<IndexId, { gradient: string | null; lowKey: string; highKey: string }> = {
  truecolor: { gradient: null, lowKey: "", highKey: "" },
  ndvi: {
    gradient: "linear-gradient(to right, #a8a8a8, #c76633, #dbc745, #66bd45, #298c29, #004500)",
    lowKey: "phLegendBare",
    highKey: "phLegendDense",
  },
  ndre: {
    gradient: "linear-gradient(to right, #b3b3b3, #e6d966, #b3d94d, #4db34d, #1a8026, #004d0d)",
    lowKey: "phLegendLowChloro",
    highKey: "phLegendHighChloro",
  },
  ndmi: {
    gradient: "linear-gradient(to right, #663300, #cc994d, #e6e699, #66cc80, #1a80cc, #003399)",
    lowKey: "phLegendDry",
    highKey: "phLegendWet",
  },
};

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
function boxBounds(lat: number, lng: number, sizeM: number): LatLngBoundsExpression {
  const half = sizeM / 2;
  const dLat = half / 111320;
  const dLng = half / (111320 * Math.cos((lat * Math.PI) / 180));
  return [
    [lat - dLat, lng - dLng],
    [lat + dLat, lng + dLng],
  ];
}

const COMPASS_16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
function cardinal(deg: number): string {
  return COMPASS_16[Math.round(((deg % 360) / 22.5)) % 16];
}

// ---------------------------------------------------------------------------
// Weather (client-side Open-Meteo, no key required)
// ---------------------------------------------------------------------------
interface WeatherData {
  temp: number;
  humidity: number;
  precip: number;
  windSpeed: number;
  windDir: number;
  windGust: number;
  code: number;
  daily: { date: string; max: number; min: number; precip: number; code: number }[];
}

function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 99) return "⛈️";
  return "🌡️";
}

// ---------------------------------------------------------------------------
// Map helpers
// ---------------------------------------------------------------------------
function MapController({ lat, lng, boxSizeM, maxZoom }: { lat: number; lng: number; boxSizeM: number; maxZoom: number }) {
  const map = useMap();
  const last = useRef<string>("");
  useEffect(() => {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)},${boxSizeM}`;
    if (key !== last.current) {
      last.current = key;
      // Frame the plot box so the field roughly fills the view (with a little
      // padding), capped at the configured max zoom so a tiny box doesn't
      // over-zoom past the available imagery detail.
      map.fitBounds(boxBounds(lat, lng, boxSizeM), {
        padding: [40, 40],
        maxZoom,
        animate: true,
      });
    }
  }, [lat, lng, boxSizeM, maxZoom, map]);
  return null;
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PlotHealth({
  initialResult,
  onSaved,
}: {
  initialResult?: PlotHealthResult | null;
  onSaved?: () => void;
}) {
  const { t, language } = useTranslation();
  const { toast } = useToast();

  const { data: config } = useQuery<PlotConfig>({ queryKey: ["/api/plot-health/config"] });

  const [lat, setLat] = useState<number | null>(initialResult?.lat ?? null);
  const [lng, setLng] = useState<number | null>(initialResult?.lng ?? null);
  const [latInput, setLatInput] = useState<string>(initialResult ? String(initialResult.lat) : "");
  const [lngInput, setLngInput] = useState<string>(initialResult ? String(initialResult.lng) : "");
  const [boxSizeM, setBoxSizeM] = useState<number>(initialResult?.boxSizeM ?? 50);
  const [useLatest, setUseLatest] = useState<boolean>(
    initialResult ? initialResult.requestedDate === "latest" : false,
  );
  const [dateValue, setDateValue] = useState<string>(
    initialResult && initialResult.requestedDate !== "latest"
      ? initialResult.requestedDate
      : new Date().toISOString().slice(0, 10),
  );
  const [activeIndex, setActiveIndex] = useState<IndexId>("ndvi");
  const [opacity, setOpacity] = useState<number>(0.8);
  // Task #143: chosen crop + growth stage for the health verdict. Restored from
  // a reopened history result; "" means none chosen.
  const [cropType, setCropType] = useState<string>(initialResult?.cropType ?? "");
  const [cropStage, setCropStage] = useState<string>(initialResult?.cropStage ?? "");
  const [result, setResult] = useState<PlotHealthResult | null>(initialResult ?? null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Task #152: saved farm plots. A farmer can store the current coordinates
  // under a name and reload them from the dropdown without re-typing lat/long.
  const { data: savedFarms = [] } = useQuery<SavedFarm[]>({ queryKey: ["/api/plot-health/farms"] });
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [farmNameInput, setFarmNameInput] = useState("");
  const [saveLatInput, setSaveLatInput] = useState("");
  const [saveLngInput, setSaveLngInput] = useState("");

  const saveFarmMutation = useMutation({
    mutationFn: async (data: { name: string; latitude: number; longitude: number }) => {
      const res = await apiRequest("POST", "/api/plot-health/farms", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plot-health/farms"] });
      setSaveDialogOpen(false);
      toast({ title: t("phFarmSaved") });
    },
    onError: () => {
      toast({ title: t("phFarmSaveFailed"), variant: "destructive" });
    },
  });

  const deleteFarmMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/plot-health/farms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plot-health/farms"] });
      toast({ title: t("phFarmDeleted") });
    },
    onError: () => {
      toast({ title: t("phFarmDeleteFailed"), variant: "destructive" });
    },
  });

  function openSaveDialog() {
    // Pre-fill from the currently set/typed coordinates so the popup opens with
    // the plot the farmer is looking at, while still allowing manual edits.
    setSaveLatInput(latInput || (lat != null ? lat.toFixed(6) : ""));
    setSaveLngInput(lngInput || (lng != null ? lng.toFixed(6) : ""));
    setFarmNameInput("");
    setSaveDialogOpen(true);
  }

  function handleSaveFarmConfirm() {
    const name = farmNameInput.trim();
    const la = Number(saveLatInput);
    const ln = Number(saveLngInput);
    if (!name) {
      toast({ title: t("phFarmNameRequired"), variant: "destructive" });
      return;
    }
    if (!Number.isFinite(la) || !Number.isFinite(ln) || la < -90 || la > 90 || ln < -180 || ln > 180) {
      toast({ title: t("phInvalidCoords"), variant: "destructive" });
      return;
    }
    saveFarmMutation.mutate({ name, latitude: la, longitude: ln });
  }

  function handleSelectSavedFarm(value: string) {
    const farm = savedFarms.find((f) => String(f.id) === value);
    if (farm) pickLocation(farm.latitude, farm.longitude);
  }

  const saveFarmValid = useMemo(() => {
    const name = farmNameInput.trim();
    const la = Number(saveLatInput);
    const ln = Number(saveLngInput);
    return (
      name.length > 0 &&
      saveLatInput.trim() !== "" &&
      saveLngInput.trim() !== "" &&
      Number.isFinite(la) && Number.isFinite(ln) &&
      la >= -90 && la <= 90 && ln >= -180 && ln <= 180
    );
  }, [farmNameInput, saveLatInput, saveLngInput]);

  const center = useMemo(() => {
    if (lat != null && lng != null) return { lat, lng };
    if (config?.defaultCenter) return config.defaultCenter;
    return { lat: 23.1765, lng: 75.7885 };
  }, [lat, lng, config]);

  // The weather panel follows the date the farmer is actually analyzing. When the
  // displayed result matches the current selection we anchor to its resolved image
  // date (so weather lines up with the imagery shown); otherwise we track the date
  // box / curve tap directly, falling back to today.
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const weatherDate = useMemo(() => {
    if (
      result &&
      !result.noClearImage &&
      (result.requestedDate === "latest"
        ? useLatest
        : !useLatest && result.requestedDate === dateValue)
    ) {
      return result.resolvedDate;
    }
    if (useLatest) return todayStr;
    // Guard against a cleared/invalid date input so we never build a malformed
    // historical request — fall back to today.
    return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : todayStr;
  }, [result, useLatest, dateValue, todayStr]);
  const weatherIsLive = weatherDate >= todayStr;

  // Fetch weather whenever the location or the anchored date changes.
  useEffect(() => {
    if (lat == null || lng == null) return;
    let cancelled = false;
    setWeatherLoading(true);
    const tz = "Asia%2FKolkata";

    async function run() {
      try {
        if (weatherIsLive) {
          // Today / latest → live current conditions + short forecast.
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=${tz}&forecast_days=3`;
          const d = await fetch(url).then((r) => r.json());
          if (cancelled) return;
          const c = d.current || {};
          const daily = d.daily || {};
          const days: WeatherData["daily"] = (daily.time || []).map((date: string, i: number) => ({
            date,
            max: daily.temperature_2m_max?.[i],
            min: daily.temperature_2m_min?.[i],
            precip: daily.precipitation_sum?.[i],
            code: daily.weather_code?.[i],
          }));
          setWeather({
            temp: c.temperature_2m,
            humidity: c.relative_humidity_2m,
            precip: c.precipitation,
            windSpeed: c.wind_speed_10m,
            windDir: c.wind_direction_10m,
            windGust: c.wind_gusts_10m,
            code: c.weather_code,
            daily: days,
          });
        } else {
          // Past date → that day's daily aggregates + hourly humidity, with a small
          // 3-day strip around it. The recent-past forecast window covers ~3 months;
          // older dates fall back to the (few-day-lagged) reanalysis archive.
          const anchorMs = Date.parse(`${weatherDate}T00:00:00Z`);
          const startStr = new Date(anchorMs - 86400000).toISOString().slice(0, 10);
          let endStr = new Date(anchorMs + 86400000).toISOString().slice(0, 10);
          if (endStr > todayStr) endStr = todayStr;
          const daysAgo = Math.floor((Date.parse(`${todayStr}T00:00:00Z`) - anchorMs) / 86400000);
          const base =
            daysAgo > 90
              ? "https://archive-api.open-meteo.com/v1/archive"
              : "https://api.open-meteo.com/v1/forecast";
          const url = `${base}?latitude=${lat}&longitude=${lng}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,weather_code,wind_speed_10m_max,wind_direction_10m_dominant,wind_gusts_10m_max&hourly=relative_humidity_2m&timezone=${tz}`;
          const d = await fetch(url).then((r) => r.json());
          if (cancelled) return;
          const daily = d.daily || {};
          const times: string[] = daily.time || [];
          const idx = times.indexOf(weatherDate);
          const di = idx >= 0 ? idx : times.length - 1;
          // Mean humidity over the selected day, computed from hourly values.
          let humidity: number | undefined;
          const ht: string[] = d.hourly?.time || [];
          const hh: number[] = d.hourly?.relative_humidity_2m || [];
          const sameDay = ht
            .map((tstr, i) => (tstr.slice(0, 10) === weatherDate ? hh[i] : null))
            .filter((v): v is number => v != null && Number.isFinite(v));
          if (sameDay.length) {
            humidity = Math.round(sameDay.reduce((a, b) => a + b, 0) / sameDay.length);
          }
          const days: WeatherData["daily"] = times.map((date, i) => ({
            date,
            max: daily.temperature_2m_max?.[i],
            min: daily.temperature_2m_min?.[i],
            precip: daily.precipitation_sum?.[i],
            code: daily.weather_code?.[i],
          }));
          const meanTemp = daily.temperature_2m_mean?.[di];
          const dMax = daily.temperature_2m_max?.[di];
          const dMin = daily.temperature_2m_min?.[di];
          const fallbackTemp = dMax != null && dMin != null ? (dMax + dMin) / 2 : undefined;
          setWeather({
            temp: (meanTemp != null ? meanTemp : fallbackTemp) as number,
            humidity: humidity as number,
            precip: daily.precipitation_sum?.[di],
            windSpeed: daily.wind_speed_10m_max?.[di],
            windDir: daily.wind_direction_10m_dominant?.[di],
            windGust: daily.wind_gusts_10m_max?.[di],
            code: daily.weather_code?.[di],
            daily: days,
          });
        }
      } catch {
        if (!cancelled) setWeather(null);
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [lat, lng, weatherDate, weatherIsLive, todayStr]);

  const resultsTopRef = useRef<HTMLDivElement | null>(null);
  // Monotonic request id so a slow, older analyze response (e.g. while the
  // farmer drags the date slider) can't overwrite a newer selection.
  const reqSeqRef = useRef(0);
  // Debounce handle for the time-lapse date slider.
  const sliderDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSliderDebounce = () => {
    if (sliderDebounceRef.current) {
      clearTimeout(sliderDebounceRef.current);
      sliderDebounceRef.current = null;
    }
  };
  // Date the slider is currently previewing (from already-loaded chart data)
  // before the authoritative analyze settles. null → show the analyzed result.
  // Drives the map imagery + chart marker + lot averages instantly while
  // dragging, so there is no per-step loading round-trip.
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  // Latest stop date the slider landed on, flushed to a full analyze on release.
  const pendingSliderDateRef = useRef<string | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: async (vars?: { date?: string }) => {
      if (lat == null || lng == null) throw new Error(t("phPickLocationFirst"));
      // Task #143: if a real crop is chosen (not barren), a stage is required to
      // produce a verdict — otherwise the health check would silently skip it.
      if (cropType && cropType !== "barren" && !cropStage) {
        throw new Error(t("phSelectStageFirst"));
      }
      const seq = ++reqSeqRef.current;
      const reqDate = vars?.date ?? (useLatest ? "latest" : dateValue);
      const res = await apiRequest("POST", "/api/plot-health/analyze", {
        lat,
        lng,
        boxSizeM,
        date: reqDate,
        cropType: cropType || undefined,
        cropStage: cropStage || undefined,
      });
      const data = (await res.json()) as PlotHealthResult;
      return { data, seq };
    },
    onSuccess: ({ data, seq }) => {
      // Drop the result if a newer analyze request has since been issued.
      if (seq !== reqSeqRef.current) return;
      setResult(data);
      // Only retire the preview if this result is for the day we're previewing.
      // If the farmer has already dragged on to a newer date, keep showing that
      // preview instead of snapping back to this (now older) analyzed day.
      setPreviewDate((prev) => (prev === data.resolvedDate ? null : prev));
      if (!data.noClearImage) onSaved?.();
    },
    onError: (err: any) => {
      // Don't strand the UI in preview mode after a failed settle pull.
      setPreviewDate(null);
      pendingSliderDateRef.current = null;
      const msg = err?.message?.includes("503") || /credential/i.test(err?.message || "")
        ? t("phMissingCreds")
        : err?.message || t("phAnalyzeFailed");
      toast({ title: msg, variant: "destructive" });
    },
  });

  function handleTrendPointClick(pickedDate: string) {
    setUseLatest(false);
    setDateValue(pickedDate);
    cancelSliderDebounce(); // a tap supersedes any pending slider commit
    pendingSliderDateRef.current = null;
    setPreviewDate(pickedDate); // swap imagery instantly while the full pull runs
    analyzeMutation.mutate({ date: pickedDate });
    // The chart sits below the imagery; bring the freshly-loaded image/stats
    // back into view so the farmer sees the day they tapped.
    resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function pickLocation(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
    setLatInput(newLat.toFixed(6));
    setLngInput(newLng.toFixed(6));
    cancelSliderDebounce(); // a new location invalidates any pending slider commit
    pendingSliderDateRef.current = null;
    setPreviewDate(null);
    setResult(null);
  }

  function handleGps() {
    if (!navigator.geolocation) {
      toast({ title: t("gpsNotSupported"), variant: "destructive" });
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pickLocation(pos.coords.latitude, pos.coords.longitude);
        setGpsLoading(false);
      },
      () => {
        toast({ title: t("gpsFailed"), variant: "destructive" });
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function handleManualSet() {
    const la = Number(latInput);
    const ln = Number(lngInput);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || la < -90 || la > 90 || ln < -180 || ln > 180) {
      toast({ title: t("phInvalidCoords"), variant: "destructive" });
      return;
    }
    pickLocation(la, ln);
  }

  // The map + chart marker follow the previewed slider date the instant it
  // changes, falling back to the last fully-analyzed acquisition date.
  const displayDate = previewDate ?? result?.resolvedDate;
  const tileUrl =
    result && !result.noClearImage && displayDate && activeIndex !== "truecolor"
      ? `/api/plot-health/tiles/${activeIndex}/{z}/{x}/{y}.png?date=${displayDate}`
      : null;
  const trueColorUrl =
    result && !result.noClearImage && displayDate && activeIndex === "truecolor"
      ? `/api/plot-health/tiles/truecolor/{z}/{x}/{y}.png?date=${displayDate}`
      : null;
  const overlayUrl = tileUrl || trueColorUrl;

  const minZoom = config?.minZoom ?? 9;
  const maxZoom = config?.maxZoom ?? 16;
  const maxNativeZoom = config?.maxNativeZoom ?? 15;

  const dateLocale = language === "hi" ? "hi-IN" : "en-IN";
  const meta = INDEX_META[activeIndex];

  // ---- Date slider ("time-lapse") ----------------------------------------
  // Stops come from the same time-series endpoint the trend chart uses, anchored
  // to the currently selected analysis date (`requestedDate`, "latest" → today).
  // The server window is [anchor-60d, anchor+30d] clipped to today, so the slider
  // re-centers on whichever date the farmer picks (via date input or trend tap)
  // and exposes ~2 months back plus forward real acquisitions around it. Sharing
  // the same query key as the chart means no extra fetch.
  const timelineDate = result?.requestedDate ?? "latest";
  const timelineEnabled = !!result && !result.noClearImage && lat != null && lng != null;
  const { data: timeline } = useQuery<{ today: string; points: TimelinePoint[] }>({
    queryKey: ["/api/plot-health/timeseries", lat, lng, boxSizeM, timelineDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        boxSizeM: String(boxSizeM),
        date: timelineDate,
      });
      const res = await fetch(`/api/plot-health/timeseries?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: timelineEnabled,
    // Keep the previous date's stops on screen while the re-centered window
    // refetches, so the slider control never momentarily unmounts (it only
    // renders when there are 2+ stops) when the farmer changes the date.
    placeholderData: keepPreviousData,
  });

  // Only real (non-estimated) acquisitions, oldest → newest, become slider stops.
  const sliderStops = useMemo(() => {
    const pts = (timeline?.points ?? []).filter((p) => !p.estimated);
    return [...pts].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [timeline]);

  // Index of the stop matching the currently shown image (exact, else nearest).
  const resolvedStopIndex = useMemo(() => {
    if (!result || sliderStops.length === 0) return -1;
    const exact = sliderStops.findIndex((p) => p.date === result.resolvedDate);
    if (exact >= 0) return exact;
    const target = Date.parse(`${result.resolvedDate}T00:00:00Z`);
    let best = -1;
    let bestDiff = Infinity;
    sliderStops.forEach((p, i) => {
      const diff = Math.abs(Date.parse(`${p.date}T00:00:00Z`) - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    });
    return best;
  }, [result, sliderStops]);

  const [sliderIndex, setSliderIndex] = useState(0);

  // Keep the thumb on the stop whose image is actually being shown.
  useEffect(() => {
    if (resolvedStopIndex >= 0) setSliderIndex(resolvedStopIndex);
  }, [resolvedStopIndex]);

  useEffect(() => () => cancelSliderDebounce(), []);

  // Run the full analyze for the date the slider last landed on. min–max ranges
  // + the crop verdict + history logging only happen here, on settle — never on
  // every intermediate drag step.
  function flushSliderCommit() {
    cancelSliderDebounce();
    const date = pendingSliderDateRef.current;
    pendingSliderDateRef.current = null;
    if (!date) return;
    if (date === result?.resolvedDate) {
      setPreviewDate(null); // already showing this day → nothing to fetch
      return;
    }
    setUseLatest(false);
    setDateValue(date);
    analyzeMutation.mutate({ date });
  }

  // While dragging: move the thumb + swap imagery/averages instantly from the
  // already-loaded chart data, with NO network call. A short fallback timer
  // settles the full pull in case the pointer-release event never fires.
  function handleSliderChange(idx: number) {
    setSliderIndex(idx);
    const stop = sliderStops[idx];
    if (!stop) return;
    setPreviewDate(stop.date);
    pendingSliderDateRef.current = stop.date;
    cancelSliderDebounce();
    sliderDebounceRef.current = setTimeout(flushSliderCommit, 500);
  }

  const currentStop = sliderStops[sliderIndex];
  const prevStop = sliderIndex > 0 ? sliderStops[sliderIndex - 1] : undefined;
  // True while the slider shows an instant preview from chart data and the
  // authoritative analyze for that day hasn't landed yet.
  const previewing = previewDate != null && previewDate !== result?.resolvedDate;
  // Lot averages to show: during a preview we have only the per-date means from
  // the trend data (no min–max); once settled we use the full analyzed stats.
  type DisplayCell = { mean: number; min: number | null; max: number | null };
  const displayIndices = useMemo<
    | { ndvi: DisplayCell | null; ndre: DisplayCell | null; ndmi: DisplayCell | null }
    | null
  >(() => {
    if (previewing && currentStop) {
      const cell = (v: number | null): DisplayCell | null =>
        v == null ? null : { mean: v, min: null, max: null };
      return { ndvi: cell(currentStop.ndvi), ndre: cell(currentStop.ndre), ndmi: cell(currentStop.ndmi) };
    }
    if (result?.stats) {
      return { ndvi: result.stats.ndvi, ndre: result.stats.ndre, ndmi: result.stats.ndmi };
    }
    return null;
  }, [previewing, currentStop, result]);
  const displayValidFraction = result?.stats?.validFraction ?? 1;
  const fmtStopShort = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" });

  if (config && !config.hasCredentials) {
    return (
      <Card className="p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" data-testid="card-plot-health-no-creds">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm mb-1">{t("phSetupNeeded")}</h4>
            <p className="text-sm text-muted-foreground">{t("phMissingCreds")}</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="plot-health-flow">
      {/* Location input */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" size="sm" onClick={handleGps} disabled={gpsLoading} data-testid="button-plot-gps">
            {gpsLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Navigation className="w-4 h-4 mr-1" />}
            {t("phUseGps")}
          </Button>
          {savedFarms.length > 0 && (
            <Select value="" onValueChange={handleSelectSavedFarm}>
              <SelectTrigger className="h-9 w-auto min-w-[140px]" data-testid="select-saved-farm">
                <SelectValue placeholder={t("phSavedFarms")} />
              </SelectTrigger>
              <SelectContent>
                {savedFarms.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)} data-testid={`option-farm-${f.id}`}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="text-xs text-muted-foreground self-center">{t("phOrTapMap")}</span>
        </div>
        {/* Task #143: crop + stage selection drives the health verdict. */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">{t("phCropInField")}</Label>
            <Select
              value={cropType}
              onValueChange={(v) => {
                setCropType(v);
                const stages = (PLOT_CROP_STAGES[v as PlotCropKey] ?? []) as readonly string[];
                if (!stages.includes(cropStage)) setCropStage("");
              }}
            >
              <SelectTrigger className="mt-1" data-testid="select-plot-crop">
                <SelectValue placeholder={t("phSelectCrop")} />
              </SelectTrigger>
              <SelectContent>
                {PLOT_CROP_KEYS.map((c) => (
                  <SelectItem key={c} value={c} data-testid={`option-crop-${c}`}>
                    {t(`phCrop_${c}` as any)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {cropType && cropType !== "barren" && (
            <div>
              <Label className="text-xs">{t("phCropStage")}</Label>
              <Select value={cropStage} onValueChange={setCropStage}>
                <SelectTrigger className="mt-1" data-testid="select-plot-stage">
                  <SelectValue placeholder={t("phSelectStage")} />
                </SelectTrigger>
                <SelectContent>
                  {((PLOT_CROP_STAGES[cropType as PlotCropKey] ?? []) as readonly string[]).map((s) => (
                    <SelectItem key={s} value={s} data-testid={`option-stage-${s}`}>
                      {t(`phStage_${s}` as any)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div>
            <Label htmlFor="plot-lat" className="text-xs">{t("phLatitude")}</Label>
            <Input
              id="plot-lat"
              value={latInput}
              inputMode="decimal"
              placeholder="23.1765"
              onChange={(e) => setLatInput(e.target.value)}
              className="mt-1"
              data-testid="input-plot-lat"
            />
          </div>
          <div>
            <Label htmlFor="plot-lng" className="text-xs">{t("phLongitude")}</Label>
            <Input
              id="plot-lng"
              value={lngInput}
              inputMode="decimal"
              placeholder="75.7885"
              onChange={(e) => setLngInput(e.target.value)}
              className="mt-1"
              data-testid="input-plot-lng"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleManualSet} data-testid="button-plot-set-coords">
              <MapPin className="w-4 h-4 mr-1" />
              {t("phSet")}
            </Button>
            <Button variant="outline" size="sm" onClick={openSaveDialog} data-testid="button-save-farm">
              <Bookmark className="w-4 h-4 mr-1" />
              {t("phSaveFarm")}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">{t("phBoxSize")}</Label>
            <Select value={String(boxSizeM)} onValueChange={(v) => setBoxSizeM(Number(v))}>
              <SelectTrigger className="mt-1" data-testid="select-plot-box">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(config?.boxSizes ?? [50, 100, 200]).map((s) => (
                  <SelectItem key={s} value={String(s)} data-testid={`option-box-${s}`}>
                    {s} m
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("phDate")}</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="date"
                value={dateValue}
                max={new Date().toISOString().slice(0, 10)}
                disabled={useLatest}
                onChange={(e) => setDateValue(e.target.value)}
                className="flex-1"
                data-testid="input-plot-date"
              />
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer" data-testid="toggle-plot-latest">
          <input
            type="checkbox"
            checked={useLatest}
            onChange={(e) => setUseLatest(e.target.checked)}
            className="w-4 h-4"
          />
          {t("phLatestClear")}
        </label>

        <Button
          onClick={() => {
            cancelSliderDebounce();
            analyzeMutation.mutate({});
          }}
          disabled={analyzeMutation.isPending || lat == null || lng == null}
          className="w-full"
          data-testid="button-plot-analyze"
        >
          {analyzeMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              {t("phAnalyzing")}
            </>
          ) : (
            <>
              <Satellite className="w-4 h-4 mr-1" />
              {t("phCheckHealth")}
            </>
          )}
        </Button>
      </div>

      <div ref={resultsTopRef} aria-hidden="true" />

      {/* No clear image */}
      {result?.noClearImage && (
        <Card className="p-3 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800" data-testid="text-plot-no-clear">
          <div className="flex items-start gap-2">
            <CloudRain className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
            <p className="text-sm">{t("phNoClearImage")}</p>
          </div>
        </Card>
      )}

      {/* Resolved acquisition date notice */}
      {result && !result.noClearImage && (
        <Card className="p-3 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800" data-testid="card-plot-date-notice">
          <div className="flex items-start gap-2">
            <Satellite className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span data-testid="text-plot-resolved-date">
                {t("phShowingImageFrom")}{" "}
                <strong>{new Date(result.acquisitionDate).toLocaleDateString(dateLocale)}</strong>
                {" · "}{t("phCloud")}: {result.cloudCover}%
              </span>
              {result.requestedDate !== "latest" && result.requestedDate !== result.resolvedDate && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1" data-testid="text-plot-date-mismatch">
                  {t("phDateMismatch")}
                </p>
              )}
              {result.requestedDate === "latest" && (
                <p className="text-xs text-muted-foreground mt-1" data-testid="text-plot-latest-note">
                  {t("phLatestActiveNote")}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Layer toggle */}
      {result && !result.noClearImage && (
        <div className="flex flex-wrap gap-2" data-testid="row-plot-layers">
          {(["truecolor", "ndvi", "ndre", "ndmi"] as IndexId[]).map((idx) => (
            <Button
              key={idx}
              size="sm"
              variant={activeIndex === idx ? "default" : "outline"}
              onClick={() => setActiveIndex(idx)}
              data-testid={`button-layer-${idx}`}
            >
              {t(`phIndex_${idx}` as any)}
            </Button>
          ))}
        </div>
      )}

      {/* Map */}
      <div className="rounded-md overflow-hidden border" style={{ height: "380px" }} data-testid="plot-map">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={15}
          minZoom={minZoom}
          maxZoom={maxZoom}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={maxZoom}
          />
          {overlayUrl && (
            <TileLayer
              key={`${activeIndex}-${displayDate}`}
              url={overlayUrl}
              opacity={opacity}
              maxNativeZoom={maxNativeZoom}
              maxZoom={maxZoom}
            />
          )}
          {lat != null && lng != null && (
            <>
              <Rectangle bounds={boxBounds(lat, lng, boxSizeM)} pathOptions={{ color: "#facc15", weight: 2, fillOpacity: 0 }} />
              <CircleMarker center={[lat, lng]} radius={4} pathOptions={{ color: "#facc15", fillColor: "#facc15", fillOpacity: 1 }} />
              <MapController lat={lat} lng={lng} boxSizeM={boxSizeM} maxZoom={maxZoom} />
            </>
          )}
          <ClickHandler onPick={pickLocation} />
        </MapContainer>
      </div>

      {/* Time-lapse date slider — drag through past acquisitions */}
      {result && !result.noClearImage && sliderStops.length >= 2 && (
        <div className="space-y-1" data-testid="plot-timeline">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium flex items-center gap-1">
              <History className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              {t("phTimeline")}
            </span>
            <span
              className="text-xs tabular-nums text-muted-foreground inline-flex items-center gap-1"
              data-testid="text-timeline-date"
            >
              {currentStop && (
                <>
                  {new Date(`${currentStop.date}T00:00:00Z`).toLocaleDateString(dateLocale, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {currentStop.ndvi != null && (
                    <span className="text-foreground">
                      · NDVI {currentStop.ndvi.toFixed(2)}
                      {prevStop?.ndvi != null && currentStop.ndvi !== prevStop.ndvi && (
                        <span
                          className={
                            currentStop.ndvi > prevStop.ndvi
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }
                        >
                          {" "}
                          {currentStop.ndvi > prevStop.ndvi ? "▲" : "▼"}
                        </span>
                      )}
                    </span>
                  )}
                  {analyzeMutation.isPending && (
                    <Loader2 className="w-3 h-3 animate-spin" data-testid="icon-timeline-settling" />
                  )}
                </>
              )}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={sliderStops.length - 1}
            step={1}
            value={sliderIndex}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            onPointerUp={flushSliderCommit}
            onTouchEnd={flushSliderCommit}
            onKeyUp={flushSliderCommit}
            className="w-full accent-emerald-600"
            data-testid="slider-plot-timeline"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{fmtStopShort(sliderStops[0].date)}</span>
            <span className="text-center">{t("phTimelineHint")}</span>
            <span>{fmtStopShort(sliderStops[sliderStops.length - 1].date)}</span>
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground -mt-2" data-testid="text-plot-resolution">
        {t("phResolutionNote")}
      </p>
      {result && !result.noClearImage && (
        <p className="text-[10px] text-muted-foreground -mt-3" data-testid="text-plot-base-helper">
          {t("phBaseVsDataNote")}
        </p>
      )}

      {/* Opacity + legend */}
      {result && !result.noClearImage && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("phOpacity")}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="flex-1 accent-emerald-600"
              data-testid="slider-plot-opacity"
            />
            <span className="text-xs tabular-nums w-9 text-right">{Math.round(opacity * 100)}%</span>
          </div>
          {meta.gradient && (
            <div data-testid="plot-legend">
              <div className="h-3 rounded" style={{ background: meta.gradient }} />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>{t(meta.lowKey as any)}</span>
                <span>{t(meta.highKey as any)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats panel */}
      {result && !result.noClearImage && (
        <Card className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 space-y-3" data-testid="card-plot-stats">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="font-semibold text-sm inline-flex items-center gap-2">
              {t("phLotStats")}
              {previewing && (
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                  data-testid="badge-stats-preview"
                >
                  {t("phPreviewTag")}
                </span>
              )}
            </h4>
            <span className="text-xs text-muted-foreground" data-testid="text-plot-acq-date">
              {t("phImageDate")}: {new Date(`${(previewing ? currentStop?.date : result.acquisitionDate) ?? result.acquisitionDate}T00:00:00Z`).toLocaleDateString(dateLocale)}
              {!previewing && <> · {t("phCloud")}: {result.cloudCover}%</>}
            </span>
          </div>
          {displayIndices && (displayIndices.ndvi || displayIndices.ndre || displayIndices.ndmi) ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                {(["ndvi", "ndre", "ndmi"] as const).map((k) => {
                  const st = displayIndices?.[k];
                  return (
                    <div key={k} className="bg-background/60 rounded p-2" data-testid={`stat-${k}`}>
                      <div className="text-[10px] text-muted-foreground uppercase">{t(`phIndex_${k}` as any)}</div>
                      <div className="text-lg font-bold tabular-nums">{st ? st.mean.toFixed(2) : "—"}</div>
                      <div className="text-[9px] text-muted-foreground">
                        {st && st.min != null && st.max != null ? `${st.min.toFixed(2)} – ${st.max.toFixed(2)}` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!previewing && displayValidFraction < 0.8 && (
                <p className="text-[10px] text-orange-600 dark:text-orange-400" data-testid="text-plot-low-valid">
                  {t("phPartialCloud")} ({Math.round(displayValidFraction * 100)}%)
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-plot-no-stats">
              {t("phNoStats")}
            </p>
          )}
        </Card>
      )}

      {/* Crop health assessment (Task #143) */}
      {result && !result.noClearImage && result.cropAssessment && result.cropAssessment.overall !== "none" && (() => {
        const a = result.cropAssessment!;
        const healthy = a.overall === "healthy";
        const guidance = language === "hi" ? a.guidanceHi : a.guidanceEn;
        const message = language === "hi" ? a.messageHi : a.messageEn;
        return (
          <Card
            className={
              "p-4 space-y-3 transition-opacity " +
              (previewing ? "opacity-60 " : "") +
              (healthy
                ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                : "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800")
            }
            data-testid="card-plot-assessment"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="font-semibold text-sm inline-flex items-center gap-2">
                {t("phAssessmentTitle")}
                {previewing && (
                  <span className="text-[10px] font-normal text-muted-foreground inline-flex items-center gap-1" data-testid="text-assessment-updating">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t("phPreviewUpdating")}
                  </span>
                )}
              </h4>
              <span className="text-xs text-muted-foreground">
                {t(`phCrop_${a.cropType}` as any)}
                {a.cropStage ? ` · ${t(`phStage_${a.cropStage}` as any)}` : ""}
              </span>
            </div>

            <div className="flex items-start gap-2" data-testid="text-plot-verdict">
              {healthy ? (
                <Satellite className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              )}
              <div>
                <div className={"text-sm font-semibold " + (healthy ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
                  {healthy ? t("phVerdictHealthy") : t("phVerdictAttention")}
                </div>
                <p className="text-xs text-foreground/80 mt-0.5">{message}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {(["ndvi", "ndre", "ndmi"] as const).map((k) => {
                const ix = a.indices[k];
                const statusLabel = ix.status === "ok" ? t("phStatusOk") : ix.status === "low" ? t("phStatusLow") : t("phStatusNa");
                const statusCls = ix.status === "ok"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : ix.status === "low"
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground";
                return (
                  <div key={k} className="bg-background/60 rounded p-2" data-testid={`assessment-${k}`}>
                    <div className="text-[10px] text-muted-foreground uppercase">{t(`phIndex_${k}` as any)}</div>
                    <div className="text-base font-bold tabular-nums">{ix.actual != null ? ix.actual.toFixed(2) : "—"}</div>
                    <div className="text-[9px] text-muted-foreground">
                      {t("phExpected")}: {ix.lower != null ? ix.lower.toFixed(2) : "—"}+
                    </div>
                    <div className={"text-[10px] font-semibold mt-0.5 " + statusCls}>{statusLabel}</div>
                    {ix.declined && (
                      <div
                        className="text-[9px] font-semibold mt-0.5 text-red-600 dark:text-red-400"
                        data-testid={`assessment-decline-${k}`}
                      >
                        ↓ {t("phDeclined")}
                        {ix.previous != null ? ` (${ix.previous.toFixed(2)})` : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {guidance && (
              <p className="text-xs text-foreground/80" data-testid="text-plot-guidance">
                <span className="font-semibold">{t("phGuidance")}: </span>{guidance}
              </p>
            )}
            {a.isGeneric && (
              <p className="text-[10px] text-muted-foreground" data-testid="text-plot-generic-note">{t("phGenericNote")}</p>
            )}
            {a.source && (
              <p className="text-[10px] text-muted-foreground" data-testid="text-plot-source">
                <span className="font-semibold">{t("phSource")}: </span>{a.source}
              </p>
            )}
          </Card>
        );
      })()}

      {/* Index trend chart */}
      {result && !result.noClearImage && lat != null && lng != null && (
        <PlotHealthChart
          lat={lat}
          lng={lng}
          boxSizeM={boxSizeM}
          date={result.requestedDate}
          selectedDate={displayDate}
          onPointClick={handleTrendPointClick}
        />
      )}

      {/* Weather panel */}
      {lat != null && lng != null && (
        <Card className="p-4 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800" data-testid="card-plot-weather">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
            <h4 className="font-semibold text-sm">{t("phWeather")}</h4>
            <span className="text-xs text-muted-foreground" data-testid="text-weather-date">
              {new Date(`${weatherDate}T00:00:00`).toLocaleDateString(dateLocale, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          {!weatherIsLive && (
            <p className="text-[10px] text-muted-foreground mb-3" data-testid="text-weather-historical">
              {t("phWeatherHistoricalNote")}
            </p>
          )}
          {weatherIsLive && <div className="mb-3" />}
          {weatherLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : weather ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="flex items-center gap-2" data-testid="weather-temp">
                  <Thermometer className="w-4 h-4 text-red-500 shrink-0" />
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t("phTemp")}</div>
                    <div className="text-sm font-semibold">{weather.temp != null ? `${Math.round(weather.temp)}°C` : "—"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2" data-testid="weather-humidity">
                  <Droplets className="w-4 h-4 text-blue-500 shrink-0" />
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t("phHumidity")}</div>
                    <div className="text-sm font-semibold">{weather.humidity != null ? `${weather.humidity}%` : "—"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2" data-testid="weather-rain">
                  <CloudRain className="w-4 h-4 text-sky-500 shrink-0" />
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t("phRain")}</div>
                    <div className="text-sm font-semibold">{weather.precip != null ? `${weather.precip} mm` : "—"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2" data-testid="weather-wind">
                  <Wind className="w-4 h-4 text-slate-500 shrink-0" />
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-[10px] text-muted-foreground">{t("phWind")}</div>
                      <div className="text-sm font-semibold">
                        {weather.windSpeed != null ? `${Math.round(weather.windSpeed)} km/h` : "—"}
                      </div>
                    </div>
                    {weather.windDir != null && (
                      <div className="flex flex-col items-center" data-testid="weather-wind-compass" title={`${t("phWindFrom")} ${cardinal(weather.windDir)} (${Math.round(weather.windDir)}°)`}>
                        <Navigation
                          className="w-5 h-5 text-slate-700 dark:text-slate-200"
                          style={{ transform: `rotate(${weather.windDir + 180}deg)` }}
                        />
                        <span className="text-[9px] text-muted-foreground">{cardinal(weather.windDir)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {weather.windGust != null && (
                <p className="text-[10px] text-muted-foreground mb-3" data-testid="weather-gust">
                  {t("phGusts")}: {Math.round(weather.windGust)} km/h · {t("phWindFrom")} {cardinal(weather.windDir)} ({Math.round(weather.windDir)}°)
                </p>
              )}
              <div className="flex gap-2">
                {weather.daily.map((d) => (
                  <div
                    key={d.date}
                    className={`flex-1 rounded p-2 text-center ${d.date === weatherDate ? "bg-sky-200/70 dark:bg-sky-700/40 ring-1 ring-sky-400" : "bg-background/60"}`}
                    data-testid={`weather-day-${d.date}`}
                  >
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(d.date).toLocaleDateString(dateLocale, { weekday: "short" })}
                    </div>
                    <div className="text-base">{weatherEmoji(d.code)}</div>
                    <div className="text-[10px] font-medium">
                      {Math.round(d.max)}° / {Math.round(d.min)}°
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("phWeatherUnavailable")}</p>
          )}
        </Card>
      )}

      {/* Task #152: save / manage farm plots */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent data-testid="dialog-save-farm">
          <DialogHeader>
            <DialogTitle>{t("phSaveFarm")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="save-farm-name" className="text-xs">{t("phFarmName")}</Label>
              <Input
                id="save-farm-name"
                value={farmNameInput}
                maxLength={60}
                placeholder={t("phFarmNamePlaceholder")}
                onChange={(e) => setFarmNameInput(e.target.value)}
                className="mt-1"
                data-testid="input-farm-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="save-farm-lat" className="text-xs">{t("phLatitude")}</Label>
                <Input
                  id="save-farm-lat"
                  value={saveLatInput}
                  inputMode="decimal"
                  placeholder="23.1765"
                  onChange={(e) => setSaveLatInput(e.target.value)}
                  className="mt-1"
                  data-testid="input-save-farm-lat"
                />
              </div>
              <div>
                <Label htmlFor="save-farm-lng" className="text-xs">{t("phLongitude")}</Label>
                <Input
                  id="save-farm-lng"
                  value={saveLngInput}
                  inputMode="decimal"
                  placeholder="75.7885"
                  onChange={(e) => setSaveLngInput(e.target.value)}
                  className="mt-1"
                  data-testid="input-save-farm-lng"
                />
              </div>
            </div>

            {savedFarms.length > 0 && (
              <div className="border-t pt-3">
                <Label className="text-xs text-muted-foreground">{t("phSavedFarms")}</Label>
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {savedFarms.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"
                      data-testid={`row-saved-farm-${f.id}`}
                    >
                      <button
                        type="button"
                        className="flex-1 text-left text-sm truncate hover:underline"
                        onClick={() => { handleSelectSavedFarm(String(f.id)); setSaveDialogOpen(false); }}
                        data-testid={`button-load-saved-farm-${f.id}`}
                      >
                        <span className="font-medium">{f.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {f.latitude.toFixed(4)}, {f.longitude.toFixed(4)}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive"
                        onClick={() => deleteFarmMutation.mutate(f.id)}
                        disabled={deleteFarmMutation.isPending}
                        data-testid={`button-delete-saved-farm-${f.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)} data-testid="button-cancel-save-farm">
              {t("cancel")}
            </Button>
            <Button onClick={handleSaveFarmConfirm} disabled={saveFarmMutation.isPending || !saveFarmValid} data-testid="button-confirm-save-farm">
              {saveFarmMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
