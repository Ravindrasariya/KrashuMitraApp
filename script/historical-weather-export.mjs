#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";

const CITIES = [
  { name: "Delhi",      latitude: 28.61, longitude: 77.21 },
  { name: "Lucknow",    latitude: 26.85, longitude: 80.91 },
  { name: "Agra",       latitude: 27.18, longitude: 78.02 },
  { name: "Kanpur",     latitude: 26.45, longitude: 80.33 },
  { name: "Varanasi",   latitude: 25.32, longitude: 82.99 },
  { name: "Bhopal",     latitude: 23.26, longitude: 77.41 },
  { name: "Indore",     latitude: 22.72, longitude: 75.86 },
  { name: "Nagpur",     latitude: 21.15, longitude: 79.09 },
  { name: "Mumbai",     latitude: 19.08, longitude: 72.88 },
  { name: "Pune",       latitude: 18.52, longitude: 73.86 },
  { name: "Bangalore",  latitude: 12.97, longitude: 77.59 },
  { name: "Hyderabad",  latitude: 17.39, longitude: 78.49 },
  { name: "Surat",      latitude: 21.17, longitude: 72.83 },
  { name: "Patna",      latitude: 25.61, longitude: 85.14 },
  { name: "Chandigarh", latitude: 30.73, longitude: 76.78 },
  { name: "Jaipur",     latitude: 26.92, longitude: 75.79 },
];

const START_DATE = "2010-01-01";

// End date = today in IST (Asia/Kolkata).
const END_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const DAILY_FIELDS = [
  "temperature_2m_max", "temperature_2m_min", "temperature_2m_mean",
  "apparent_temperature_max", "apparent_temperature_min",
  "precipitation_sum", "rain_sum", "weather_code",
  "wind_speed_10m_max", "wind_gusts_10m_max",
  "et0_fao_evapotranspiration", "uv_index_max",
  "sunrise", "sunset", "daylight_duration",
];

