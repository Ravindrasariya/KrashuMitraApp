import { sql } from "drizzle-orm";
import { pgTable, pgSequence, serial, integer, text, varchar, timestamp, boolean, date, uniqueIndex, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
export * from "./models/chat";

import { users } from "./models/auth";

export const globalUniqueIdSeq = pgSequence("global_unique_id_seq");

export const cropCards = pgTable("crop_cards", {
  id: serial("id").primaryKey(),
  uniqueId: integer("unique_id").default(sql`nextval('global_unique_id_seq')`),
  userId: varchar("user_id").notNull().references(() => users.id),
  cropName: text("crop_name").notNull(),
  farmName: text("farm_name"),
  variety: text("variety"),
  startDate: date("start_date").notNull(),
  status: text("status").notNull().default("active"),
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const cropEvents = pgTable("crop_events", {
  id: serial("id").primaryKey(),
  cropCardId: integer("crop_card_id").notNull().references(() => cropCards.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  description: text("description"),
  eventDate: date("event_date").notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  productionPerBigha: text("production_per_bigha"),
  productionUnit: text("production_unit").default("quintal"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const khataRegisters = pgTable("khata_registers", {
  id: serial("id").primaryKey(),
  uniqueId: integer("unique_id").default(sql`nextval('global_unique_id_seq')`),
  userId: varchar("user_id").notNull().references(() => users.id),
  khataType: text("khata_type").notNull().default("crop_card"),
  cropCardId: integer("crop_card_id").references(() => cropCards.id),
  title: text("title").notNull(),
  plantationDate: date("plantation_date"),
  harvestDate: date("harvest_date"),
  production: text("production"),
  productionUnit: text("production_unit"),
  bataidarName: text("bataidar_name"),
  bataidarContact: text("bataidar_contact"),
  bataiType: text("batai_type"),
  bighaCount: text("bigha_count"),
  panatPersonName: text("panat_person_name"),
  panatContact: text("panat_contact"),
  panatRatePerBigha: text("panat_rate_per_bigha"),
  panatTotalBigha: text("panat_total_bigha"),
  panatTotalAmount: text("panat_total_amount"),
  panatRemarks: text("panat_remarks"),
  rentalFarmerName: text("rental_farmer_name"),
  rentalContact: text("rental_contact"),
  rentalVillage: text("rental_village"),
  rentalOpeningBalance: text("rental_opening_balance"),
  rentalRedFlag: boolean("rental_red_flag").default(false),
  rentalMachinery: text("rental_machinery"),
  rentalFarmWork: text("rental_farm_work"),
  rentalChargesPerBigha: text("rental_charges_per_bigha"),
  rentalChargesPerHour: text("rental_charges_per_hour"),
  rentalHours: text("rental_hours"),
  rentalBigha: text("rental_bigha"),
  rentalTotalCharges: text("rental_total_charges"),
  rentalIsPaid: boolean("rental_is_paid").default(false),
  rentalRemarks: text("rental_remarks"),
  machineryCategory: text("machinery_category"),
  machineryName: text("machinery_name"),
  machineryHp: text("machinery_hp"),
  machineryPurchaseYear: text("machinery_purchase_year"),
  lendenPersonName: text("lenden_person_name"),
  lendenContact: text("lenden_contact"),
  lendenVillage: text("lenden_village"),
  lendenType: text("lenden_type"),
  lendenRedFlag: boolean("lenden_red_flag").default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  totalDue: text("total_due").notNull().default("0"),
  totalPaid: text("total_paid").notNull().default("0"),
  totalOwnerExpense: text("total_owner_expense").notNull().default("0"),
  totalBataidarExpense: text("total_bataidar_expense").notNull().default("0"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const khataItems = pgTable("khata_items", {
  id: serial("id").primaryKey(),
  khataRegisterId: integer("khata_register_id").notNull().references(() => khataRegisters.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  expenseCategory: text("expense_category").notNull(),
  subType: text("sub_type"),
  hours: text("hours"),
  perBighaRate: text("per_bigha_rate"),
  totalCost: text("total_cost").notNull().default("0"),
  remarks: text("remarks"),
  isPaid: boolean("is_paid").notNull().default(false),
  expenseBornBy: text("expense_born_by").notNull().default("batai_ratio"),
  rentalMachinery: text("rental_machinery"),
  rentalFarmWork: text("rental_farm_work"),
  rentalChargesPerBigha: text("rental_charges_per_bigha"),
  rentalChargesPerHour: text("rental_charges_per_hour"),
  rentalHours: text("rental_hours"),
  rentalBigha: text("rental_bigha"),
  rentalTotalCharges: text("rental_total_charges"),
  rentalRemarks: text("rental_remarks"),
  rentalIsPaid: boolean("rental_is_paid").default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const panatPayments = pgTable("panat_payments", {
  id: serial("id").primaryKey(),
  khataRegisterId: integer("khata_register_id").notNull().references(() => khataRegisters.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  amount: text("amount").notNull().default("0"),
  paymentMode: text("payment_mode").notNull().default("cash"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const lendenTransactions = pgTable("lenden_transactions", {
  id: serial("id").primaryKey(),
  khataRegisterId: integer("khata_register_id").notNull().references(() => khataRegisters.id, { onDelete: "cascade" }),
  transactionType: text("transaction_type").notNull(),
  date: date("date").notNull(),
  principalAmount: text("principal_amount"),
  interestRateMonthly: text("interest_rate_monthly"),
  remainingPrincipal: text("remaining_principal"),
  accruedInterest: text("accrued_interest"),
  lastAccrualDate: date("last_accrual_date"),
  borrowingDate: date("borrowing_date"),
  paymentAmount: text("payment_amount"),
  appliedToInterest: text("applied_to_interest"),
  appliedToPrincipal: text("applied_to_principal"),
  targetBorrowingId: integer("target_borrowing_id"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCropCardSchema = createInsertSchema(cropCards).omit({
  id: true,
  uniqueId: true,
  createdAt: true,
});

export const insertCropEventSchema = createInsertSchema(cropEvents).omit({
  id: true,
  createdAt: true,
});

export const insertKhataRegisterSchema = createInsertSchema(khataRegisters).omit({
  id: true,
  uniqueId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKhataItemSchema = createInsertSchema(khataItems).omit({
  id: true,
  createdAt: true,
});

export const insertPanatPaymentSchema = createInsertSchema(panatPayments).omit({
  id: true,
  createdAt: true,
});

export const insertLendenTransactionSchema = createInsertSchema(lendenTransactions).omit({
  id: true,
  createdAt: true,
});

export const chatImages = pgTable("chat_images", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  imageData: text("image_data").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertChatImageSchema = createInsertSchema(chatImages).omit({
  id: true,
  createdAt: true,
});

export const serviceRequests = pgTable("service_requests", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  serviceType: text("service_type").notNull(),
  status: text("status").notNull().default("open"),
  farmerName: text("farmer_name"),
  farmerPhone: text("farmer_phone"),
  farmerCode: text("farmer_code"),
  imageData: text("image_data"),
  imageMimeType: text("image_mime_type"),
  imageDataList: text("image_data_list").array(),
  imageMimeTypeList: text("image_mime_type_list").array(),
  declaredSizeBand: text("declared_size_band"),
  aiDiagnosis: text("ai_diagnosis"),
  inputData: text("input_data"),
  adminRemarks: text("admin_remarks"),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;

export type ChatImage = typeof chatImages.$inferSelect;
export type InsertChatImage = z.infer<typeof insertChatImageSchema>;

export type CropCard = typeof cropCards.$inferSelect;
export type InsertCropCard = z.infer<typeof insertCropCardSchema>;
export type CropEvent = typeof cropEvents.$inferSelect;
export type InsertCropEvent = z.infer<typeof insertCropEventSchema>;
export type KhataRegister = typeof khataRegisters.$inferSelect;
export type InsertKhataRegister = z.infer<typeof insertKhataRegisterSchema>;
export type KhataItem = typeof khataItems.$inferSelect;
export type InsertKhataItem = z.infer<typeof insertKhataItemSchema>;
export type PanatPayment = typeof panatPayments.$inferSelect;
export type InsertPanatPayment = z.infer<typeof insertPanatPaymentSchema>;
export type LendenTransaction = typeof lendenTransactions.$inferSelect;
export type InsertLendenTransaction = z.infer<typeof insertLendenTransactionSchema>;

// Marketplace dropdown options shared between seller form (frontend) and
// validation allow-list (backend) so they cannot drift out of sync.
// Kept alphabetised with "Others" pinned at the bottom.
export const MARKETPLACE_ONION_SEED_TYPES = ["Nafed", "Nasik", "Others"] as const;
export const MARKETPLACE_ONION_SEED_VARIETIES = [
  "Agriwell",
  "Kalash",
  "Nasik Fursungi",
  "Nasik Red (N-53)",
  "NHRDF Red / L-28",
  "Others",
] as const;
export const MARKETPLACE_ONION_SEED_BRANDS = [
  "Deepak",
  "Divya Seeds",
  "East-West Seed",
  "Ellora",
  "Farmson Biotech",
  "Indo-American Hybrid Seeds (IAHS)",
  "Jindal Seeds",
  "Kalash Seeds",
  "Malav Seeds",
  "Mukund",
  "Namdhari Seeds",
  "Prashant",
  "Rudraksh Seeds",
  "Sarpan Hybrid Seeds",
  "Seminis (Bayer)",
  "Syngenta",
  "Urja Seeds",
  "Others",
] as const;

// Bardan/Bags allow-lists shared between client form dropdowns and
// server-side validation so the two never drift.
export const MARKETPLACE_BAG_COMMODITY_TYPES = ["Onion", "Potato", "Garlic", "Others"] as const;
export const MARKETPLACE_BAG_MATERIAL_TYPES = ["Jute/Hessian", "LENO Mesh", "PP", "Others"] as const;
export const MARKETPLACE_BAG_COLORS = ["Red", "Orange", "Blue", "Violet", "Yellow", "Pink"] as const;
export const MARKETPLACE_BAG_GSM_OPTIONS = [40, 50, 60, 70, 80, 90, 100, 120, 150] as const;

// Exhaust Fan allow-lists shared between client form dropdowns and
// server-side validation so the two never drift.
export const MARKETPLACE_FAN_BRANDS = ["Crompton", "Havells", "Usha", "Others"] as const;
export const MARKETPLACE_FAN_COLORS = ["Grey", "Brown", "Black", "Others"] as const;

export const marketplaceListings = pgTable("marketplace_listings", {
  id: serial("id").primaryKey(),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  category: text("category").notNull(),
  photoData: text("photo_data"),
  photoMime: varchar("photo_mime"),
  quantityBigha: text("quantity_bigha"),
  availableAfterDays: integer("available_after_days"),
  onionType: text("onion_type"),
  quantityBags: text("quantity_bags"),
  potatoVariety: text("potato_variety"),
  potatoBrand: text("potato_brand"),
  onionSeedType: text("onion_seed_type"),
  onionSeedVariety: text("onion_seed_variety"),
  onionSeedBrand: text("onion_seed_brand"),
  onionSeedPricePerKg: integer("onion_seed_price_per_kg"),
  soyabeanSeedDuration: text("soyabean_seed_duration"),
  soyabeanSeedVariety: text("soyabean_seed_variety"),
  soyabeanSeedPricePerQuintal: integer("soyabean_seed_price_per_quintal"),
  bagCommodityType: text("bag_commodity_type").array(),
  bagCommodityOther: text("bag_commodity_other"),
  bagMaterialType: text("bag_material_type"),
  bagDimension: text("bag_dimension"),
  bagGsm: integer("bag_gsm").array(),
  bagColor: text("bag_color"),
  bagMinQuantity: integer("bag_min_quantity"),
  bagPricePerBag: integer("bag_price_per_bag"),
  fanBrand: text("fan_brand"),
  fanBrandOther: text("fan_brand_other"),
  fanColor: text("fan_color"),
  fanColorOther: text("fan_color_other"),
  fanWattage: integer("fan_wattage"),
  fanVoltage: integer("fan_voltage"),
  fanAirflowCmh: integer("fan_airflow_cmh"),
  fanBladeLengthMm: integer("fan_blade_length_mm"),
  fanSpeedRpm: integer("fan_speed_rpm"),
  fanBladeMaterial: text("fan_blade_material"),
  fanBladeCount: integer("fan_blade_count"),
  fanCountryOfOrigin: text("fan_country_of_origin"),
  fanWarrantyYears: integer("fan_warranty_years"),
  fanDimensions: text("fan_dimensions"),
  fanPricePerPiece: integer("fan_price_per_piece"),
  sellerVillage: text("seller_village"),
  sellerTehsil: text("seller_tehsil"),
  sellerDistrict: text("seller_district"),
  sellerLat: varchar("seller_lat"),
  sellerLng: varchar("seller_lng"),
  // Task #79: optional 50-char freehand note (Hindi or English) the seller
  // can use to mention things the structured fields don't cover (e.g.,
  // "delivery available", "no GST invoice", "trial pieces shareable").
  // Shown inside the listing detail popup and appended to og:description for
  // social link previews when non-empty. Nullable; empty input is stored as
  // null (the form trims and coerces "" -> null before submit).
  additionalNotes: text("additional_notes"),
  // Task #81: server-generated per-day stock identifier of the form
  // `YYYYMMDD-N` (IST calendar day + monotonically increasing counter that
  // resets at IST midnight). Assigned atomically inside the same DB
  // transaction as the listing insert (see `createMarketplaceListing` in
  // server/storage.ts) using the `marketplace_stock_counters` table. This is
  // a backend-only identifier — it is intentionally NOT shown anywhere in
  // the UI. The column is nullable in the schema so production rows that
  // existed before this migration ran (and any rows in environments where
  // the backfill hasn't been applied yet) keep working without the field.
  // Every newly-created listing always gets a non-null value.
  stockId: text("stock_id").unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Task #81: per-IST-day counter table for atomic stock-ID generation. Keyed
// by the IST calendar day (`YYYYMMDD`); `last_n` is the highest integer
// already issued for that day. The `INSERT … ON CONFLICT … DO UPDATE …
// RETURNING` upsert in `createMarketplaceListing` is row-level atomic, so
// two concurrent listing creates can never receive the same `last_n`.
export const marketplaceStockCounters = pgTable("marketplace_stock_counters", {
  istDay: text("ist_day").primaryKey(),
  lastN: integer("last_n").notNull(),
});

export type MarketplaceStockCounter = typeof marketplaceStockCounters.$inferSelect;

export const insertMarketplaceListingSchema = createInsertSchema(marketplaceListings)
  .omit({
    id: true,
    createdAt: true,
    stockId: true,
  })
  .extend({
    // Hard cap at 50 chars at the API boundary so a misbehaving / non-form
    // client can't bypass the form's maxLength={50}. The form already trims
    // and coerces empty strings to null before submit; keep .nullable() so
    // the field can be cleared on edit, and .optional() so create / partial
    // edit payloads that don't mention it are still valid.
    additionalNotes: z.string().trim().max(50).nullable().optional(),
  });

export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type InsertMarketplaceListing = z.infer<typeof insertMarketplaceListingSchema>;

export const marketplacePhotos = pgTable("marketplace_photos", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => marketplaceListings.id, { onDelete: "cascade" }),
  photoData: text("photo_data").notNull(),
  photoMime: varchar("photo_mime").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertMarketplacePhotoSchema = createInsertSchema(marketplacePhotos).omit({
  id: true,
});

export type MarketplacePhoto = typeof marketplacePhotos.$inferSelect;
export type InsertMarketplacePhoto = z.infer<typeof insertMarketplacePhotoSchema>;

export const marketplaceRatings = pgTable("marketplace_ratings", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => marketplaceListings.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  stars: integer("stars").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("marketplace_ratings_listing_user_idx").on(table.listingId, table.userId),
]);

export const insertMarketplaceRatingSchema = createInsertSchema(marketplaceRatings).omit({
  id: true,
  createdAt: true,
});

export type MarketplaceRating = typeof marketplaceRatings.$inferSelect;
export type InsertMarketplaceRating = z.infer<typeof insertMarketplaceRatingSchema>;

export const banners = pgTable("banners", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 10 }).notNull().default("text"),
  headingHi: text("heading_hi"),
  headingEn: text("heading_en"),
  subHeadingHi: text("sub_heading_hi"),
  subHeadingEn: text("sub_heading_en"),
  descriptionHi: text("description_hi"),
  descriptionEn: text("description_en"),
  imageData: text("image_data"),
  imageMime: varchar("image_mime"),
  captionHi: text("caption_hi"),
  captionEn: text("caption_en"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertBannerSchema = createInsertSchema(banners).omit({
  id: true,
  createdAt: true,
});

export type Banner = typeof banners.$inferSelect;
export type InsertBanner = z.infer<typeof insertBannerSchema>;

export const priceCrops = pgTable("price_crops", {
  id: serial("id").primaryKey(),
  nameHi: text("name_hi").notNull(),
  nameEn: text("name_en").notNull(),
  recommendation: varchar("recommendation", { length: 10 }),
  uploadedSources: text("uploaded_sources").array().default(sql`'{}'::text[]`),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPriceCropSchema = createInsertSchema(priceCrops).omit({
  id: true,
  createdAt: true,
});

export type PriceCrop = typeof priceCrops.$inferSelect;
export type InsertPriceCrop = z.infer<typeof insertPriceCropSchema>;

export const priceEntries = pgTable("price_entries", {
  id: serial("id").primaryKey(),
  cropId: integer("crop_id").notNull().references(() => priceCrops.id, { onDelete: "cascade" }),
  market: text("market").notNull(),
  district: text("district"),
  state: text("state"),
  date: date("date").notNull(),
  minPrice: numeric("min_price").notNull(),
  maxPrice: numeric("max_price").notNull(),
  modalPrice: numeric("modal_price").notNull(),
  unit: text("unit").notNull().default("quintal"),
});

export const insertPriceEntrySchema = createInsertSchema(priceEntries).omit({
  id: true,
});

export type PriceEntry = typeof priceEntries.$inferSelect;
export type InsertPriceEntry = z.infer<typeof insertPriceEntrySchema>;

export const pricePolls = pgTable("price_polls", {
  id: serial("id").primaryKey(),
  cropId: integer("crop_id").notNull().references(() => priceCrops.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  vote: varchar("vote", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("price_polls_crop_user_idx").on(table.cropId, table.userId),
]);

export const insertPricePollSchema = createInsertSchema(pricePolls).omit({
  id: true,
  createdAt: true,
});

export type PricePoll = typeof pricePolls.$inferSelect;
export type InsertPricePoll = z.infer<typeof insertPricePollSchema>;

export const siteVisits = pgTable("site_visits", {
  id: serial("id").primaryKey(),
  visitorId: varchar("visitor_id").notNull(),
  ip: varchar("ip"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("site_visits_visitor_date_idx").on(table.visitorId, table.createdAt),
]);

export type SiteVisit = typeof siteVisits.$inferSelect;

export const weatherLogs = pgTable("weather_logs", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  latitude: numeric("latitude").notNull(),
  longitude: numeric("longitude").notNull(),
  locationLabel: text("location_label"),
  tempMax: numeric("temp_max"),
  tempMin: numeric("temp_min"),
  tempMean: numeric("temp_mean"),
  apparentTempMax: numeric("apparent_temp_max"),
  apparentTempMin: numeric("apparent_temp_min"),
  precipitationSum: numeric("precipitation_sum"),
  rainSum: numeric("rain_sum"),
  weatherCode: integer("weather_code"),
  windSpeedMax: numeric("wind_speed_max"),
  windGustsMax: numeric("wind_gusts_max"),
  humidityMean: numeric("humidity_mean"),
  dewPointMean: numeric("dew_point_mean"),
  pressureMean: numeric("pressure_mean"),
  soilTemp0to7: numeric("soil_temp_0_to_7"),
  soilTemp7to28: numeric("soil_temp_7_to_28"),
  soilTemp28to100: numeric("soil_temp_28_to_100"),
  soilMoisture0to7: numeric("soil_moisture_0_to_7"),
  soilMoisture7to28: numeric("soil_moisture_7_to_28"),
  soilMoisture28to100: numeric("soil_moisture_28_to_100"),
  et0Evapotranspiration: numeric("et0_evapotranspiration"),
  uvIndexMax: numeric("uv_index_max"),
  sunrise: text("sunrise"),
  sunset: text("sunset"),
  daylightDuration: numeric("daylight_duration"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("weather_logs_date_lat_lng_idx").on(table.date, table.latitude, table.longitude),
]);

export const insertWeatherLogSchema = createInsertSchema(weatherLogs).omit({
  id: true,
  createdAt: true,
});

export type WeatherLog = typeof weatherLogs.$inferSelect;
export type InsertWeatherLog = z.infer<typeof insertWeatherLogSchema>;
