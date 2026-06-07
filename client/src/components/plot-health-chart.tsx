import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, TrendingUp, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";
import {
  computeConfidence,
  CONFIDENCE_CLASSES,
  type ConfidenceBand,
} from "@/lib/plot-confidence";

const BAND_LABEL_KEY: Record<ConfidenceBand, "phConfHigh" | "phConfMedium" | "phConfLow"> = {
  high: "phConfHigh",
  medium: "phConfMedium",
  low: "phConfLow",
};

interface TimeSeriesPoint {
  date: string;
  ndvi: number | null;
  ndre: number | null;
  ndmi: number | null;
  validFraction: number;
  estimated: boolean;
}

interface TimeSeriesResponse {
  lat: number;
  lng: number;
  boxSizeM: number;
  anchorDate: string;
  windowStart: string;
  windowEnd: string;
  today: string;
  points: TimeSeriesPoint[];
}

const COLORS = {
  ndvi: "#16a34a", // green — greenness
  ndre: "#f59e0b", // amber — nutrition
  ndmi: "#2563eb", // blue — moisture
} as const;

type MetricKey = "ndvi" | "ndre" | "ndmi";
const METRICS: MetricKey[] = ["ndvi", "ndre", "ndmi"];

// Chart row carries a solid series (real) and a dashed series (*Est) per metric.
interface ChartRow {
  date: string;
  ts: number;
  ndvi: number | null;
  ndre: number | null;
  ndmi: number | null;
  ndviEst: number | null;
  ndreEst: number | null;
  ndmiEst: number | null;
  estimated: boolean;
  // Single combined confidence for the reading (null for estimated/forecast).
  confidencePct: number | null;
  confidenceBand: ConfidenceBand | null;
}

function buildRows(points: TimeSeriesPoint[]): ChartRow[] {
  const sorted = [...points].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  // Index of the last real point — its values are duplicated into the dashed
  // series so the estimated line visually connects to the solid one.
  let lastRealIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (!sorted[i].estimated) lastRealIdx = i;
  }
  // Confidence is computed per *real* reading against its nearest real
  // neighbours (estimated points are excluded from the artifact check).
  const reals = sorted.filter((p) => !p.estimated);
  const confByDate = new Map<string, { pct: number; band: ConfidenceBand }>();
  reals.forEach((p, i) => {
    confByDate.set(p.date, computeConfidence(p.validFraction, p, reals[i - 1] ?? null, reals[i + 1] ?? null));
  });
  return sorted.map((p, i) => {
    const real = !p.estimated;
    const bridge = i === lastRealIdx; // connector point for the dashed line
    const conf = real ? confByDate.get(p.date) : undefined;
    return {
      date: p.date,
      ts: Date.parse(`${p.date}T00:00:00Z`),
      ndvi: real ? p.ndvi : null,
      ndre: real ? p.ndre : null,
      ndmi: real ? p.ndmi : null,
      ndviEst: !real ? p.ndvi : bridge ? p.ndvi : null,
      ndreEst: !real ? p.ndre : bridge ? p.ndre : null,
      ndmiEst: !real ? p.ndmi : bridge ? p.ndmi : null,
      estimated: p.estimated,
      confidencePct: conf ? conf.pct : null,
      confidenceBand: conf ? conf.band : null,
    };
  });
}

