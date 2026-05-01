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
- UI: rendered as a separate "Quality Rating (KQV)" card with star indicator, colored band badge, 5-row pillar grid, and markdown rationale. The score-band badge also appears on each onion request row in the request history alongside the heat / collateral badges.

**Storage Recommendation Layer (deterministic, derived).** After the AI returns Visual + Rating + Pricing, the backend deterministically computes a `storage_recommendation` block from `visual_parameters` and `quality_rating` and merges it into the stored `aiDiagnosis` JSON. The strict decision hierarchy (evaluated top-down):
1. **High-Risk Grade → SELL IMMEDIATE** if `shoulder_geometry == "Convex"` OR `neck_rating <= 2` OR `luster_score <= 2` → action: "Sell Immediate", window: "0–15 Days", risk: "High".
2. **Elite Storage Grade → STORE LONG-TERM** if `overall_score >= 4.0` AND `neck_rating >= 4` AND `shoulder_geometry == "Flat"` (Sharp 90°) → action: "Store Long-term", window: "120–180 Days", risk: "Low".
3. **Safety Catch → REJECT/LIQUIDATE** if `overall_score < 3.0` → action: "Sell Immediate", window: "Immediate", risk: "Extreme".
4. **Fallback → AVERAGE STORAGE** otherwise → action: "Average Storage (Short-term)", window: "30–60 Days", risk: "Medium".