const HOURLY_FIELDS = [
  "relative_humidity_2m", "dew_point_2m", "pressure_msl",
  "soil_temperature_0_to_7cm", "soil_temperature_7_to_28cm", "soil_temperature_28_to_100cm",
  "soil_moisture_0_to_7cm", "soil_moisture_7_to_28cm", "soil_moisture_28_to_100cm",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, label) {
  // Open-Meteo's archive returns 429 both for per-minute throttling AND for
  // single requests whose payload exceeds the soft compute budget (the 16-yr
  // × 9-hourly-var single call we tried first triggered this even on a fresh
  // IP). We back off aggressively (30s → 60s → 120s → 240s) so a brief throttle
  // ban gets a chance to lift.
  const backoffs = [30000, 60000, 120000, 240000, 480000, 900000, 900000];
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) {
        if (attempt === backoffs.length) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status} after ${backoffs.length + 1} attempts: ${body.slice(0, 200)}`);
        }
        const wait = backoffs[attempt];
        console.warn(`  ${label}: HTTP ${res.status}, retry ${attempt + 1}/${backoffs.length} after ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === backoffs.length) throw err;
      const wait = backoffs[attempt];
      console.warn(`  ${label}: ${err.message}, retry ${attempt + 1}/${backoffs.length} after ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw new Error("unreachable");
}

function listChunks(startISO, endISO, yearsPerChunk = 4) {
  // Group into multi-year windows so we make far fewer API calls (Open-Meteo's
  // free tier is shared per-IP and the Replit container shares an IP across
  // many users). 4-yr × 9 hourly vars × ~35k hrs ≈ ~315k values per request,
  // which Open-Meteo's archive accepts.
  const startY = parseInt(startISO.slice(0, 4), 10);
  const endY   = parseInt(endISO.slice(0, 4), 10);
  const out = [];
  for (let y = startY; y <= endY; y += yearsPerChunk) {
    const chunkEndY = Math.min(y + yearsPerChunk - 1, endY);
    const s = y === startY ? startISO : `${y}-01-01`;
    const e = chunkEndY === endY ? endISO : `${chunkEndY}-12-31`;
    out.push({ start: s, end: e });
  }
  return out;
}

function avgPerDay(hourlyTimes, hourlyValues) {
  // Returns Map<date YYYY-MM-DD, mean rounded to 2 decimals or null>.
  const buckets = new Map();
  for (let i = 0; i < hourlyTimes.length; i++) {
    const t = hourlyTimes[i];
    if (!t) continue;
    const day = t.slice(0, 10);
    const v = hourlyValues[i];
    if (v == null || Number.isNaN(v)) continue;
    let b = buckets.get(day);
    if (!b) { b = { sum: 0, n: 0 }; buckets.set(day, b); }
    b.sum += v; b.n += 1;
  }
  const out = new Map();
  for (const [day, b] of buckets) {
    out.set(day, b.n ? Math.round((b.sum / b.n) * 100) / 100 : null);
  }
  return out;
}

async function fetchCity(city) {
  const baseRoot = `https://archive-api.open-meteo.com/v1/archive?latitude=${city.latitude}&longitude=${city.longitude}&timezone=Asia%2FKolkata`;
  const dailyUrl = `${baseRoot}&start_date=${START_DATE}&end_date=${END_DATE}&daily=${DAILY_FIELDS.join(",")}`;

  console.log(`[${city.name}] fetching daily (full range)…`);
  const daily = await fetchWithRetry(dailyUrl, `${city.name}/daily`);
  await sleep(1200);

  // Hourly: chunk by year to stay under Open-Meteo's per-request soft limit.
  // 1 year × 9 vars × 8760 h ≈ 80k values per call, comfortably under cap.
  const dayMeans = {};
  for (const f of HOURLY_FIELDS) dayMeans[f] = new Map();

  const yearChunks = listChunks(START_DATE, END_DATE, 4);
  for (const chunk of yearChunks) {
    const hourlyUrl = `${baseRoot}&start_date=${chunk.start}&end_date=${chunk.end}&hourly=${HOURLY_FIELDS.join(",")}`;
    console.log(`[${city.name}] fetching hourly ${chunk.start}…${chunk.end}`);
    const hourly = await fetchWithRetry(hourlyUrl, `${city.name}/hourly/${chunk.start.slice(0, 4)}`);
    for (const f of HOURLY_FIELDS) {
      const partial = avgPerDay(hourly.hourly.time, hourly.hourly[f]);
      for (const [k, v] of partial) dayMeans[f].set(k, v);
    }
    await sleep(1200);
  }

  const dates = daily.daily.time;
  const rows = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const get = (k) => daily.daily[k]?.[i] ?? null;
    rows.push({
      city: city.name,
      latitude: city.latitude,
      longitude: city.longitude,
      date,
      temp_max: get("temperature_2m_max"),
      temp_min: get("temperature_2m_min"),
      temp_mean: get("temperature_2m_mean"),
      apparent_temp_max: get("apparent_temperature_max"),
      apparent_temp_min: get("apparent_temperature_min"),
      precipitation_sum: get("precipitation_sum"),
      rain_sum: get("rain_sum"),
      weather_code: get("weather_code"),
      wind_speed_max: get("wind_speed_10m_max"),
      wind_gusts_max: get("wind_gusts_10m_max"),
      humidity_mean: dayMeans.relative_humidity_2m.get(date) ?? null,
      dew_point_mean: dayMeans.dew_point_2m.get(date) ?? null,
      pressure_mean: dayMeans.pressure_msl.get(date) ?? null,
      soil_temp_0_7cm:    dayMeans.soil_temperature_0_to_7cm.get(date) ?? null,
      soil_temp_7_28cm:   dayMeans.soil_temperature_7_to_28cm.get(date) ?? null,
      soil_temp_28_100cm: dayMeans.soil_temperature_28_to_100cm.get(date) ?? null,
      soil_moisture_0_7cm:    dayMeans.soil_moisture_0_to_7cm.get(date) ?? null,
      soil_moisture_7_28cm:   dayMeans.soil_moisture_7_to_28cm.get(date) ?? null,
      soil_moisture_28_100cm: dayMeans.soil_moisture_28_to_100cm.get(date) ?? null,
      et0: get("et0_fao_evapotranspiration"),
      uv_index_max: get("uv_index_max"),
      sunrise: get("sunrise"),
      sunset: get("sunset"),
      daylight_duration_sec: get("daylight_duration"),
    });
  }
  console.log(`[${city.name}] ${rows.length} rows`);
  return rows;
}