export function PlotHealthChart({
  lat,
  lng,
  boxSizeM,
  date,
  selectedDate,
  onPointClick,
}: {
  lat: number;
  lng: number;
  boxSizeM: number;
  date: string;
  selectedDate?: string;
  onPointClick?: (date: string) => void;
}) {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const dateLocale = language === "hi" ? "hi-IN" : "en-IN";

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const ninetyAgoStr = useMemo(
    () => new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
    [],
  );
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvStart, setCsvStart] = useState(ninetyAgoStr);
  const [csvEnd, setCsvEnd] = useState(todayStr);
  const [csvBusy, setCsvBusy] = useState(false);

  const handleCsvDownload = async () => {
    if (csvStart > csvEnd) {
      toast({ title: t("phCsvInvalidRange"), variant: "destructive" });
      return;
    }
    setCsvBusy(true);
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        boxSizeM: String(boxSizeM),
        start: csvStart,
        end: csvEnd,
      });
      const res = await fetch(`/api/plot-health/timeseries-range?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = (await res.json()) as { lat: number; lng: number; points: TimeSeriesPoint[] };
      const reals = (json.points ?? []).filter((p) => !p.estimated);
      if (reals.length === 0) {
        toast({ title: t("phCsvEmpty") });
        setCsvBusy(false);
        return;
      }
      const latStr = json.lat.toFixed(6);
      const lngStr = json.lng.toFixed(6);

      // Actual recorded historical weather per calendar day at the plot. Open-Meteo's
      // /v1/forecast serves the recent past (~last 92 days) when given past dates, and
      // /v1/archive (ERA5, lags ~5 days) covers older dates — neither returns predictions
      // for past dates. The range can span both, so fetch each window and merge by date.
      // Any failure leaves weather cells blank but never blocks the CSV download.
      type DayWeather = { max: number | null; min: number | null; humidity: number | null; rain: number | null };
      const weatherByDate = new Map<string, DayWeather>();
      try {
        const dayMs = 86400000;
        const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
        const clampEnd = csvEnd > todayStr ? todayStr : csvEnd;
        // Forecast covers dates with daysAgo <= 90 (i.e. on/after today-90d); archive the rest.
        const recentStartStr = new Date(todayMs - 90 * dayMs).toISOString().slice(0, 10);
        const archiveEndStr = new Date(todayMs - 91 * dayMs).toISOString().slice(0, 10);
        const fetchWeatherInto = async (base: string, s: string, e: string) => {
          const url = `${base}?latitude=${lat}&longitude=${lng}&start_date=${s}&end_date=${e}`
            + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum`
            + `&hourly=relative_humidity_2m&timezone=Asia%2FKolkata`;
          const d = await fetch(url).then((r) => r.json());
          const daily = d?.daily || {};
          const times: string[] = daily.time || [];
          const humAcc = new Map<string, { sum: number; n: number }>();
          const ht: string[] = d?.hourly?.time || [];
          const hh: number[] = d?.hourly?.relative_humidity_2m || [];
          ht.forEach((tstr, i) => {
            const v = hh[i];
            if (v == null || !Number.isFinite(v)) return;
            const day = tstr.slice(0, 10);
            const cur = humAcc.get(day) ?? { sum: 0, n: 0 };
            cur.sum += v;
            cur.n += 1;
            humAcc.set(day, cur);
          });
          times.forEach((day, i) => {
            const max = daily.temperature_2m_max?.[i];
            const min = daily.temperature_2m_min?.[i];
            const rain = daily.precipitation_sum?.[i];
            const hum = humAcc.get(day);
            weatherByDate.set(day, {
              max: max == null ? null : Math.round(max * 10) / 10,
              min: min == null ? null : Math.round(min * 10) / 10,
              humidity: hum && hum.n ? Math.round(hum.sum / hum.n) : null,
              rain: rain == null ? null : Math.round(rain * 10) / 10,
            });
          });
        };
        const jobs: Promise<void>[] = [];
        const forecastStart = csvStart > recentStartStr ? csvStart : recentStartStr;
        if (forecastStart <= clampEnd) {
          jobs.push(fetchWeatherInto("https://api.open-meteo.com/v1/forecast", forecastStart, clampEnd));
        }
        const archiveEnd = clampEnd < archiveEndStr ? clampEnd : archiveEndStr;
        if (csvStart <= archiveEnd) {
          jobs.push(fetchWeatherInto("https://archive-api.open-meteo.com/v1/archive", csvStart, archiveEnd));
        }
        await Promise.allSettled(jobs);
      } catch {
        // Weather is best-effort; leave cells blank on failure.
      }

      const header = [
        "Date", "Lat", "Long", "NDVI", "NDRE", "NDMI", "Confidence %", "Confidence Level",
        "Max Temp (°C)", "Min Temp (°C)", "Humidity (%)", "Rain (mm)", "Cloud Cover (%)",
      ];
      const numCell = (v: number | null) => (v == null ? "" : String(v));
      const csvCell = (v: string) =>
        /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      const toRow = (cells: string[]) => cells.map(csvCell).join(",");
      const lines = [toRow(header)];
      reals.forEach((p, i) => {
        const conf = computeConfidence(p.validFraction, p, reals[i - 1] ?? null, reals[i + 1] ?? null);
        const w = weatherByDate.get(p.date);
        const cloud = Number.isFinite(p.validFraction)
          ? Math.max(0, Math.min(100, Math.round((1 - p.validFraction) * 100)))
          : null;
        lines.push(
          toRow([
            p.date,
            latStr,
            lngStr,
            numCell(p.ndvi),
            numCell(p.ndre),
            numCell(p.ndmi),
            String(conf.pct),
            t(BAND_LABEL_KEY[conf.band]),
            numCell(w?.max ?? null),
            numCell(w?.min ?? null),
            numCell(w?.humidity ?? null),
            numCell(w?.rain ?? null),
            numCell(cloud),
          ]),
        );
      });
      const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plot-health_${latStr}_${lngStr}_${csvStart}_${csvEnd}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setCsvOpen(false);
    } catch {
      toast({ title: t("phCsvFailed"), variant: "destructive" });
    } finally {
      setCsvBusy(false);
    }
  };

  const { data, isLoading, isError } = useQuery<TimeSeriesResponse>({
    queryKey: ["/api/plot-health/timeseries", lat, lng, boxSizeM, date],
    queryFn: async () => {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        boxSizeM: String(boxSizeM),
        date: date || "latest",
      });
      const res = await fetch(`/api/plot-health/timeseries?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: Number.isFinite(lat) && Number.isFinite(lng),
  });

  const rows = useMemo(() => (data ? buildRows(data.points) : []), [data]);
  const hasRealData = useMemo(
    () => (data?.points ?? []).some((p) => !p.estimated),
    [data],
  );
  const todayTs = useMemo(
    () => (data ? Date.parse(`${data.today}T00:00:00Z`) : null),
    [data],
  );
  // Persistent marker for the date whose imagery is currently shown, so the
  // chart stays in sync with the date slider / date input / map.
  const selectedTs = useMemo(
    () => (selectedDate ? Date.parse(`${selectedDate}T00:00:00Z`) : null),
    [selectedDate],
  );

  const fmtTick = (ts: number) =>
    new Date(ts).toLocaleDateString(dateLocale, { day: "numeric", month: "short" });

  const clickable = typeof onPointClick === "function";

  // Recharts fires this on both mouse-click and touch-tap, surfacing the
  // nearest data point via activePayload. We only act on real (solid) points.
  const handleChartClick = (state: any) => {
    if (!clickable) return;
    const row = state?.activePayload?.[0]?.payload as ChartRow | undefined;
    if (!row || row.estimated) return;
    onPointClick!(row.date);
  };

  const Header = (
    <div className="flex items-center gap-2 mb-1">
      <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
      <h4 className="font-semibold text-sm">{t("phTrendTitle")}</h4>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="ml-auto h-7 w-7 text-emerald-700 dark:text-emerald-400 hover-elevate"
        onClick={() => setCsvOpen(true)}
        title={t("phCsvDownload")}
        aria-label={t("phCsvDownload")}
        data-testid="button-download-csv"
      >
        <Download className="w-4 h-4" />
      </Button>
    </div>
  );

  return (
    <Card className="p-4 space-y-2" data-testid="card-plot-trend">
      {Header}
      <p className="text-[11px] text-muted-foreground">{t("phTrendSubtitle")}</p>
      {clickable && hasRealData && rows.length > 0 && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400" data-testid="text-trend-tap-hint">
          {t("phTrendTapHint")}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground" data-testid="text-trend-loading">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">{t("phTrendLoading")}</span>
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-trend-failed">
          {t("phTrendFailed")}
        </p>
      ) : !hasRealData || rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-trend-empty">
          {t("phTrendEmpty")}
        </p>
      ) : (
        <>
          <div
            className={`h-64 w-full${clickable ? " [&_.recharts-dot]:cursor-pointer" : ""}`}
            data-testid="chart-plot-trend"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={rows}
                margin={{ top: 8, right: 8, bottom: 4, left: -16 }}
                onClick={clickable ? handleChartClick : undefined}
                style={clickable ? { cursor: "pointer" } : undefined}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={fmtTick}
                  tick={{ fontSize: 10 }}
                  minTickGap={24}
                />
                <YAxis
                  domain={[(min: number) => Math.floor((min - 0.05) * 10) / 10, (max: number) => Math.ceil((max + 0.05) * 10) / 10]}
                  tick={{ fontSize: 10 }}
                  width={40}
                />
                {todayTs != null && (
                  <ReferenceLine
                    x={todayTs}
                    stroke="#64748b"
                    strokeDasharray="2 2"
                    label={{ value: t("phTrendToday"), position: "top", fontSize: 10, fill: "#64748b" }}
                  />
                )}
                {selectedTs != null && selectedTs !== todayTs && (
                  <ReferenceLine
                    x={selectedTs}
                    stroke="#059669"
                    strokeWidth={2}
                    label={{
                      value: fmtTick(selectedTs),
                      position: "insideTopLeft",
                      fontSize: 10,
                      fill: "#059669",
                    }}
                  />
                )}
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as ChartRow | undefined;
                    if (!row) return null;
                    const confBand = row.confidenceBand;
                    return (
                      <div className="rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                        <div className="font-medium mb-1">
                          {fmtTick(row.ts)}
                          {row.estimated && (
                            <span className="ml-1 text-muted-foreground">({t("phTrendEstimatedTag")})</span>
                          )}
                        </div>
                        <div
                          className="flex items-center justify-between gap-3 mb-1 pb-1 border-b border-border/40"
                          data-testid="tooltip-confidence"
                        >
                          <span className="text-muted-foreground">{t("phConfidence")}</span>
                          {row.estimated || confBand == null || row.confidencePct == null ? (
                            <span className="font-semibold text-muted-foreground">{t("phConfEstimate")}</span>
                          ) : (
                            <span className={"font-semibold flex items-center gap-1.5 " + CONFIDENCE_CLASSES[confBand].text}>
                              <span className={"inline-block w-2 h-2 rounded-full " + CONFIDENCE_CLASSES[confBand].dot} />
                              {row.confidencePct}% ({t(`phConf${confBand.charAt(0).toUpperCase() + confBand.slice(1)}` as any)})
                            </span>
                          )}
                        </div>
                        <div className="grid gap-0.5">
                          {METRICS.map((m) => {
                            const v = row.estimated ? row[`${m}Est` as const] : row[m];
                            if (v == null) return null;
                            return (
                              <div key={m} className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5">
                                  <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS[m] }} />
                                  <span className="text-muted-foreground">{t(`phIndex_${m}` as any)}</span>
                                </span>
                                <span className="font-mono tabular-nums">{v.toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={28}
                  formatter={(value) => {
                    const key = String(value).replace(/Est$/, "");
                    if (key !== value) return null; // hide dashed-series legend entries
                    return <span className="text-xs text-muted-foreground">{t(`phIndex_${key}` as any)}</span>;
                  }}
                />
                {METRICS.map((m) => (
                  <Line
                    key={m}
                    type="monotone"
                    dataKey={m}
                    name={m}
                    stroke={COLORS[m]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
                {METRICS.map((m) => (
                  <Line
                    key={`${m}Est`}
                    type="monotone"
                    dataKey={`${m}Est`}
                    name={`${m}Est`}
                    stroke={COLORS[m]}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                    legendType="none"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground" data-testid="text-trend-estimated-note">
            {t("phTrendEstimatedNote")}
          </p>
        </>
      )}

      <Dialog open={csvOpen} onOpenChange={(o) => !csvBusy && setCsvOpen(o)}>
        <DialogContent className="sm:max-w-sm" data-testid="dialog-csv">
          <DialogHeader>
            <DialogTitle>{t("phCsvTitle")}</DialogTitle>
            <DialogDescription>{t("phCsvDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="csv-start">{t("phCsvStart")}</Label>
              <Input
                id="csv-start"
                type="date"
                value={csvStart}
                max={csvEnd || todayStr}
                onChange={(e) => setCsvStart(e.target.value)}
                data-testid="input-csv-start"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="csv-end">{t("phCsvEnd")}</Label>
              <Input
                id="csv-end"
                type="date"
                value={csvEnd}
                min={csvStart}
                max={todayStr}
                onChange={(e) => setCsvEnd(e.target.value)}
                data-testid="input-csv-end"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCsvOpen(false)}
              disabled={csvBusy}
              data-testid="button-csv-cancel"
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleCsvDownload}
              disabled={csvBusy}
              data-testid="button-csv-confirm"
            >
              {csvBusy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  {t("phCsvLoading")}
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-1.5" />
                  {t("phCsvConfirm")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
