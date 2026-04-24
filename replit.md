# Krashu Mitra (कृषु मित्र) - Farmer's App

## Overview
Krashu Mitra is a mobile-first, responsive web application designed to empower Indian farmers. It provides tools for farm management, financial tracking, and AI-powered agricultural assistance. The application supports bilingual operation (Hindi and English) and features a conversational AI chatbot, "Krashu Mitra," to offer guidance and facilitate various farming tasks.

Key capabilities include:
- **Farm Management**: Crop card creation, tracking of crop events, and yield recording. Each active crop card shows AI-powered suggestions: next upcoming activity (with days countdown), weather warnings when conditions are unfavorable, and actionable farming tips — all powered by Gemini AI + Open-Meteo weather data.
- **Digital Clinic**: AI-powered disease diagnosis, soil testing, potato seed testing, and onion price prediction services.

### Onion Pricing Engine (KrashuVed Commodity Pricing & Underwriting Agent)

The Onion Price Predictor uses a deterministic, multi-phase pricing engine implemented as a Gemini Vision prompt in `server/routes.ts`. The user supplies a single `mandi_benchmark_price` (B, in ₹/quintal — Lot 1 / Premium Super grade in the user's mandi today) and a photo. The agent returns two values: **Market Price** (estimated current sale value) and **Collateral Value** (de-risked value for lending/storage). **UI display rule (overrides earlier draft spec):** Collateral Value is shown ONLY as a percentage of Market Price, computed `round(collateral_value / calculated_market_price × 100)`, with `"—"` when market price is missing or zero.

The full engine specification (used verbatim as the agent's system prompt):

> **Role:** KrashuVed Commodity Pricing & Underwriting Agent. You are a high-precision pricing engine for the Indian Onion ecosystem. Your task is to calculate two values for every lot:
> 1. **Market Price:** The estimated current sale value in the Mandi.
> 2. **Collateral Value:** The de-risked value used for Lending (LSP) and Storage decisions.
>
> The user-provided `mandi_benchmark_price` (B) is the price for Lot 1 — Premium Super grade in the user's mandi today (₹/quintal).
>
> **Phase 1 — Market Heat Index (H):** Determine the Market State based on B.
> - H = "Low" (Quality-Driven) if B ≤ 15.
> - H = "Medium" (Balanced) if 15 < B < 30.
> - H = "High" (Supply-Driven / Scarcity) if B ≥ 30.
>
> **Phase 2 — Dynamic Size Multipliers (M_size):** Apply the multiplier to B based on the visually assessed Grade Category and the Heat Index.
>
> | Grade Category   | Low Heat (B ≤ 15) | Medium Heat (15 < B < 30) | High Heat (B ≥ 30) |
> | Super (>60 mm)   | 1.00              | 1.00                      | 1.00               |
> | Medium (45–60 mm)| 0.80              | 0.85                      | 0.90               |
> | Gola (35–45 mm)  | 0.55              | 0.65                      | 0.75               |
> | Golti (<35 mm)   | 0.35              | 0.45                      | 0.55               |
>
> **Phase 3 — Visual Quality Refinements (Q_adj, cumulative %):**
> - Color: Dark Red / Vibrant Pink: +5%. Dull / Pale / Discolored: −10%.
> - Luster / Parda: High Waxy Luster (luster_score 5): +5%. Peeling Skin (Kattar) / luster_score ≤ 2: −15%.
> - Shape / Uniformity: Perfectly Globe / Uniform: +5%. Irregular / Elongated / Pear-shaped: −10%.
>
> **Phase 4 — Sustainability & Lending Haircuts (LSP Logic — applied to Market Price → Collateral Value):**
> 1. **Puffy Penalty:** IF shoulder_geometry == "Convex": −15% if Heat is Low or Medium; −25% if Heat is High.
> 2. **Dormancy Penalty:** IF neck_rating ≤ 2: additional −10%.
> Sustainability_Haircut = sum of the applicable penalties above (0 if neither applies).
>
> **Phase 5 — Final Pricing Formula:**
> 1. Base_Price = B × M_size
> 2. Market_Price = Base_Price × (1 + Σ Q_adj)
> 3. Collateral_Value = Market_Price × (1 − Sustainability_Haircut)
>
> Round both Market_Price and Collateral_Value to 2 decimals. Express `quality_adjustments_total` as a signed percentage string (e.g. `"+5%"`, `"-10%"`, `"0%"`).
>
> **Output Format (return ONLY this JSON object — no markdown, no commentary):**
> ```
> {
>   "pricing_analysis": {
>     "market_heat_index": "Low" | "Medium" | "High",
>     "calculated_market_price": <number>,
>     "collateral_value": <number>,
>     "valuation_breakdown": {
>       "base_multiplier_used": <number>,
>       "quality_adjustments_total": "<signed percentage string>",
>       "puffy_penalty_applied": <boolean>
>     },
>     "underwriting_note": "<one short English sentence explaining the price drift or safety haircut applied>"
>   },
>   "visual_parameters": {
>     "size_grade": "Super" | "Medium" | "Gola" | "Golti",
>     "color": "<short description like 'Dark Red', 'Pale Yellow'>",
>     "luster_score": <integer 1-5>,
>     "shape_uniformity": "<short description like 'Perfectly Globe', 'Irregular', 'Mixed'>",
>     "neck_rating": <integer 1-5>,
>     "shoulder_geometry": "Flat" | "Convex" | "Tapered"
>   },
>   "quality_rating": {
>     "overall_score": <number 1.0-5.0, at most 1 decimal>,
>     "score_band": "Elite Storage" | "Premium Commercial" | "Standard/Domestic" | "High Risk/Puffy" | "Distress/Reject",
>     "pillar_scores": {
>       "neck_integrity": <integer 1-5>,
>       "shoulder_geometry": <integer 1-5>,
>       "parda_luster": <integer 1-5>,
>       "shape_roundness": <integer 1-5>,
>       "uniformity_size": <integer 1-5>
>     },
>     "rationale_markdown": "<short markdown, 2-4 bullets, no rupee/LTV/percent>"
>   }
> }
> ```
>
> If the image does not appear to be onions, return:
> `{ "error": "image_not_onion", "message": "The uploaded image does not appear to be an onion lot. Please upload a clear photo of onions." }`

The output is validated server-side with Zod (`onionResultSchema` in `server/routes.ts`, with regex on `quality_adjustments_total`) and stored in `service_requests.ai_diagnosis` as JSON text. Legacy KQV records (with `lot_analysis`) render as raw JSON in the result panel and are skipped in the new history badges.

**Quality Rating Layer (independent of pricing).** Alongside the Pricing Engine the same AI call returns a separate `quality_rating` block built on the original KQV scoring matrix. It is fully independent — it does NOT use B, mandi heat, multipliers, or haircuts, and it does NOT emit any LTV / collateral / rupee value of its own. LTV stays inside the Pricing Engine and is surfaced only as the Collateral % on the pricing card (with an inline note that Collateral % = effective LTV after puffy + dormancy haircuts). The rating block scores 5 visual pillars on a 1–5 integer scale and assigns a named band:
- Pillars: `neck_integrity` (Dormancy), `shoulder_geometry`, `parda_luster`, `shape_roundness`, `uniformity_size`.
- Bands by `overall_score` (avg of pillars): 5.0–4.5 = Elite Storage; 4.4–3.5 = Premium Commercial; 3.4–2.5 = Standard/Domestic; 2.4–1.5 = High Risk/Puffy; 1.4–1.0 = Distress/Reject.
- JSON shape: `quality_rating: { overall_score, score_band, pillar_scores: {neck_integrity, shoulder_geometry, parda_luster, shape_roundness, uniformity_size}, rationale_markdown }`.
- The rationale_markdown is short bullets explaining which pillars drove the score and contains no rupee/percent/LTV language.
- UI: rendered as a separate "Quality Rating (KQV)" card under the Pricing card with star indicator, colored band badge, 5-row pillar grid, and markdown rationale. The score-band badge also appears on each onion request row in the request history alongside the heat / collateral badges.
- **Weather Widget**: Real-time weather display on home page using Open-Meteo API (free, no key required). Shows current temperature with weather icon; click to expand for humidity, wind, and 3-day forecast.
- **Weather Data Logging**: Daily historical weather data logged to `weather_logs` table via cron job (1:00 AM IST). Logs for all registered user locations + 16 default Indian agricultural cities. Data points: temp (max/min/mean/apparent), precipitation, rain, weather code, wind speed/gusts, humidity, dew point, pressure, soil temperature & moisture (3 depths), ET0 evapotranspiration, UV index, sunrise/sunset, daylight duration. Source: Open-Meteo API. Admin can trigger manual logging via `POST /api/admin/weather-log-now`. Unique index on (date, latitude, longitude) prevents duplicates.
- **Marketplace**: Buy/sell platform for agricultural products (Onion Seedlings, Potato Seeds). Amazon-style grid layout (2 cols mobile, 5 cols desktop). Multi-photo upload (max 3), clickable cards open detail dialog with photo carousel. Sort by Latest/Nearest/Oldest. GPS-based distance sorting, seller location display, and contact info visible only to logged-in users. Photos stored in separate `marketplace_photos` table. Star rating system: buyers can rate listings 1-5 stars (one rating per user per listing, atomic upsert), listing avg rating shown on cards and detail dialog, seller avg rating shown when contact info is revealed. Self-rating prevented. Ratings stored in `marketplace_ratings` table with unique constraint on (listing_id, user_id).
- **Marketing Banners**: Admin-managed banner carousel on home page. Supports two types: text-based (heading/subheading/description in Hi+En with colored text - emerald subheading, amber description) and image-based (uploaded image with caption overlay). Auto-rotating carousel (25s interval) with dot indicators (no arrows). Admin can create, edit, delete, reorder, and toggle active/inactive. Desktop banners full-width (`md:min-h-[253px]`); mobile `min-h-[180px]`. Banners stored in `banners` table; images stored as base64 with 5MB limit. Admin management via "Manage Banners" tab on admin page.
- **Price Trends & Forecasting**: Admin uploads Excel files with market price data per crop. Home page shows price section between banners and quick access cards. Features: (1) Crop selector dropdown, (2) Latest 5-day price table with market rows and date columns showing modal price with color-coded trend arrows (green up, red down), (3) KrashuVed Expectation badge (Hold=green, Sale=red) set by admin, (4) Farmer Poll with Hold/Sale voting + battery-style percentage bar showing live results. Tables: `price_crops` (crop config + admin recommendation), `price_entries` (daily market prices), `price_polls` (farmer votes with unique constraint per user per crop). Excel parsing via `xlsx` package. Admin management via "Manage Prices" tab.
- **Farm Khata (Ledger)**: Comprehensive expense and income tracking across multiple ledger types, including crop-specific, sharecropping, land lease, rental, machinery expense, and lending ledgers.
- **AI Chatbot Integration**: A context-aware chatbot for natural language interaction, capable of providing advice, creating/editing crop cards, managing Khata entries, and booking Digital Clinic services (Soil Test, Potato Seed Test, Crop Doctor AI) through conversation.

## User Preferences
- The AI chatbot, "Krashu Mitra," should have a feminine persona and use a Hindi female voice for TTS output.
- Chatbot responses should be concise, using short bullet-point answers (3-5 points), and suggest 1-2 follow-up questions.
- TTS should use a slower rate (0.75) with natural pauses at sentence boundaries for better Hindi flow.
- The chatbot should be context-aware, leveraging the farmer's existing crop cards and events.
- The chatbot should be able to create new crop cards, edit existing crop cards, manage all seven Farm Khata types via conversation, and book Digital Clinic services (Soil Test, Potato Seed Test, Crop Doctor AI) through the draft → approval card → API call pattern.

## System Architecture
The application follows a client-server architecture:

**Frontend**:
-   **Framework**: React with Vite
-   **Styling**: TailwindCSS, Shadcn UI
-   **Routing**: Wouter
-   **State Management**: TanStack Query
-   **Internationalization**: Custom Hindi/English i18n system
-   **UI/UX**: Responsive design. Desktop uses a horizontal top tab bar (h-16, tabs centered with `justify-center`). Mobile uses a header (h-16) with profile dropdown + language toggle, and a 5-tab bottom nav (Home, Market, Crops, Khata, Clinic). Color-coded event types for visual clarity (e.g., Plantation - green, Fertiliser - amber). Branding: logo image (w-10 h-10), app name text-base font-bold, tagline text-xs with mt-1 spacing. "Krashu" in green + "Ved" in orange. Splash screen on app load (~2.5s) with logo, "KrashuVed" branding, and Hindi tagline "आपका विश्वास, हमारी प्राथमिकता".
-   **Chatbot UI**: Features voice input, TTS output, a stop button for ongoing responses, and image attachment for AI analysis. Auto-growing textarea for chat input, supporting `Enter` to send and `Shift+Enter` for new lines. Markdown rendering for chat messages.
-   **Image Display**: Inline display of images pulled from Wikimedia Commons based on AI suggestions.

**Backend**:
-   **Framework**: Express.js
-   **ORM**: Drizzle ORM
-   **Database**: PostgreSQL
-   **Authentication**: Phone number + 4-digit PIN authentication with `bcryptjs` for hashing and `express-session` for session management. IP-based verification for "Forgot PIN" functionality. Admin panel for user management and PIN resets.
-   **AI Integration**: Gemini via Replit AI Integrations for the "Krashu Mitra" chatbot, including image analysis for the Crop Doctor feature.
-   **Timezone Management**: IST (Asia/Kolkata) is set server-side and applied to client-side date formatting.
-   **Profile Page**: `/profile` page allows users to edit their name, village, district, and state. GPS auto-detection via browser geolocation + OpenStreetMap Nominatim reverse geocoding (free, no API key). Location fields are optional.
-   **Admin System**: Restricted access `/admin` page for users with `isAdmin: true`, allowing user detail editing and PIN resets.
-   **Khata System**: Comprehensive ledger management with 7 distinct khata types, each with specific data structures and business logic (e.g., interest accrual for Lending Ledger). Global unique integer IDs are used across `crop_cards` and `khata_registers`.

## External Dependencies
-   **Database**: PostgreSQL
-   **AI**: Google Gemini (via Replit AI Integrations)
-   **Authentication**: `bcryptjs`
-   **Session Management**: `express-session`, `connect-pg-simple`
-   **Scheduled Tasks**: `node-cron` (for Lending Ledger interest accrual)
-   **UI Components**: Shadcn UI
-   **Image Source**: Wikimedia Commons (for chatbot image suggestions)
-   **Weather API**: Open-Meteo (free, no key required) — used by weather widget and crop suggestion endpoint

## AI Crop Suggestions
- Endpoint: `GET /api/crop-cards/:id/suggestions?lat={lat}&lng={lng}&lang={hi|en}`
- Always prompts Gemini in English (better quality), translates to Hindi via a separate Gemini call when `lang=hi`
- Uses Gemini 2.5 Flash with `responseMimeType: "application/json"` and `thinkingConfig: { thinkingBudget: 1024 }` to get structured JSON
- Returns: `{ nextActivity: { name, daysFromNow, description } | null, weatherWarning: { message, severity } | null, suggestion: string | null }`
- Server-side in-memory cache per crop card (6-hour TTL), keyed by `cardId-lat-lng` (language-independent); English and Hindi translations cached together so switching languages returns consistent numeric data (daysFromNow, severity)
- Frontend reads lat/lng from `krashu-weather-cache` localStorage key (set by weather widget)
- Displayed on active crop cards: compact strip (collapsed) + full detail section (expanded)