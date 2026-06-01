import { useMemo } from "react";
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
import { Loader2, TrendingUp } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

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
  return sorted.map((p, i) => {
    const real = !p.estimated;
    const bridge = i === lastRealIdx; // connector point for the dashed line
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
    };
  });
}

export function PlotHealthChart({
  lat,
  lng,
  boxSizeM,
  date,
  onPointClick,
}: {
  lat: number;
  lng: number;
  boxSizeM: number;
  date: string;
  onPointClick?: (date: string) => void;
}) {
  const { t, language } = useTranslation();
  const dateLocale = language === "hi" ? "hi-IN" : "en-IN";

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
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as ChartRow | undefined;
                    if (!row) return null;
                    return (
                      <div className="rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                        <div className="font-medium mb-1">
                          {fmtTick(row.ts)}
                          {row.estimated && (
                            <span className="ml-1 text-muted-foreground">({t("phTrendEstimatedTag")})</span>
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
    </Card>
  );
}
