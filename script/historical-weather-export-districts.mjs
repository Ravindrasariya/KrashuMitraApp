#!/usr/bin/env node
// Task #127 — Historical weather export for 63 Indian districts.
// 28-col schema matching the prior exports (#125/#126/MP): hourly fields kept
// as the single 06:00 IST snapshot per day so the existing exports/_cache/
// JSONs for 15 already-fetched cities are reusable as-is.
// Free Open-Meteo archive endpoint; on first 429 we exit cleanly so the next
// run picks up exactly where this one stopped.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";

// Fetch order: Ratlam + Jhabua FIRST (user priority), then the other 46 new
// cities, then the 15 already-cached cities (they cache-HIT and skip — no
// API cost). Sort at workbook-write time is alphabetical by city anyway.
const CITIES = [
  // Priority
  { name: "Ratlam",            latitude: 23.33, longitude: 75.04 },
  { name: "Jhabua",            latitude: 22.77, longitude: 74.59 },
  // Other new cities (need fetch)
  { name: "Sholapur",          latitude: 17.66, longitude: 75.91 },
  { name: "Nashik",            latitude: 19.99, longitude: 73.79 },
  { name: "Bhavnagar",         latitude: 21.77, longitude: 72.15 },
  { name: "Baran",             latitude: 25.10, longitude: 76.51 },
  { name: "Jhalawar",          latitude: 24.60, longitude: 76.16 },
  { name: "Kota",              latitude: 25.21, longitude: 75.86 },
  { name: "Bundi",             latitude: 25.44, longitude: 75.64 },
  { name: "Chittorgarh",       latitude: 24.88, longitude: 74.63 },
  { name: "Farrukhabad",       latitude: 27.39, longitude: 79.58 },
  { name: "Firozabad",         latitude: 27.16, longitude: 78.40 },
  { name: "Murshidabad",       latitude: 24.18, longitude: 88.27 },
  { name: "Ujjain",            latitude: 23.18, longitude: 75.78 },
  { name: "Dewas",             latitude: 22.96, longitude: 76.06 },
  { name: "Sehore",            latitude: 23.20, longitude: 77.09 },
  { name: "Rajgarh",           latitude: 24.01, longitude: 76.73 },
  { name: "Dhar",              latitude: 22.60, longitude: 75.30 },
  { name: "Buldhana",          latitude: 20.53, longitude: 76.18 },
  { name: "Latur",             latitude: 18.40, longitude: 76.58 },
  { name: "Nanded",            latitude: 19.15, longitude: 77.31 },
  { name: "Dharashiv",         latitude: 18.19, longitude: 76.04 },
  { name: "Washim",            latitude: 20.10, longitude: 77.13 },
  { name: "Pratapgarh",        latitude: 24.03, longitude: 74.78 },
  { name: "Aligarh",           latitude: 27.88, longitude: 78.08 },
  { name: "Hooghly",           latitude: 22.91, longitude: 88.39 },
  { name: "Paschim_Bardhaman", latitude: 23.69, longitude: 86.97 },
  { name: "Bankura",           latitude: 23.23, longitude: 87.07 },
  { name: "Birbhum",           latitude: 23.84, longitude: 87.62 },
  { name: "Paschim_Medinipur", latitude: 22.43, longitude: 87.32 },
  { name: "Kannauj",           latitude: 27.05, longitude: 79.92 },
  { name: "Nalanda",           latitude: 25.13, longitude: 85.45 },
  { name: "Vaishali",          latitude: 25.69, longitude: 85.36 },
  { name: "Samastipur",        latitude: 25.86, longitude: 85.78 },
  { name: "Saran",             latitude: 25.92, longitude: 84.83 },
  { name: "Gopalganj",         latitude: 26.47, longitude: 84.44 },
  { name: "East_Champaran",    latitude: 26.65, longitude: 84.92 },
  { name: "West_Champaran",    latitude: 26.80, longitude: 84.50 },
  { name: "Jalandhar",         latitude: 31.33, longitude: 75.58 },
  { name: "Hoshiarpur",        latitude: 31.53, longitude: 75.92 },
  { name: "Kapurthala",        latitude: 31.38, longitude: 75.38 },
  { name: "Ludhiana",          latitude: 30.90, longitude: 75.86 },
  { name: "Bathinda",          latitude: 30.21, longitude: 74.95 },
  { name: "Hassan",            latitude: 13.00, longitude: 76.10 },
  { name: "Belgaum",           latitude: 15.85, longitude: 74.50 },
  { name: "Kolar",             latitude: 13.14, longitude: 78.13 },
  { name: "Chikkaballapur",    latitude: 13.43, longitude: 77.73 },
  { name: "Unjha",             latitude: 23.80, longitude: 72.39 },
  // Already-cached cities — will cache-HIT and skip (no API cost). Coords
  // match the prior export scripts so the existing JSONs are valid.
  { name: "Indore",     latitude: 22.72, longitude: 75.86 },
  { name: "Delhi",      latitude: 28.61, longitude: 77.21 },
  { name: "Kanpur",     latitude: 26.45, longitude: 80.33 },
  { name: "Hyderabad",  latitude: 17.39, longitude: 78.49 },
  { name: "Agra",       latitude: 27.18, longitude: 78.02 },
  { name: "Surat",      latitude: 21.17, longitude: 72.83 },
  { name: "Mumbai",     latitude: 19.08, longitude: 72.88 },
  { name: "Patna",      latitude: 25.61, longitude: 85.14 },
  { name: "Jodhpur",    latitude: 26.24, longitude: 73.02 },
  { name: "Nagaur",     latitude: 27.20, longitude: 73.74 },
  { name: "Mehsana",    latitude: 23.59, longitude: 72.37 },
  { name: "Morbi",      latitude: 22.82, longitude: 70.84 },
  { name: "Rajkot",     latitude: 22.30, longitude: 70.80 },
  { name: "Neemuch",    latitude: 24.47, longitude: 74.87 },
  { name: "Mandsaur",   latitude: 24.07, longitude: 75.07 },
];

