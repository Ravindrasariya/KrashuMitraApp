import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import {
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning,
  CloudDrizzle, CloudFog, Loader2, MapPin, Droplets, Wind, Thermometer, X
} from "lucide-react";

const CACHE_KEY = "krashu-weather-cache";
const LOCATION_CACHE_KEY = "krashu-location-cache";
const CACHE_DURATION_MS = 30 * 60 * 1000;
const DEFAULT_LAT = 28.6139;
const DEFAULT_LNG = 77.2090;

function getCachedLocation(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.lat && data.lng) return data;
    return null;
  } catch {
    return null;
  }
}

function setCachedLocation(lat: number, lng: number) {
  localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify({ lat, lng }));
}

interface WeatherData {
  current: {
    temperature: number;
    humidity: number;
    weatherCode: number;
    windSpeed: number;
  };
  daily: Array<{
    date: string;
    weatherCode: number;
    tempMax: number;
    tempMin: number;
    precipitation: number;
  }>;
  lat: number;
  lng: number;
  timestamp: number;
}

type WeatherDescKey =
  | "weatherClearSky"
  | "weatherPartlyCloudy"
  | "weatherCloudy"
  | "weatherFoggy"
  | "weatherDrizzle"
  | "weatherRainy"
  | "weatherSnowy"
  | "weatherThunderstorm";

function getWeatherInfo(code: number): { icon: typeof Sun; descKey: WeatherDescKey } {
  if (code === 0) return { icon: Sun, descKey: "weatherClearSky" };
  if (code <= 3) return { icon: Cloud, descKey: code <= 1 ? "weatherPartlyCloudy" : "weatherCloudy" };
  if (code <= 49) return { icon: CloudFog, descKey: "weatherFoggy" };
  if (code <= 59) return { icon: CloudDrizzle, descKey: "weatherDrizzle" };
  if (code <= 69) return { icon: CloudRain, descKey: "weatherRainy" };
  if (code <= 79) return { icon: CloudSnow, descKey: "weatherSnowy" };
  if (code <= 82) return { icon: CloudRain, descKey: "weatherRainy" };
  if (code <= 86) return { icon: CloudSnow, descKey: "weatherSnowy" };
  if (code <= 99) return { icon: CloudLightning, descKey: "weatherThunderstorm" };
  return { icon: Cloud, descKey: "weatherCloudy" };
}