import { existsSync, readFileSync } from "node:fs";

const CACHE_DIR = resolve(process.cwd(), "exports/_cache");

async function fetchCityCached(city) {
  const cachePath = resolve(CACHE_DIR, `${city.name}.json`);
  if (existsSync(cachePath)) {
    console.log(`[${city.name}] cache HIT, skipping`);
    return JSON.parse(readFileSync(cachePath, "utf8"));
  }
  const rows = await fetchCity(city);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(rows));
  console.log(`[${city.name}] cached → ${cachePath}`);
  return rows;
}

async function main() {
  console.log(`Range: ${START_DATE} → ${END_DATE} (IST)`);

  // CLI args: either city names to fetch, or "build" to assemble the xlsx
  // from the per-city caches. No args = fetch everything then build.
  const args = process.argv.slice(2);
  const buildOnly = args.length === 1 && args[0] === "build";
  const targets = buildOnly || args.length === 0
    ? CITIES
    : CITIES.filter((c) => args.includes(c.name));

  if (!buildOnly) {
    console.log(`Fetching: ${targets.map((c) => c.name).join(", ")}`);
    for (const city of targets) {
      await fetchCityCached(city);
      await sleep(500);
    }
  }

  // Assembly step — only when every city is cached.
  const haveAll = CITIES.every((c) => existsSync(resolve(CACHE_DIR, `${c.name}.json`)));
  if (!haveAll) {
    const missing = CITIES.filter((c) => !existsSync(resolve(CACHE_DIR, `${c.name}.json`))).map((c) => c.name);
    console.log(`Caches missing for: ${missing.join(", ")} — run again to fetch them.`);
    return;
  }
  const allRows = [];
  for (const city of CITIES) {
    allRows.push(...JSON.parse(readFileSync(resolve(CACHE_DIR, `${city.name}.json`), "utf8")));
  }

  // Sort by (city ASC, date ASC) — fetch order is already city-grouped, but
  // sort defensively in case of future parallelism.
  allRows.sort((a, b) => (a.city < b.city ? -1 : a.city > b.city ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  console.log(`Total rows: ${allRows.length}`);
  console.log("Building workbook…");

  const ws = XLSX.utils.json_to_sheet(allRows);

  // Freeze top row + sensible column widths.
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!cols"] = [
    { wch: 12 }, { wch: 9 }, { wch: 9 }, { wch: 11 },
    { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 11 }, { wch: 11 },
    { wch: 11 }, { wch: 9 }, { wch: 8 }, { wch: 11 }, { wch: 11 },
    { wch: 9 }, { wch: 9 }, { wch: 9 },
    { wch: 11 }, { wch: 11 }, { wch: 12 },
    { wch: 13 }, { wch: 13 }, { wch: 14 },
    { wch: 7 }, { wch: 9 }, { wch: 18 }, { wch: 18 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "historical_weather");

  const outPath = resolve(process.cwd(), "exports/historical_weather_2010_to_today.xlsx");
  mkdirSync(resolve(process.cwd(), "exports"), { recursive: true });
  XLSX.writeFile(wb, outPath);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
