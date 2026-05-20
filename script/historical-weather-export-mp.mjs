#!/usr/bin/env node
// Historical weather export for 2 additional Madhya Pradesh cities (Neemuch,
// Mandsaur). Same approach / schema as script/historical-weather-export-extra.mjs
// — separate workbook so the existing files are left untouched.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";

const CITIES = [
  { name: "Neemuch",  latitude: 24.47, longitude: 74.87 },
  { name: "Mandsaur", latitude: 24.07, longitude: 75.07 },
];

const START_DATE = "2010-01-01";
const END_DATE = "2026-05-16";

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
const OUT_PATH  = resolve(process.cwd(), "exports/historical_weather_madhya_pradesh_2010_to_today.xlsx");
const EXPECTED_ROWS_PER_CITY = 5980;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, label) {
  const backoffs = [30000, 60000, 120000, 240000, 480000, 900000];
  const MAX_TOTAL_WAIT_MS = 60 * 60 * 1000;
  let waited = 0;
  for (let attempt = 0; ; attempt++) {
    let transient = false;
    let reason = "";
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) {
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
      const wait = backoffs[Math.min(attempt, backoffs.length - 1)];
      if (waited + wait > MAX_TOTAL_WAIT_MS) {
        throw new Error(`${label}: giving up after ${Math.round(waited / 1000)}s of transient failures (last: ${reason})`);
      }
      console.warn(`  ${label}: ${reason}, retry ${attempt + 1} after ${wait / 1000}s`);
      await sleep(wait);
      waited += wait;
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
  const baseRoot = `https://archive-api.open-meteo.com/v1/archive?latitude=${city.latitude}&longitude=${city.longitude}&timezone=Asia%2FKolkata`;
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
    await sleep(1200);
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
    await sleep(1200);
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
  mkdirSync(resolve(process.cwd(), "exports"), { recursive: true });
  XLSX.writeFile(wb, OUT_PATH);
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
