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
  aiDiagnosis: text("ai_diagnosis"),
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
  sellerVillage: text("seller_village"),
  sellerTehsil: text("seller_tehsil"),
  sellerDistrict: text("seller_district"),
  sellerLat: varchar("seller_lat"),
  sellerLng: varchar("seller_lng"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMarketplaceListingSchema = createInsertSchema(marketplaceListings).omit({
  id: true,
  createdAt: true,
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
