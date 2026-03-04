# Krashu Mitra (कृषु मित्र) - Farmer's App

## Overview
A mobile-first responsive web app for Indian farmers. Built with React + Express + PostgreSQL. 
Bilingual (Hindi default, English toggle). Uses phone number + PIN authentication and Gemini AI for the "Krashu Mitra" chatbot.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + Shadcn UI + Wouter routing
- **Backend**: Express.js + Drizzle ORM + PostgreSQL
- **Auth**: Phone number + 4-digit PIN (bcryptjs hashing, express-session, IP-based forgot-PIN)
- **AI**: Gemini via Replit AI Integrations (Krashu Mitra chatbot)
- **Language**: Hindi/English with custom i18n system

## Structure
```
client/src/
  App.tsx                    - Main app layout (sidebar on desktop, bottom nav on mobile)
  lib/i18n.ts               - Hindi/English translation system
  lib/queryClient.ts        - TanStack Query client
  lib/auth-utils.ts          - Auth utility functions
  hooks/use-auth.ts         - Authentication hook
  components/
    sidebar-nav.tsx          - Desktop sidebar navigation (hidden on mobile)
    bottom-nav.tsx           - Mobile bottom navigation (hidden on desktop)
    header.tsx               - Mobile app header with language toggle (hidden on desktop)
    chatbot.tsx              - Krashu Mitra AI chatbot (voice + text, context-aware)
    crop-card-item.tsx       - Expandable crop card component
    crop-timeline.tsx        - Timeline view for crop events (with edit/delete)
    add-crop-card-dialog.tsx - Dialog to create crop cards
    add-event-dialog.tsx     - Dialog to add/edit events on crop cards
  pages/
    home.tsx                 - Landing/home page
    auth-page.tsx            - Phone/PIN login, register, forgot PIN, forced PIN change page
    admin-page.tsx           - Admin panel (user management, PIN reset)
    farm-management.tsx      - Crop card management (requires login)
    placeholder-page.tsx     - Placeholder for upcoming tabs

server/
  index.ts                   - Express server entry
  routes.ts                  - API routes + Krashu Mitra chat + farmer profile
  auth-phone.ts              - Phone/PIN auth (register, login, forgot-pin, session mgmt)
  storage.ts                 - Database CRUD operations
  db.ts                      - Database connection
  replit_integrations/       - Gemini AI integration

shared/
  schema.ts                  - Drizzle schemas (users, sessions, crop_cards, crop_events, conversations, messages)
  models/auth.ts             - Auth schema (users table with phoneNumber, pin, knownIps, farmerCode)
  models/chat.ts             - Chat schema
```

## Auth System
- **Registration**: Phone number (10-digit Indian) + name + 4-digit PIN → bcrypt hash + session
- **Login**: Phone number + PIN → verify bcrypt → session
- **Forgot PIN**: Only allowed if request IP matches a previously used IP (knownIps array)
- **Forced PIN Change**: If `mustChangePin` is true (set by admin reset), login redirects to PIN change screen
- **Session**: express-session with connect-pg-simple (PostgreSQL session store)
- **Middleware**: `isAuthenticated` checks `req.session.userId`; `isAdmin` checks `user.isAdmin`
- **Auth routes**: POST /api/auth/register, /api/auth/login, /api/auth/forgot-pin, /api/auth/change-pin, /api/auth/logout, GET /api/auth/user

## Admin System
- **Access**: Only users with `isAdmin: true` can access `/admin` page and admin API routes
- **Features**: View all registered users as cards, edit user details, reset user PIN to default "0000"
- **PIN Reset**: Sets user's PIN to "0000" and `mustChangePin: true`; user must set new PIN on next login
- **Admin routes**: GET /api/admin/users, PATCH /api/admin/users/:id, POST /api/admin/users/:id/reset-pin

## Tabs
1. **Home** - Landing page with feature cards
2. **Digital Clinic** - Placeholder (coming soon)
3. **Marketplace** - Placeholder (coming soon)
4. **Farm Management** - Crop card management with timeline (login required)
5. **Farm Khata** - Expense ledger with archive support
6. **Admin** - User management panel (admin only, visible in sidebar)

