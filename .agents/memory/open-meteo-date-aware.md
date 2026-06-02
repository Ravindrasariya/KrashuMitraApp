---
name: Open-Meteo date-aware weather
description: How to fetch weather for a chosen past date vs today from Open-Meteo (forecast vs archive split, daily aggregates).
---

# Open-Meteo date-aware weather

When weather must reflect a *selected* date (not just "now"), the free Open-Meteo
public API needs two different shapes:

- **Today / future** → `api.open-meteo.com/v1/forecast` with `current=...` gives an
  instantaneous reading. Only "now" has a true `current`.
- **A past date** → there is NO `current` for a past day. Request `daily=` aggregates
  (`temperature_2m_max/min/mean`, `precipitation_sum`, `weather_code`,
  `wind_speed_10m_max`, `wind_direction_10m_dominant`, `wind_gusts_10m_max`) over a
  `start_date`/`end_date` range. Humidity has no reliable daily aggregate — request
  `hourly=relative_humidity_2m` and average the entries whose time starts with the
  target date.

**Endpoint by recency:**
- Within ~90 days back, the **forecast** endpoint serves recent-past via
  `start_date`/`end_date` (its past window is ~92 days).
- Older than that, use **`archive-api.open-meteo.com/v1/archive`** (ERA5 reanalysis).
  Why: the archive lags real time by ~5 days, so it's wrong for the last few days —
  use forecast for recent dates, archive only for older ones.

**Why this matters here:** the Plot Health Check satellite trend window is ~2 months,
so most picked dates land inside the forecast window, but a stale pick can fall to the
archive. Both endpoints are free / no API key.

**How to apply:** anchor the weather fetch to a derived selected-date value and switch
endpoint + payload shape on whether that date is today/future vs past. Map daily
aggregates into the same UI fields the live "current" view uses (temp = daily mean or
(max+min)/2 fallback, wind = daily max + dominant direction). Guard a cleared/invalid
date input by falling back to today before building the request.