const START_DATE = "2010-01-01";
const END_DATE   = "2026-05-16";
const EXPECTED_ROWS_PER_CITY = 5980;

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

const CACHE_DIR = resolve(process.cwd(), "exports/_cache");
const OUT_PATH  = resolve(process.cwd(), "exports/historical_weather_district_subset_2010_to_today.xlsx");
const API_BASE  = "https://archive-api.open-meteo.com/v1/archive";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, label) {
  // On HTTP 429 (hourly or daily quota), exit the script cleanly so the next
  // run resumes from per-chunk disk progress. Only retry on 5xx / network.
  const backoffs = [5000, 15000, 30000];
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    let transient = false;
    let reason = "";
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        console.log(`\n=== RATE LIMIT (HTTP 429) on ${label} ===`);
        console.log("Open-Meteo free-tier quota hit. Stopping cleanly.");
        console.log("Per-chunk progress is on disk — re-run later to resume.");
        process.exit(0);
      }
      if (res.status >= 500) {
        transient = true;
        reason = `HTTP ${res.status}`;
      } else if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} (non-retryable): ${body.slice(0, 200)}`);
      } else {
        return await res.json();
      }
    } catch (err) {
      if (err.message && err.message.includes("(non-retryable)")) throw err;
      transient = true;
      reason = err.message;
    }
    if (transient) {
      if (attempt === backoffs.length) {
        throw new Error(`${label}: gave up after ${backoffs.length + 1} transient failures (last: ${reason})`);
      }
      const wait = backoffs[attempt];
      console.warn(`  ${label}: ${reason}, retry ${attempt + 1} after ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

