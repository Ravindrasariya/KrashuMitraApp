# Krashu Mitra (कृषु मित्र) - Farmer's App

## Overview
A mobile-first responsive web app for Indian farmers. Built with React + Express + PostgreSQL. 
Bilingual (Hindi default, English toggle). Uses Replit Auth for login and Gemini AI for the "KrashuVed" chatbot.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + Shadcn UI + Wouter routing
- **Backend**: Express.js + Drizzle ORM + PostgreSQL
- **Auth**: Replit Auth (OpenID Connect)
- **AI**: Gemini via Replit AI Integrations (KrashuVed chatbot)
- **Language**: Hindi/English with custom i18n system

## Structure
```
client/src/
  App.tsx                    - Main app layout with bottom nav
  lib/i18n.ts               - Hindi/English translation system
  lib/queryClient.ts        - TanStack Query client
  hooks/use-auth.ts         - Authentication hook
  components/
    bottom-nav.tsx           - Mobile bottom navigation
    header.tsx               - App header with language toggle
    chatbot.tsx              - KrashuVed AI chatbot (voice + text)
    crop-card-item.tsx       - Expandable crop card component
    crop-timeline.tsx        - Timeline view for crop events
    add-crop-card-dialog.tsx - Dialog to create crop cards
    add-event-dialog.tsx     - Dialog to add events to crop cards
  pages/
    home.tsx                 - Landing/home page
    farm-management.tsx      - Crop card management (requires login)
    placeholder-page.tsx     - Placeholder for upcoming tabs

server/
  index.ts                   - Express server entry
  routes.ts                  - API routes + KrashuVed chat
  storage.ts                 - Database CRUD operations
  db.ts                      - Database connection
  replit_integrations/       - Auth + Gemini integrations

shared/
  schema.ts                  - Drizzle schemas (users, sessions, crop_cards, crop_events, conversations, messages)
  models/auth.ts             - Auth schema
  models/chat.ts             - Chat schema
```

## Tabs
1. **Home** - Landing page with feature cards
2. **Digital Clinic** - Placeholder (coming soon)
3. **Marketplace** - Placeholder (coming soon)
4. **Farm Management** - Crop card management with timeline (login required)
5. **Farm Khata** - Placeholder (coming soon)
6. **Admin** - Not yet implemented (password protected, hidden)

## Key Features
- Mobile-first bottom navigation (like Mandi Mitra reference)
- Hindi default language with English toggle
- Crop card management with expandable timeline
- Event types: Plantation, Fertiliser, Pesticide, Watering (color-coded)
- Auto-suggestions for descriptions based on history
- KrashuVed AI chatbot with voice support (Hindi)
- Chatbot can create crop cards via conversation

## Database Tables
- `users` - Replit Auth users
- `sessions` - Session storage
- `crop_cards` - Farmer's crop cards (userId, cropName, startDate, status)
- `crop_events` - Timeline events (cropCardId, eventType, description, eventDate, isCompleted)
- `conversations` - Chat conversations
- `messages` - Chat messages