Logic lives only in `computeStorageRecommendation()` in `server/routes.ts` (with a frontend mirror `deriveStorageRecommendation()` for legacy records). The result is rendered as the 4th block on the Onion result card following the **Visual → Rating → Pricing → Storage** flow, with an action headline, window + risk fields, and a bilingual rationale per rule.
- **Weather Widget**: Real-time weather display on home page using Open-Meteo API (free, no key required). Shows current temperature with weather icon; click to expand for humidity, wind, and 3-day forecast.
- **Weather Data Logging**: Daily historical weather data logged to `weather_logs` table via cron job (1:00 AM IST). Logs for all registered user locations + 16 default Indian agricultural cities. Data points: temp (max/min/mean/apparent), precipitation, rain, weather code, wind speed/gusts, humidity, dew point, pressure, soil temperature & moisture (3 depths), ET0 evapotranspiration, UV index, sunrise/sunset, daylight duration. Source: Open-Meteo API. Admin can trigger manual logging via `POST /api/admin/weather-log-now`. Unique index on (date, latitude, longitude) prevents duplicates.
- **Marketplace**: Buy/sell platform for agricultural products (Onion Seedlings, Potato Seeds). Amazon-style grid layout (2 cols mobile, 5 cols desktop). Multi-photo upload (max 3), clickable cards open detail dialog with photo carousel. Sort by Latest/Nearest/Oldest. GPS-based distance sorting, seller location display, and contact info visible only to logged-in users. Photos stored in separate `marketplace_photos` table. Star rating system: buyers can rate listings 1-5 stars (one rating per user per listing, atomic upsert), listing avg rating shown on cards and detail dialog, seller avg rating shown when contact info is revealed. Self-rating prevented. Ratings stored in `marketplace_ratings` table with unique constraint on (listing_id, user_id). **Decimal pricing (Task #99)**: the 5 marketplace price columns (`onionSeedPricePerKg`, `soyabeanSeedPricePerQuintal`, `bagPricePerBag`, `fanPricePerPiece`, `othersPrice`) are stored as `doublePrecision` so sellers can enter paise (1 or 2 decimals). Shared helpers `formatRupeeAmount` / `parsePriceInput` live in `shared/price-format.ts` and are used by both the React form (`client/src/pages/marketplace.tsx`) and the Express validators (`server/routes.ts`) plus the share-card text builder (`server/share-meta.ts`). Whole values render without a decimal portion (₹19), fractional values render with exactly two decimals (₹19.80).
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

## Sharing & Link Previews
- Marketplace listings can be shared via WhatsApp / email / native share / copy-link from `client/src/pages/marketplace.tsx`. The card image, brand title and description shown by social-preview crawlers (WhatsApp / Facebook / LinkedIn / Twitter) come from server-injected Open Graph + Twitter meta in `server/share-meta.ts`, applied to every HTML response by the static + Vite middlewares (`server/static.ts`, `server/vite.ts`).
- A pre-built share cover lives at `client/public/share-cover.png` (1200×630, 8-bit RGBA). It is generated by `node scripts/build-share-cover.mjs` from the existing `client/public/logo.png`. Re-run that script if the logo or branding ever changes.
- For the homepage / non-listing pages, that brand cover is used as the OG image.
- For marketplace listings, the OG image is a per-listing **composed share card** served at `GET /api/marketplace/:id/share-image` (1200×630 JPEG). Layout (Task #78): full-bleed — the listing's first photo is cover-fit to fill the entire 1200×630 frame, with no white band, no category badge, no location pill, no domain footer. Those facts are already shown by WhatsApp / Facebook below the picture as the link's title (`og:title`), description (`og:description`, computed by `summarizeListing` in `server/share-meta.ts`), and URL — duplicating them inside the picture wasted vertical space. When the listing has no photo, the 1200×630 brand cover (`client/public/share-cover.png`) is used instead. Composer lives in `server/share-image.ts` (sharp re-encode only — no SVG overlay anymore); response is cached 1h via `Cache-Control` and a strong `ETag` derived from the listing's content fields + photo ids + a layout-version constant (`lay`), so any of (a) listing edits, (b) photo changes, or (c) future composition tweaks invalidate the cache automatically.
- **Canonical share origin defaults to `https://km.krashuved.com`** in code (both `server/share-meta.ts` `resolveOrigin` and the client `composeShareInfo` in `client/src/pages/marketplace.tsx`), so shared URLs and OG meta always emit the short canonical link from any environment — including the Replit dev tunnel — without depending on env vars being set on the box.
- **Optional env overrides** (set only when deploying to a different domain):
  - `PUBLIC_BASE_URL=https://km.krashuved.com` — overrides the server-side origin used for `og:url` and `og:image`.
  - `VITE_PUBLIC_BASE_URL=https://km.krashuved.com` — overrides the client `composeShareInfo` origin at build time.
  - `SHARE_ALLOWED_HOSTS=km.krashuved.com` — when set (and `PUBLIC_BASE_URL` is unset), allows the request host to be used for OG meta if it matches; otherwise falls back to the canonical origin.
- **Auto-refresh of WhatsApp / Facebook preview cache**: after a seller creates, edits, or deactivates a listing, the server fires a fire-and-forget `POST` to `https://graph.facebook.com/?id=<encoded URL>&scrape=true` for the canonical share URL (`<canonical-origin>/marketplace?listing=<id>`). This tells Meta to flush its preview cache for that URL so any **already-shared** WhatsApp messages start showing the up-to-date preview card within seconds — no manual Facebook Sharing Debugger work needed. Implementation lives in `server/share-meta.ts` (`pingMetaScrape`, `pingListingShareCache`); failures are swallowed and logged at warn level (Meta is best-effort and never blocks the seller's edit). Skipped when `NODE_ENV=test`. Outbound traffic is tiny — 1 HTTP POST per create/edit/delete, no body, no auth header.
- **Stable canonical share URL** (Task #76): client-generated share URLs are intentionally short and stable — `https://km.krashuved.com/marketplace?listing=<id>` with no extra query parameters. An earlier experiment (Task #70) appended a `&v=<shareVersion>` cache-bust token, but in real-world WhatsApp shares the receiver almost always sees the link for the first time, so there's no per-device cache to bust. Freshness is instead handled server-side by the Meta sharing-debugger ping above. Already-cached previews on a receiver's device may show stale content until WhatsApp itself expires the entry (typically up to ~7 days) — this is an accepted limitation. The server still defensively parses and echoes any `&v=...` token it sees on incoming requests (sanitized to `[A-Za-z0-9_-]{1,64}`) so older shares already in WhatsApp threads keep rendering correctly.
- **Share message body is intentionally just the URL** (Task #77): `composeShareInfo` in `client/src/pages/marketplace.tsx` returns `text: ""` so the Web Share API hands WhatsApp / SMS / native share **only** the URL. The brand title and listing description still surface inside the rich preview card via `og:title` and `og:description`, so emitting a separate "🌾 KrashuVed — किसानों का साथी" tagline above the URL would just duplicate the brand line. Email keeps its own subject line.
- **Optional 50-char freehand notes** on every marketplace listing (Task #79): `marketplaceListings.additionalNotes` is a nullable `text` column with a Zod `.max(50).nullable().optional()` guard. The form input is shown for every category once one is picked; the value is trimmed and coerced `"" → null` on submit so empty notes never reach the DB. Rendered only inside the listing **detail popup** (intentionally NOT on the card grid, to keep cards scannable) and appended to `og:description` in `summarizeListing` so the seller's note rides along into WhatsApp / Facebook link previews. Share-image cache key (`buildContentSigHash` in `server/share-image.ts`) includes the notes and `lay` was bumped 3 → 4 so a notes edit invalidates any cached preview.
- **Lightweight composed share-image** (Task #73): the `/api/marketplace/:id/share-image` JPEG is encoded with mozjpeg at quality 78, dropping the payload from ~145 KB to ~60–80 KB without visible degradation at WhatsApp / Facebook preview thumbnail size. **This only affects the in-memory composed preview JPEG returned to social-media bots — it does not touch the listing's source `photoData` bytes in the database, and the marketplace UI (gallery, lightbox, detail view, edit form) keeps reading those at full original quality.**
- **Persistent on-disk share-image cache** (Task #73): composed share-image JPEGs are written to `<install-root>/.share-image-cache/l<id>-<createdAtMs>-<sigHash>.jpg` (atomic write via tmp + rename, content-addressed by the strong ETag key, with stale per-listing files cleaned up on each new write). Survives restarts, so WhatsApp's first scrape of a freshly shared canonical URL is a static-disk read instead of cold sharp work (~250 ms saved). The directory is created lazily on first compose and gitignored. Override the location via `SHARE_IMAGE_CACHE_DIR=/path/to/dir` if the install root isn't writable. Skipped when `NODE_ENV=test`.
- **Pre-warming hooks** (Task #73): the persistent cache is pre-warmed by `precomposeListingShareImage(listingId)` in three places — (1) after `POST /api/marketplace` creates a listing; (2) after `PATCH /api/marketplace/:id` edits a listing; (3) when a seller taps the share button in the client UI, which fires a fire-and-forget `POST /api/marketplace/:id/prewarm-share-image` (public, no auth — same exposure as the GET share-image endpoint). All three are fire-and-forget and idempotent — concurrent prewarms for the same listing safely de-duplicate via the in-memory + on-disk caches.
- **Per-day stock ID on every listing** (Task #81): `marketplaceListings.stockId` is a nullable, unique `text` column of the form `YYYYMMDD-N` — the IST calendar day the listing was created plus a positive integer that resets at IST midnight (`20260428-1`, `…-2`, `…-10`, …). Generated server-side **only**, inside the same DB transaction as the listing insert (see `createMarketplaceListing` in `server/storage.ts`), via a row-level-atomic `INSERT … ON CONFLICT … DO UPDATE … RETURNING last_n` upsert against the `marketplace_stock_counters` table (keyed by IST day), so two concurrent creates can never collide on the same number. The column is intentionally **backend-only** — it is NOT shown on cards, the detail popup, the share preview, the edit form, or `og:description`, and it is not part of the Zod insert schema (clients can't supply it). It rides along on existing `GET /api/marketplace*` JSON automatically via Drizzle's select type. `updateMarketplaceListing` defensively strips any incoming `stockId` so the value is immutable post-creation. The column is **nullable** so production rows that pre-date this migration keep working until the same DDL + backfill (`ALTER TABLE marketplace_listings ADD COLUMN stock_id text` + unique index + `marketplace_stock_counters` table + per-IST-day `ROW_NUMBER()` backfill ordered by `(created_at AT TIME ZONE 'Asia/Kolkata')::date, id`) is applied on the Hostinger VPS. The DDL was applied directly via psql in dev because the unrelated pre-existing `users.phone_number` unique-constraint prompt blocks `npm run db:push --force` (same workaround used in Task #79).

- **Generic "Others" marketplace category** (Task #84): a 7th `marketplaceListings.category` value `'others'` covers anything that isn't onion seedling / potato seed / onion seed / soyabean seed / bardan bag / exhaust fan — solar pumps, sprayers, hand tools, tarps, drip kits, etc. Backed by 13 nullable columns on `marketplace_listings` (`others_product_name`, `others_brand`, `others_price`, `others_materials`, `others_condition`, `others_warranty_years`, `others_dimensions`, `others_return_policy`, `others_extra1`…`others_extra5`) added by migration `migrations/0002_others_category.sql` (purely additive `ADD COLUMN IF NOT EXISTS`, applied via psql in dev because `npm run db:push --force` is still blocked by the unrelated pre-existing `users.phone_number` unique-constraint prompt — same workaround as Tasks #79 and #81; **the same DDL must be applied on the Hostinger VPS before deploy**). Only `othersProductName` (≤80 chars) and ≥1 photo are required at the Zod layer; the other 12 fields are optional. Allow-listed enums: `others_condition` ∈ {new, used, refurbished}; `others_return_policy` ∈ {5_day_return, 5_day_replacement, none}. Strings have per-field length caps (Brand ≤40, Materials ≤60, Dimensions ≤60, each Extra slot ≤60); `others_price` is bounded 1–999999 and `others_warranty_years` 0–50. UI: teal/cyan accent + `ShoppingBag` lucide icon (consistent with the colour-coded category palette); the dialog/edit form, filter dropdown, card body (name • ₹price • brand · condition), and detail popup (structured rows + bare bullet list of any non-empty Extra slots) all branch on `category === 'others'`. Reuses the existing `additionalNotes` (Task #79) and per-IST-day `stockId` (Task #81) infrastructure unchanged. The new i18n key for the marketplace label is intentionally namespaced as `marketplaceOthers` because the `others` translation key was already taken by the farm-khata sub-type.

## AI Crop Suggestions
- Endpoint: `GET /api/crop-cards/:id/suggestions?lat={lat}&lng={lng}&lang={hi|en}`
- Always prompts Gemini in English (better quality), translates to Hindi via a separate Gemini call when `lang=hi`
- Uses Gemini 2.5 Flash with `responseMimeType: "application/json"` and `thinkingConfig: { thinkingBudget: 1024 }` to get structured JSON
- Returns: `{ nextActivity: { name, daysFromNow, description } | null, weatherWarning: { message, severity } | null, suggestion: string | null }`
- Server-side in-memory cache per crop card (6-hour TTL), keyed by `cardId-lat-lng` (language-independent); English and Hindi translations cached together so switching languages returns consistent numeric data (daysFromNow, severity)
- Frontend reads lat/lng from `krashu-weather-cache` localStorage key (set by weather widget)
- Displayed on active crop cards: compact strip (collapsed) + full detail section (expanded)