function getCachedWeather(): WeatherData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data: WeatherData = JSON.parse(raw);
    if (Date.now() - data.timestamp > CACHE_DURATION_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function formatDay(dateStr: string, index: number, language: string, t: (key: any) => string): string {
  if (index === 0) return t("weatherToday");
  if (index === 1) return t("weatherTomorrow");
  const date = new Date(dateStr + "T00:00:00");
  const days_hi = ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"];
  const days_en = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayNames = language === "hi" ? days_hi : days_en;
  return dayNames[date.getDay()];
}

export function WeatherWidget() {
  const { t, language } = useTranslation();
  const [weather, setWeather] = useState<WeatherData | null>(getCachedWeather);
  const [loading, setLoading] = useState(!getCachedWeather());
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  const fetchWeather = useCallback(async (lat: number, lng: number) => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=Asia%2FKolkata&forecast_days=3`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();

      const data: WeatherData = {
        current: {
          temperature: Math.round(json.current.temperature_2m),
          humidity: json.current.relative_humidity_2m,
          weatherCode: json.current.weather_code,
          windSpeed: Math.round(json.current.wind_speed_10m),
        },
        daily: json.daily.time.map((date: string, i: number) => ({
          date,
          weatherCode: json.daily.weather_code[i],
          tempMax: Math.round(json.daily.temperature_2m_max[i]),
          tempMin: Math.round(json.daily.temperature_2m_min[i]),
          precipitation: json.daily.precipitation_sum[i],
        })),
        lat,
        lng,
        timestamp: Date.now(),
      };

      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      setWeather(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getCachedWeather();
    if (cached) {
      setWeather(cached);
      setLoading(false);
      return;
    }

    const cachedLoc = getCachedLocation();
    if (cachedLoc) {
      fetchWeather(cachedLoc.lat, cachedLoc.lng);
      return;
    }

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCachedLocation(pos.coords.latitude, pos.coords.longitude);
          fetchWeather(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          setCachedLocation(DEFAULT_LAT, DEFAULT_LNG);
          fetchWeather(DEFAULT_LAT, DEFAULT_LNG);
        },
        { timeout: 5000 }
      );
    } else {
      setCachedLocation(DEFAULT_LAT, DEFAULT_LNG);
      fetchWeather(DEFAULT_LAT, DEFAULT_LNG);
    }
  }, [fetchWeather]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    if (expanded) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [expanded]);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/80 backdrop-blur border text-xs text-muted-foreground" data-testid="weather-loading">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="hidden sm:inline">{t("weatherLoading")}</span>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/80 backdrop-blur border text-xs text-muted-foreground" data-testid="weather-error">
        <Cloud className="w-3.5 h-3.5" />
        <span>{t("weatherError")}</span>
      </div>
    );
  }

  const { icon: WeatherIcon, descKey } = getWeatherInfo(weather.current.weatherCode);

  return (
    <div className="relative" ref={widgetRef}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/80 backdrop-blur border text-base transition-colors"
        data-testid="button-weather-toggle"
      >
        <WeatherIcon className="w-4 h-4 text-amber-500" />
        <span className="font-semibold" data-testid="text-weather-temp">{weather.current.temperature}°C</span>
      </button>

      {expanded && (
        <Card className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] p-4 z-50 shadow-lg border" data-testid="weather-detail-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              {t("weatherTitle")}
            </h3>
            <button onClick={() => setExpanded(false)} className="text-muted-foreground" data-testid="button-weather-close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-muted/50">
            <WeatherIcon className="w-10 h-10 text-amber-500" />
            <div>
              <p className="text-2xl font-bold" data-testid="text-weather-detail-temp">{weather.current.temperature}°C</p>
              <p className="text-xs text-muted-foreground">{t(descKey)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="flex flex-col items-center p-2 rounded-md bg-muted/30">
              <Droplets className="w-4 h-4 text-blue-500 mb-1" />
              <span className="text-xs text-muted-foreground">{t("weatherHumidity")}</span>
              <span className="text-sm font-semibold" data-testid="text-weather-humidity">{weather.current.humidity}%</span>
            </div>
            <div className="flex flex-col items-center p-2 rounded-md bg-muted/30">
              <Wind className="w-4 h-4 text-teal-500 mb-1" />
              <span className="text-xs text-muted-foreground">{t("weatherWind")}</span>
              <span className="text-sm font-semibold" data-testid="text-weather-wind">{weather.current.windSpeed} km/h</span>
            </div>
            <div className="flex flex-col items-center p-2 rounded-md bg-muted/30">
              <Thermometer className="w-4 h-4 text-red-500 mb-1" />
              <span className="text-xs text-muted-foreground">{t("weatherMax")}</span>
              <span className="text-sm font-semibold" data-testid="text-weather-max">{weather.daily[0]?.tempMax}°</span>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">{t("weatherForecast")}</h4>
            <div className="space-y-2">
              {weather.daily.map((day, i) => {
                const { icon: DayIcon } = getWeatherInfo(day.weatherCode);
                return (
                  <div key={day.date} className="flex items-center justify-between text-sm" data-testid={`weather-forecast-day-${i}`}>
                    <span className="w-12 text-xs font-medium">{formatDay(day.date, i, language, t)}</span>
                    <DayIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-blue-500 w-14 text-right">
                      {day.precipitation > 0 ? `${day.precipitation}mm` : "-"}
                    </span>
                    <span className="text-xs w-16 text-right">
                      <span className="text-muted-foreground">{day.tempMin}°</span>
                      {" / "}
                      <span className="font-semibold">{day.tempMax}°</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