## Key Features
- Responsive layout: sidebar navigation on desktop (md+), bottom navigation on mobile
- Hindi default language with English toggle
- Crop card management with expandable timeline
- Event types: Plantation (green), Fertiliser (amber), Pesticide (red), Watering (blue), Harvesting (purple) — color-coded
- Harvesting event auto-created on every new crop card (4 months after start date)
- Harvesting events have optional "production per Bigha" field with unit toggle (Quintal or Bag)
- Edit and delete events with confirmation dialogs
- Auto-suggestions for descriptions based on history
- Krashu Mitra AI chatbot with voice input and TTS output (Hindi female voice, feminine persona)
- Stop button (red pill in chat area + square icon in input bar) to abort chatbot mid-response; partial text preserved, no blank bubbles
- Image attachment: users can share crop photos via camera/gallery; images stored in PostgreSQL (chat_images table), sent to Gemini for analysis (disease ID, pest ID, growth assessment)
- Voice input fills input box for review before sending (no auto-send)
- Chatbot responds with short bullet-point answers (3-5 points) and suggests 1-2 follow-up questions
- TTS uses slower rate (0.75) with natural pauses at sentence boundaries for better Hindi flow
- Assistant messages have a "Listen again" speaker button to replay TTS
- Chatbot shows inline images for visual topics (diseases, pests, growth stages) via [IMG: search keywords] markers — images pulled from Wikimedia Commons (free, no API key)
- Image search happens after text streaming completes; "Generating images..." loading indicator shown during search
- Images rendered inline between main answer and 🔎 follow-up suggestions (not at bottom)
- Markdown rendering: * and - bullets → • dots, ### headers → bold text, **bold** preserved, empty bullet lines cleaned
- Chat input is auto-growing textarea (1 row default, expands up to 4 rows, Enter sends, Shift+Enter new line)
- Chatbot is context-aware: knows farmer's existing crop cards and events
- Chatbot can create new crop cards via conversation (crop_card_draft)
- Chatbot can edit existing crop cards via conversation (crop_card_edit_draft)
- Each farmer gets a unique Farmer ID in FMYYYYMMDD{seq} format
- Farmer ID shown in chatbot header and sidebar profile
- Farm Khata (expense ledger) with 7 khata types:
  - **Crop Card Khata**: Links to crop cards, tracks expenses with 8 categories
  - **Batai Khata**: Sharecropping with BataiDar name/contact, batai ratio (Half/One Third), per-item expense allocation
  - **Panat Khata**: Land lease tracking with person name, rate/bigha, total bigha, payments, "Due" (बकाया) label
  - **Miscellaneous Khata**: Title-only khata with same expense items as crop card (no crop link/dates/production)
  - **Rental Khata (किराया खाता)**: One card per farmer with multiple rental items. Card stores farmer info (name, contact, village, opening balance, red flag). Each rental transaction is an item with: machinery type (9 options: harvester, pesticide spray, plantar, rotavator, seed drill, thresher, tractor, tractor trolley, others), farm work name, charges per bigha/hour, bigha/hours, auto-calculated total charges (editable), paid/unpaid toggle, remarks, date. Card title = "FarmerName, Village". Totals: unpaid items + opening balance → totalDue, paid items → totalPaid.
  - **Machinery Expense Khata (मशीनरी खर्चा)**: One card per machine. Card stores machine details: category (Tractor/Harvester/Thresher), optional machine name, optional HP, optional purchase year. Card title = "Category" or "Category - MachineName". Items track expenses with: expense category (Fuel/Maintenance/Others), amount, paid/unpaid, remarks, date. Uses standard totalCost/isPaid fields on khata_items — no extra DB columns for items. Card sub-info shows machine name, HP, purchase year. DB columns on khata_registers: machinery_category, machinery_name, machinery_hp, machinery_purchase_year.
  - **Lending Ledger (लेन देन खाता)**: One card per person. Card stores person info (name, contact, village, type credit/debit, red flag). Transactions are Borrowings (principal, interest rate monthly, date) or Payments (amount, date). Interest: daily simple interest (annual_rate = monthly×12/100, daily = remaining_principal × annual_rate / 365), compounded annually after 365 days. Payments apply FIFO: interest first, then principal. Accrual runs on-demand when viewing card + midnight cron (18:30 UTC = midnight IST). DB: lenden_transactions table + lenden_* columns on khata_registers. node-cron for scheduled accrual.
  - Filter by khata type, year, and month
  - Summary cards: Total Due (unpaid) and Total Paid
  - Expandable khata registers with add/edit/delete items
  - 8 expense categories with sub-type dropdowns: Farm Preparation, Seed Cost, Plantation, Fertiliser, Pesticide, Manual Weed, Watering Labour, Harvest
  - Each item tracks date, category, sub-type, hours, rate, total cost, remarks, paid/unpaid
  - Totals auto-recalculate on item add/edit/delete
  - Archive/unarchive khata registers (hidden by default, toggle to show)
  - Global unique integer IDs (shared sequence across crop_cards and khata_registers)