function listChunks(startISO, endISO, yearsPerChunk = 4) {
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

function pickMorningPerDay(hourlyTimes, hourlyValues) {
  // 06:00 IST snapshot per day. Open-Meteo returns local-tz timestamps as
  // "YYYY-MM-DDTHH:MM" when timezone=Asia/Kolkata.
  const out = new Map();
  for (let i = 0; i < hourlyTimes.length; i++) {
    const t = hourlyTimes[i];
    if (!t || !t.endsWith("T06:00")) continue;
    const day = t.slice(0, 10);
    const v = hourlyValues[i];
    out.set(day, v == null || Number.isNaN(v) ? null : Math.round(v * 100) / 100);
  }
  return out;
}

async function fetchCity(city) {
  const baseRoot = `${API_BASE}?latitude=${city.latitude}&longitude=${city.longitude}&timezone=Asia%2FKolkata`;
  const dailyUrl = `${baseRoot}&start_date=${START_DATE}&end_date=${END_DATE}&daily=${DAILY_FIELDS.join(",")}`;

  mkdirSync(CACHE_DIR, { recursive: true });
  const progressPath = resolve(CACHE_DIR, `${city.name}__progress.json`);
  let progress = { daily: null, doneChunks: [], dayMeans: {} };
  if (existsSync(progressPath)) {
    progress = JSON.parse(readFileSync(progressPath, "utf8"));
    console.log(`[${city.name}] resumed: daily=${!!progress.daily}, chunks done=${progress.doneChunks.length}`);
  }
  const saveProgress = () => writeFileSync(progressPath, JSON.stringify(progress));

  let daily = progress.daily;
  if (!daily) {
    console.log(`[${city.name}] fetching daily (full range)…`);
    daily = await fetchWithRetry(dailyUrl, `${city.name}/daily`);
    progress.daily = daily;
    saveProgress();
    await sleep(800);
  }

  for (const f of HOURLY_FIELDS) if (!progress.dayMeans[f]) progress.dayMeans[f] = {};

  const yearChunks = listChunks(START_DATE, END_DATE, 4);
  for (const chunk of yearChunks) {
    const chunkKey = `${chunk.start}_${chunk.end}`;
    if (progress.doneChunks.includes(chunkKey)) {
      console.log(`[${city.name}] hourly ${chunk.start}…${chunk.end} (cached)`);
      continue;
    }
    const hourlyUrl = `${baseRoot}&start_date=${chunk.start}&end_date=${chunk.end}&hourly=${HOURLY_FIELDS.join(",")}`;
    console.log(`[${city.name}] fetching hourly ${chunk.start}…${chunk.end}`);
    const hourly = await fetchWithRetry(hourlyUrl, `${city.name}/hourly/${chunk.start.slice(0, 4)}`);
    for (const f of HOURLY_FIELDS) {
      const partial = pickMorningPerDay(hourly.hourly.time, hourly.hourly[f]);
      for (const [k, v] of partial) progress.dayMeans[f][k] = v;
    }
    progress.doneChunks.push(chunkKey);
    saveProgress();
    await sleep(800);
  }

  const dayMeans = {};
  for (const f of HOURLY_FIELDS) {
    dayMeans[f] = new Map(Object.entries(progress.dayMeans[f] || {}));
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
      humidity_06ist: dayMeans.relative_humidity_2m.get(date) ?? null,
      dew_point_06ist: dayMeans.dew_point_2m.get(date) ?? null,
      pressure_06ist: dayMeans.pressure_msl.get(date) ?? null,
      soil_temp_0_7cm_06ist:    dayMeans.soil_temperature_0_to_7cm.get(date) ?? null,
      soil_temp_7_28cm_06ist:   dayMeans.soil_temperature_7_to_28cm.get(date) ?? null,
      soil_temp_28_100cm_06ist: dayMeans.soil_temperature_28_to_100cm.get(date) ?? null,
      soil_moisture_0_7cm_06ist:    dayMeans.soil_moisture_0_to_7cm.get(date) ?? null,
      soil_moisture_7_28cm_06ist:   dayMeans.soil_moisture_7_to_28cm.get(date) ?? null,
      soil_moisture_28_100cm_06ist: dayMeans.soil_moisture_28_to_100cm.get(date) ?? null,
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
  console.log(`Cities total: ${CITIES.length}`);

  const args = process.argv.slice(2);
  const buildOnly = args.length === 1 && args[0] === "build";

  if (!buildOnly) {
    for (const city of CITIES) {
      await fetchCityCached(city);
      await sleep(200);
    }
  }

  const haveAll = CITIES.every((c) => existsSync(resolve(CACHE_DIR, `${c.name}.json`)));
  if (!haveAll) {
    const missing = CITIES.filter((c) => !existsSync(resolve(CACHE_DIR, `${c.name}.json`))).map((c) => c.name);
    console.log(`\nCaches still missing for ${missing.length} cities:`);
    console.log(`  ${missing.join(", ")}`);
    console.log("Re-run later to continue.");
    return;
  }

  const allRows = [];
  for (const city of CITIES) {
    allRows.push(...JSON.parse(readFileSync(resolve(CACHE_DIR, `${city.name}.json`), "utf8")));
  }
  allRows.sort((a, b) =>
    a.city < b.city ? -1 : a.city > b.city ? 1 :
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  const perCity = new Map();
  for (const r of allRows) perCity.set(r.city, (perCity.get(r.city) || 0) + 1);
  for (const c of CITIES) {
    const n = perCity.get(c.name) || 0;
    if (n !== EXPECTED_ROWS_PER_CITY) {
      throw new Error(`Uniform-grid check FAILED: ${c.name} has ${n} rows, expected ${EXPECTED_ROWS_PER_CITY}`);
    }
  }
  const dates = allRows.map((r) => r.date);
  const minD = dates.reduce((a, b) => (a < b ? a : b));
  const maxD = dates.reduce((a, b) => (a > b ? a : b));
  if (minD !== START_DATE || maxD !== END_DATE) {
    throw new Error(`Date range check FAILED: got ${minD}…${maxD}, expected ${START_DATE}…${END_DATE}`);
  }
  console.log(`Uniform grid OK: ${CITIES.length} cities × ${EXPECTED_ROWS_PER_CITY} rows = ${allRows.length}`);

  const ws = XLSX.utils.json_to_sheet(allRows);
  ws["!views"] = [{ state: "frozen", ySplit: 1, xSplit: 0, topLeftCell: "A2", activePane: "bottomLeft" }];
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!cols"] = Array(28).fill({ wch: 12 });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "historical_weather");
  mkdirSync(resolve(process.cwd(), "exports"), { recursive: true });
  XLSX.writeFile(wb, OUT_PATH);
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
