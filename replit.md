# Krashu Mitra (कृषु मित्र) - Farmer's App

## Overview
Krashu Mitra is a mobile-first, responsive web application designed to empower Indian farmers. It provides tools for farm management, financial tracking, and AI-powered agricultural assistance. The application supports bilingual operation (Hindi and English) and features a conversational AI chatbot, "Krashu Mitra," to offer guidance and facilitate various farming tasks.

Key capabilities include:
- **Farm Management**: Crop card creation, tracking of crop events, and yield recording. Each active crop card shows AI-powered suggestions: next upcoming activity (with days countdown), weather warnings when conditions are unfavorable, and actionable farming tips — all powered by Gemini AI + Open-Meteo weather data.
- **Digital Clinic**: AI-powered disease diagnosis, soil testing, and potato seed testing services.
- **Weather Widget**: Real-time weather display on home page using Open-Meteo API (free, no key required). Shows current temperature with weather icon; click to expand for humidity, wind, and 3-day forecast.
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