## Database Tables
- `users` - Auth users (id, phoneNumber, pin, knownIps, email, firstName, lastName, farmerCode, isAdmin, mustChangePin)
- `sessions` - Session storage (express-session with connect-pg-simple)
- `crop_cards` - Farmer's crop cards (uniqueId, userId, cropName, farmName?, variety?, startDate, status)
- `crop_events` - Timeline events (cropCardId, eventType, description, eventDate, isCompleted, productionPerBigha, productionUnit)
- `khata_registers` - Farm expense registers (uniqueId, userId, khataType, cropCardId?, title, plantationDate?, harvestDate?, production?, bataidarName?, bataidarContact?, bataiType?, bighaCount?, panatPersonName?, panatContact?, panatRatePerBigha?, panatTotalBigha?, panatTotalAmount?, panatRemarks?, rentalFarmerName?, rentalContact?, rentalVillage?, rentalOpeningBalance?, rentalRedFlag?, machineryCategory?, machineryName?, machineryHp?, machineryPurchaseYear?, lendenPersonName?, lendenContact?, lendenVillage?, lendenType?, lendenRedFlag?, isArchived, totalDue, totalPaid, totalOwnerExpense, totalBataidarExpense)
- `lenden_transactions` - Lending ledger transactions (id, khataRegisterId FK, transactionType, date, principalAmount, interestRateMonthly, remainingPrincipal, accruedInterest, lastAccrualDate, borrowingDate, paymentAmount, appliedToInterest, appliedToPrincipal, targetBorrowingId, remarks, createdAt)
- `khata_items` - Expense line items (khataRegisterId, date, expenseCategory, subType?, hours?, perBighaRate?, totalCost, remarks?, isPaid, expenseBornBy, rentalMachinery?, rentalFarmWork?, rentalChargesPerBigha?, rentalChargesPerHour?, rentalHours?, rentalBigha?, rentalTotalCharges?, rentalRemarks?, rentalIsPaid?)
- `global_unique_id_seq` - Shared sequence for uniqueId across crop_cards and khata_registers (starts at 100)
- `conversations` - Chat conversations
- `messages` - Chat messages

## API Endpoints
- `POST /api/auth/register` - Register with phone + name + PIN
- `POST /api/auth/login` - Login with phone + PIN
- `POST /api/auth/forgot-pin` - Reset PIN (IP verification required)
- `POST /api/auth/logout` - Destroy session
- `GET /api/auth/user` - Get current session user
- `GET /api/farmer/profile` - Returns user profile with farmerCode
- `GET /api/crop-cards` - List user's crop cards
- `POST /api/crop-cards` - Create crop card
- `PATCH /api/crop-cards/:id` - Update crop card
- `DELETE /api/crop-cards/:id` - Delete crop card
- `GET /api/crop-cards/:id/events` - List events for a card
- `POST /api/crop-cards/:id/events` - Create event
- `PATCH /api/crop-events/:id` - Update event
- `DELETE /api/crop-events/:id` - Delete event
- `POST /api/crop-events/:id/toggle` - Toggle event completion
- `POST /api/auth/change-pin` - Change PIN (requires oldPin + newPin)
- `GET /api/admin/users` - List all users (admin only)
- `PATCH /api/admin/users/:id` - Edit user details (admin only)
- `POST /api/admin/users/:id/reset-pin` - Reset PIN to 0000 (admin only)
- `POST /api/krashuved/chat` - Chatbot (streams response, includes farmer context + conversation history)
- `GET /api/khata` - List khata registers (with type/year/month filters)
- `GET /api/khata/:id` - Get single khata with items
- `POST /api/khata` - Create khata register
- `PATCH /api/khata/:id` - Update khata register
- `DELETE /api/khata/:id` - Delete khata register
- `POST /api/khata/:id/archive` - Toggle archive/unarchive khata register
- `POST /api/khata/:id/items` - Add expense item
- `PATCH /api/khata/items/:itemId` - Update expense item
- `DELETE /api/khata/items/:itemId` - Delete expense item
