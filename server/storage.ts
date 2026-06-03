import { db } from "./db";
import { users, type User, cropCards, cropEvents, type CropCard, type InsertCropCard, type CropEvent, type InsertCropEvent, khataRegisters, khataItems, type KhataRegister, type InsertKhataRegister, type KhataItem, type InsertKhataItem, panatPayments, type PanatPayment, type InsertPanatPayment, lendenTransactions, type LendenTransaction, type InsertLendenTransaction, chatImages, type ChatImage, serviceRequests, type ServiceRequest, type InsertServiceRequest, marketplaceListings, type MarketplaceListing, type InsertMarketplaceListing, marketplacePhotos, type MarketplacePhoto, marketplaceRatings, type MarketplaceRating, marketplaceStockCounters, banners, type Banner, type InsertBanner, priceCrops, type PriceCrop, type InsertPriceCrop, priceEntries, type PriceEntry, type InsertPriceEntry, pricePolls, type PricePoll, siteVisits, weatherLogs, type WeatherLog, type InsertWeatherLog, bills, type Bill, type InsertBill, buyers, type Buyer, cropStageReferences, type CropStageReference, type InsertCropStageReference, plotHealthSearches, type PlotHealthSearch, type InsertPlotHealthSearch, savedFarms, type SavedFarm, type InsertSavedFarm, PLOT_CROP_STAGES, type PlotCropKey } from "@shared/schema";
import { eq, desc, and, like, sql, ilike, asc, lt, isNull, isNotNull } from "drizzle-orm";

// Task #112: buyer identity is normalized — case-insensitive on name with
// internal whitespace collapsed, and phone with all whitespace stripped.
export function normalizeBuyerName(s: string): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}
export function normalizeBuyerPhone(s: string): string {
  return String(s ?? "").replace(/\s+/g, "");
}

export interface BuyerWithDue extends Buyer {
  totalDue: string;
  totalPaid: string;
}

// ---------------------------------------------------------------------------
// Task #143: Plot Health crop+stage reference seed data.
//
// Rather than hand-write a band per (crop, stage) row, every stage is mapped to
// one of seven phenological PHASES, and each phase carries one band set for
// NDVI / NDRE / NDMI (lower / typical / upper). This keeps the seed compact and
// internally consistent (the same physiological moment yields the same band
// across crops). Numbers are derived from published remote-sensing references:
//   - NDVI breakpoints from the general USGS/NASA vegetation scale, shaped over
//     the season to match Sentinel-2 crop-phenology literature (MDPI Remote
//     Sensing / FAO-ICAR for Indian crops).
//   - NDRE nitrogen bands (<0.2 severe deficiency, 0.3-0.6 healthy) and NDMI
//     moisture bands (>0.4 well-hydrated, 0.0-0.2 mild stress, <0 deficit) from
//     EOSDA Crop Monitoring and Sentinel Hub index docs.
// Bands stay DB-stored and tunable; per the references, absolute thresholds must
// be validated against local cultivar/region/atmosphere conditions.
type PlotPhase = "emergence" | "early" | "veg" | "peak" | "filling" | "maturity" | "harvest";

interface IndexBand { lower: number; typical: number; upper: number }
interface PhaseBands { ndvi: IndexBand; ndre: IndexBand; ndmi: IndexBand }

const PLOT_PHASE_BANDS: Record<PlotPhase, PhaseBands> = {
  emergence: { ndvi: { lower: 0.15, typical: 0.25, upper: 0.40 }, ndre: { lower: 0.10, typical: 0.18, upper: 0.30 }, ndmi: { lower: 0.00, typical: 0.10, upper: 0.25 } },
  early:     { ndvi: { lower: 0.30, typical: 0.45, upper: 0.60 }, ndre: { lower: 0.18, typical: 0.28, upper: 0.40 }, ndmi: { lower: 0.05, typical: 0.18, upper: 0.30 } },
  veg:       { ndvi: { lower: 0.45, typical: 0.60, upper: 0.75 }, ndre: { lower: 0.25, typical: 0.35, upper: 0.50 }, ndmi: { lower: 0.15, typical: 0.28, upper: 0.40 } },
  peak:      { ndvi: { lower: 0.65, typical: 0.80, upper: 0.90 }, ndre: { lower: 0.30, typical: 0.45, upper: 0.60 }, ndmi: { lower: 0.20, typical: 0.35, upper: 0.50 } },
  filling:   { ndvi: { lower: 0.45, typical: 0.60, upper: 0.75 }, ndre: { lower: 0.22, typical: 0.32, upper: 0.45 }, ndmi: { lower: 0.10, typical: 0.25, upper: 0.40 } },
  maturity:  { ndvi: { lower: 0.25, typical: 0.40, upper: 0.55 }, ndre: { lower: 0.12, typical: 0.20, upper: 0.32 }, ndmi: { lower: 0.00, typical: 0.12, upper: 0.28 } },
  harvest:   { ndvi: { lower: 0.15, typical: 0.25, upper: 0.40 }, ndre: { lower: 0.08, typical: 0.15, upper: 0.28 }, ndmi: { lower: -0.05, typical: 0.05, upper: 0.20 } },
};

// Short bilingual stage guidance keyed by phase (generic, stage-appropriate).
const PLOT_PHASE_GUIDANCE: Record<PlotPhase, { hi: string; en: string }> = {
  emergence: { hi: "अंकुरण अवस्था — खेत में नमी बनाए रखें और जमाव की निगरानी करें।", en: "Emergence — keep soil moist and watch for an even, healthy stand." },
  early:     { hi: "प्रारंभिक वृद्धि — खरपतवार नियंत्रण और हल्की खाद पर ध्यान दें।", en: "Early growth — focus on weed control and a light starter dose of nutrients." },
  veg:       { hi: "वानस्पतिक वृद्धि — नाइट्रोजन व सिंचाई पर्याप्त रखें ताकि कैनोपी अच्छी बने।", en: "Vegetative growth — maintain nitrogen and irrigation so the canopy builds well." },
  peak:      { hi: "चरम वृद्धि/प्रजनन अवस्था — जल व पोषक तत्वों की मांग सबसे अधिक है, तनाव से बचाएं।", en: "Peak/reproductive stage — water and nutrient demand is highest; avoid any stress." },
  filling:   { hi: "उपज भराव अवस्था — संतुलित नमी रखें; अधिक नाइट्रोजन से बचें।", en: "Yield-filling stage — keep moisture balanced; avoid excess late nitrogen." },
  maturity:  { hi: "परिपक्वता — सिंचाई धीरे-धीरे कम करें; फसल का पकना देखें।", en: "Maturity — taper off irrigation and monitor the crop ripening." },
  harvest:   { hi: "कटाई हेतु तैयार — कटाई व भंडारण की योजना बनाएं।", en: "Harvest ready — plan harvesting and storage." },
};

// (crop → stage → phase) map. Mirrors PLOT_CROP_STAGES in shared/schema.ts.
const PLOT_STAGE_PHASE: Record<PlotCropKey, Record<string, PlotPhase>> = {
  potato: { emergence: "emergence", vegetative_growth: "veg", canopy_development: "peak", tuber_formation: "peak", tuber_bulking: "peak", maturity: "maturity", harvest_ready: "harvest" },
  onion: { germination_emergence: "emergence", vegetative_growth: "veg", bulb_initiation: "peak", bulb_development: "peak", bulb_maturity: "filling", harvest_ready: "harvest" },
  garlic: { germination_emergence: "emergence", vegetative_growth: "veg", bulb_initiation: "peak", bulb_development: "peak", bulb_maturity: "filling", harvest_ready: "harvest" },
  wheat: { germination: "emergence", tillering: "veg", stem_elongation: "peak", ear_emergence: "peak", flowering: "peak", grain_filling: "filling", maturity: "maturity", harvest_ready: "harvest" },
  soybean: { germination: "emergence", vegetative_growth: "veg", flowering: "peak", pod_formation: "peak", seed_filling: "filling", maturity: "maturity", harvest_ready: "harvest" },
  moong: { germination: "emergence", vegetative_growth: "veg", flowering: "peak", pod_formation: "peak", seed_filling: "filling", maturity: "maturity", harvest_ready: "harvest" },
  peas: { germination: "emergence", vegetative_growth: "veg", flowering: "peak", pod_formation: "peak", pod_development: "filling", maturity: "maturity", harvest_ready: "harvest" },
  chilli: { early_growth: "early", vegetative_growth: "veg", reproductive_stage: "peak", yield_formation_stage: "filling", maturity: "maturity", harvest_ready: "harvest" },
  cotton: { early_growth: "early", vegetative_growth: "veg", reproductive_stage: "peak", yield_formation_stage: "filling", maturity: "maturity", harvest_ready: "harvest" },
  tomato: { early_growth: "early", vegetative_growth: "veg", reproductive_stage: "peak", yield_formation_stage: "filling", maturity: "maturity", harvest_ready: "harvest" },
  others: { early_growth: "early", vegetative_growth: "veg", reproductive_stage: "peak", yield_formation_stage: "filling", maturity: "maturity", harvest_ready: "harvest" },
  barren: {},
};

// Task #146: at maturity / harvest the canopy naturally senesces, so a drop in
// the vegetation indices is expected there. The "fell vs the plot's previous
// reading" warning is suppressed for those phases. PLOT_STAGE_PHASE stays the
// single source of truth for the crop→stage→phase mapping.
export function isDeclineExemptStage(cropKey: string, stageKey: string): boolean {
  const phase = PLOT_STAGE_PHASE[cropKey as PlotCropKey]?.[stageKey];
  if (phase === "maturity" || phase === "harvest") return true;
  // Some crops (e.g. onion/garlic `bulb_maturity`) name a maturity stage that
  // maps to an earlier phase bucket for the reference band. Senescence/decline
  // is still expected at any explicitly maturity- or harvest-named stage, so
  // exempt those by stage key too rather than mutating the shared phase map.
  return /maturity|harvest/.test(stageKey);
}

// Crops with strong per-stage Sentinel-2 phenology literature get a specific
// source; the rest lean on the general scale and are flagged generic.
const PLOT_CROP_WELL_SUPPORTED = new Set<PlotCropKey>(["potato", "onion", "wheat", "soybean"]);
const PLOT_SOURCE_SPECIFIC = "Sentinel-2 crop-phenology literature (MDPI Remote Sensing / FAO-ICAR); NDRE/NDMI bands from EOSDA Crop Monitoring & Sentinel Hub.";
const PLOT_SOURCE_GENERIC = "General NDVI scale (USGS/NASA) + EOSDA/Sentinel Hub NDRE & NDMI bands — generic estimate, validate against local conditions.";

function buildCropStageReferenceSeed(): InsertCropStageReference[] {
  const rows: InsertCropStageReference[] = [];
  for (const cropKey of Object.keys(PLOT_STAGE_PHASE) as PlotCropKey[]) {
    const stageMap = PLOT_STAGE_PHASE[cropKey];
    const wellSupported = PLOT_CROP_WELL_SUPPORTED.has(cropKey);
    for (const stageKey of Object.keys(stageMap)) {
      const phase = stageMap[stageKey];
      const b = PLOT_PHASE_BANDS[phase];
      const g = PLOT_PHASE_GUIDANCE[phase];
      rows.push({
        cropKey,
        stageKey,
        ndviLower: b.ndvi.lower, ndviTypical: b.ndvi.typical, ndviUpper: b.ndvi.upper,
        ndreLower: b.ndre.lower, ndreTypical: b.ndre.typical, ndreUpper: b.ndre.upper,
        ndmiLower: b.ndmi.lower, ndmiTypical: b.ndmi.typical, ndmiUpper: b.ndmi.upper,
        guidanceHi: g.hi,
        guidanceEn: g.en,
        source: wellSupported ? PLOT_SOURCE_SPECIFIC : PLOT_SOURCE_GENERIC,
        isGeneric: !wellSupported,
      });
    }
  }
  return rows;
}

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  ensureFarmerCode(userId: string): Promise<string>;
  getAllUsers(): Promise<User[]>;
  updateUserAdmin(id: string, data: Partial<Pick<User, "firstName" | "lastName" | "phoneNumber" | "email">>): Promise<User | undefined>;
  updateUserProfile(id: string, data: Partial<Pick<User, "firstName" | "village" | "tehsil" | "district" | "state" | "postalCode" | "latitude" | "longitude" | "firmName" | "firmAddress" | "firmState" | "firmPincode" | "firmPan" | "firmGst">>): Promise<User | undefined>;
  resetUserPin(id: string, hashedPin: string): Promise<User | undefined>;
  getCropCardsByUser(userId: string, showArchived?: boolean): Promise<CropCard[]>;
  archiveCropCard(id: number): Promise<CropCard | undefined>;
  getCropCardsWithEvents(userId: string): Promise<Array<CropCard & { events: CropEvent[] }>>;
  getCropCard(id: number): Promise<CropCard | undefined>;
  createCropCard(card: InsertCropCard): Promise<CropCard>;
  updateCropCard(id: number, data: Partial<InsertCropCard>): Promise<CropCard | undefined>;
  deleteCropCard(id: number): Promise<void>;
  getCropEvent(id: number): Promise<CropEvent | undefined>;
  getCropEvents(cropCardId: number): Promise<CropEvent[]>;
  createCropEvent(event: InsertCropEvent): Promise<CropEvent>;
  updateCropEvent(id: number, data: Partial<InsertCropEvent>): Promise<CropEvent | undefined>;
  deleteCropEvent(id: number): Promise<void>;
  toggleCropEventComplete(id: number): Promise<CropEvent | undefined>;
  getSuggestions(userId: string): Promise<string[]>;
  getKhataRegisters(userId: string, filters?: { khataType?: string; year?: number; month?: number; showArchived?: boolean }): Promise<KhataRegister[]>;
  archiveKhataRegister(id: number): Promise<KhataRegister | undefined>;
  getKhataRegister(id: number): Promise<KhataRegister | undefined>;
  createKhataRegister(data: InsertKhataRegister): Promise<KhataRegister>;
  updateKhataRegister(id: number, data: Partial<InsertKhataRegister>): Promise<KhataRegister | undefined>;
  deleteKhataRegister(id: number): Promise<void>;
  getKhataItems(registerId: number): Promise<KhataItem[]>;
  createKhataItem(data: InsertKhataItem): Promise<KhataItem>;
  updateKhataItem(id: number, data: Partial<InsertKhataItem>): Promise<KhataItem | undefined>;
  deleteKhataItem(id: number): Promise<void>;
  getKhataItem(id: number): Promise<KhataItem | undefined>;
  recalculateKhataTotals(registerId: number): Promise<void>;
  getPanatPayments(registerId: number): Promise<PanatPayment[]>;
  createPanatPayment(data: InsertPanatPayment): Promise<PanatPayment>;
  deletePanatPayment(id: number): Promise<void>;
  getPanatPayment(id: number): Promise<PanatPayment | undefined>;
  getLendenTransactions(registerId: number): Promise<LendenTransaction[]>;
  getLendenTransaction(id: number): Promise<LendenTransaction | undefined>;
  createLendenBorrowing(data: { khataRegisterId: number; date: string; principalAmount: string; interestRateMonthly: string; remarks?: string }): Promise<LendenTransaction>;
  createLendenPayment(registerId: number, paymentDate: string, amount: number, remarks?: string): Promise<LendenTransaction>;
  deleteLendenTransaction(id: number): Promise<void>;
  recalculateLendenTotals(registerId: number): Promise<void>;
  accrueInterestForRegister(registerId: number): Promise<void>;
  accrueInterestAllLenden(): Promise<void>;
  saveChatImage(userId: string, imageData: string, mimeType: string): Promise<ChatImage>;
  getChatImage(id: number): Promise<ChatImage | undefined>;
  createServiceRequest(data: InsertServiceRequest): Promise<ServiceRequest>;
  getServiceRequestsByUser(userId: string): Promise<ServiceRequest[]>;
  getAllServiceRequests(): Promise<ServiceRequest[]>;
  getServiceRequest(id: number): Promise<ServiceRequest | undefined>;
  updateServiceRequest(id: number, data: Partial<Pick<ServiceRequest, "status" | "adminRemarks" | "isArchived">>): Promise<ServiceRequest | undefined>;
  createMarketplaceListing(data: InsertMarketplaceListing): Promise<MarketplaceListing>;
  getMarketplaceListings(filters?: { category?: string }): Promise<MarketplaceListing[]>;
  getMarketplaceListing(id: number): Promise<MarketplaceListing | undefined>;
  updateMarketplaceListing(id: number, data: Partial<InsertMarketplaceListing>): Promise<MarketplaceListing | undefined>;
  deleteMarketplaceListing(id: number): Promise<void>;
  getAllMarketplaceListingIds(): Promise<number[]>;
  addListingPhotos(listingId: number, photos: { photoData: string; photoMime: string; sortOrder: number }[]): Promise<void>;
  replaceListingPhotos(listingId: number, photos: { photoData: string; photoMime: string; sortOrder: number }[]): Promise<void>;
  getListingPhotos(listingId: number): Promise<MarketplacePhoto[]>;
  getListingPhotoByIndex(listingId: number, index: number): Promise<MarketplacePhoto | undefined>;
  getListingPhotoCount(listingId: number): Promise<number>;
  getListingPhotoIds(listingId: number): Promise<number[]>;
  upsertListingRating(listingId: number, userId: string, stars: number): Promise<MarketplaceRating>;
  getListingRating(listingId: number, userId: string): Promise<MarketplaceRating | undefined>;
  getListingAvgRating(listingId: number): Promise<{ avg: number; count: number }>;
  getSellerAvgRating(sellerId: string): Promise<{ avg: number; count: number }>;
  getActiveBanners(): Promise<Banner[]>;
  getAllBanners(): Promise<Banner[]>;
  createBanner(data: InsertBanner): Promise<Banner>;
  updateBanner(id: number, data: Partial<InsertBanner>): Promise<Banner | undefined>;
  deleteBanner(id: number): Promise<void>;
  getBanner(id: number): Promise<Banner | undefined>;
  getActivePriceCrops(): Promise<PriceCrop[]>;
  getAllPriceCrops(): Promise<PriceCrop[]>;
  getPriceCrop(id: number): Promise<PriceCrop | undefined>;
  createPriceCrop(data: InsertPriceCrop): Promise<PriceCrop>;
  updatePriceCrop(id: number, data: Partial<InsertPriceCrop>): Promise<PriceCrop | undefined>;
  deletePriceCrop(id: number): Promise<void>;
  getPriceEntries(cropId: number, limit?: number): Promise<PriceEntry[]>;
  bulkInsertPriceEntries(entries: InsertPriceEntry[]): Promise<void>;
  clearPriceEntries(cropId: number): Promise<void>;
  upsertPricePoll(cropId: number, userId: string, vote: string): Promise<PricePoll>;
  getPricePollResults(cropId: number): Promise<{ hold: number; sale: number }>;
  getUserPollVote(cropId: number, userId: string): Promise<PricePoll | undefined>;
  recordSiteVisit(visitorId: string, ip?: string): Promise<void>;
  getTotalUniqueVisitors(): Promise<number>;
  getTodayUniqueVisitors(): Promise<number>;
  createBill(data: InsertBill): Promise<Bill>;
  listBuyersForSeller(sellerId: string): Promise<BuyerWithDue[]>;
  getBuyer(sellerId: string, buyerId: number): Promise<Buyer | undefined>;
  findBuyerByNamePhone(sellerId: string, name: string, phone: string): Promise<Buyer | undefined>;
  updateBuyer(sellerId: string, buyerId: number, data: Partial<Pick<Buyer, "name" | "phone" | "address" | "redFlag" | "openingBalance">>): Promise<Buyer | undefined>;
  mergeBuyers(sellerId: string, survivorId: number, deletedId: number): Promise<Buyer | undefined>;
  getBill(sellerId: string, billId: number): Promise<Bill | undefined>;
  listBillsForBuyer(sellerId: string, buyerId: number): Promise<Bill[]>;
  markBillPaid(sellerId: string, billId: number, paidDate: string | null): Promise<Bill | undefined>;
  setBillArchived(sellerId: string, billId: number, archived: boolean): Promise<Bill | undefined>;
  getRecentBuyerGroupsForListing(listingId: number, days?: number): Promise<RecentBuyerGroup[]>;
  getCropStageReference(cropKey: string, stageKey: string): Promise<CropStageReference | undefined>;
  getAllCropStageReferences(): Promise<CropStageReference[]>;
  seedCropStageReferences(): Promise<void>;
  createPlotHealthSearch(data: InsertPlotHealthSearch): Promise<PlotHealthSearch>;
  getPreviousPlotHealthSearch(params: {
    userId: string | null;
    cropType: string;
    latitude: number;
    longitude: number;
    beforeResolvedDate: string;
  }): Promise<PlotHealthSearch | undefined>;
  getSavedFarmsByUser(userId: string): Promise<SavedFarm[]>;
  createSavedFarm(data: InsertSavedFarm & { userId: string }): Promise<SavedFarm>;
  deleteSavedFarm(userId: string, id: number): Promise<boolean>;
}

// Task #128: anonymized "recent buyers" aggregate for the marketplace card
// badge. Buyer identity is never exposed — only village, count, unit-price.
export interface RecentBuyerGroup {
  village: string;     // display village (raw form most frequently entered); "" when unknown
  buyerCount: number;
  unitPrice: number;
}

class DatabaseStorage implements IStorage {
  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async ensureFarmerCode(userId: string): Promise<string> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error("User not found");
    if (user.farmerCode) return user.farmerCode;

    const createdAt = user.createdAt || new Date();
    const dateStr = createdAt.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `FM${dateStr}`;

    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await db.select({ farmerCode: users.farmerCode })
        .from(users)
        .where(like(users.farmerCode, `${prefix}%`));
      const seq = existing.length + 1 + attempt;
      const code = `${prefix}${seq}`;

      try {
        await db.update(users).set({ farmerCode: code }).where(and(eq(users.id, userId), sql`farmer_code IS NULL`));
        const updated = await this.getUserById(userId);
        if (updated?.farmerCode) return updated.farmerCode;
      } catch (e: any) {
        if (e?.code === "23505") continue;
        throw e;
      }
    }
    throw new Error("Failed to generate unique farmer code");
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserAdmin(id: string, data: Partial<Pick<User, "firstName" | "lastName" | "phoneNumber" | "email">>): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUserProfile(id: string, data: Partial<Pick<User, "firstName" | "village" | "tehsil" | "district" | "state" | "postalCode" | "latitude" | "longitude" | "firmName" | "firmAddress" | "firmState" | "firmPincode" | "firmPan" | "firmGst">>): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return updated;
  }

  async resetUserPin(id: string, hashedPin: string): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ pin: hashedPin, mustChangePin: true, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return updated;
  }

  async getCropCardsByUser(userId: string, showArchived?: boolean): Promise<CropCard[]> {
    if (showArchived) {
      return db.select().from(cropCards).where(eq(cropCards.userId, userId)).orderBy(desc(cropCards.createdAt));
    }
    return db.select().from(cropCards).where(and(eq(cropCards.userId, userId), eq(cropCards.isArchived, false))).orderBy(desc(cropCards.createdAt));
  }

  async archiveCropCard(id: number): Promise<CropCard | undefined> {
    const card = await this.getCropCard(id);
    if (!card) return undefined;
    const [updated] = await db.update(cropCards).set({ isArchived: !card.isArchived }).where(eq(cropCards.id, id)).returning();
    return updated;
  }

  async getCropCardsWithEvents(userId: string): Promise<Array<CropCard & { events: CropEvent[] }>> {
    const cards = await this.getCropCardsByUser(userId);
    const result: Array<CropCard & { events: CropEvent[] }> = [];
    for (const card of cards) {
      const events = await this.getCropEvents(card.id);
      result.push({ ...card, events });
    }
    return result;
  }

  async getCropCard(id: number): Promise<CropCard | undefined> {
    const [card] = await db.select().from(cropCards).where(eq(cropCards.id, id));
    return card;
  }

  async createCropCard(card: InsertCropCard): Promise<CropCard> {
    const [created] = await db.insert(cropCards).values(card).returning();
    return created;
  }

  async updateCropCard(id: number, data: Partial<InsertCropCard>): Promise<CropCard | undefined> {
    const [updated] = await db.update(cropCards).set(data).where(eq(cropCards.id, id)).returning();
    return updated;
  }

  async deleteCropCard(id: number): Promise<void> {
    await db.delete(cropEvents).where(eq(cropEvents.cropCardId, id));
    await db.delete(cropCards).where(eq(cropCards.id, id));
  }

  async getCropEvents(cropCardId: number): Promise<CropEvent[]> {
    return db.select().from(cropEvents).where(eq(cropEvents.cropCardId, cropCardId)).orderBy(cropEvents.eventDate);
  }

  async createCropEvent(event: InsertCropEvent): Promise<CropEvent> {
    const [created] = await db.insert(cropEvents).values(event).returning();
    return created;
  }

  async getCropEvent(id: number): Promise<CropEvent | undefined> {
    const [event] = await db.select().from(cropEvents).where(eq(cropEvents.id, id));
    return event;
  }

  async updateCropEvent(id: number, data: Partial<InsertCropEvent>): Promise<CropEvent | undefined> {
    const [updated] = await db.update(cropEvents).set(data).where(eq(cropEvents.id, id)).returning();
    return updated;
  }

  async deleteCropEvent(id: number): Promise<void> {
    await db.delete(cropEvents).where(eq(cropEvents.id, id));
  }

  async toggleCropEventComplete(id: number): Promise<CropEvent | undefined> {
    const [event] = await db.select().from(cropEvents).where(eq(cropEvents.id, id));
    if (!event) return undefined;
    const [updated] = await db.update(cropEvents).set({ isCompleted: !event.isCompleted }).where(eq(cropEvents.id, id)).returning();
    return updated;
  }

  async getSuggestions(userId: string): Promise<string[]> {
    const cards = await db.select().from(cropCards).where(eq(cropCards.userId, userId));
    const cardIds = cards.map(c => c.id);
    if (cardIds.length === 0) return [];
    const events = await db.select().from(cropEvents);
    const descriptions = events
      .filter(e => cardIds.includes(e.cropCardId) && e.description)
      .map(e => e.description as string);
    return [...new Set(descriptions)];
  }

  async getKhataRegisters(userId: string, filters?: { khataType?: string; year?: number; month?: number; showArchived?: boolean }): Promise<KhataRegister[]> {
    const conditions = [eq(khataRegisters.userId, userId)];
    if (filters?.khataType) {
      conditions.push(eq(khataRegisters.khataType, filters.khataType));
    }
    if (!filters?.showArchived) {
      conditions.push(eq(khataRegisters.isArchived, false));
    }
    let results = await db.select().from(khataRegisters).where(and(...conditions)).orderBy(desc(khataRegisters.updatedAt));
    if (filters?.year) {
      results = results.filter(r => {
        const d = r.updatedAt || r.createdAt;
        return d.getFullYear() === filters.year;
      });
    }
    if (filters?.month) {
      results = results.filter(r => {
        const d = r.updatedAt || r.createdAt;
        return d.getMonth() + 1 === filters.month;
      });
    }
    return results;
  }

  async archiveKhataRegister(id: number): Promise<KhataRegister | undefined> {
    const reg = await this.getKhataRegister(id);
    if (!reg) return undefined;
    const [updated] = await db.update(khataRegisters).set({ isArchived: !reg.isArchived, updatedAt: new Date() }).where(eq(khataRegisters.id, id)).returning();
    return updated;
  }

  async getKhataRegister(id: number): Promise<KhataRegister | undefined> {
    const [reg] = await db.select().from(khataRegisters).where(eq(khataRegisters.id, id));
    return reg;
  }

  async createKhataRegister(data: InsertKhataRegister): Promise<KhataRegister> {
    const [created] = await db.insert(khataRegisters).values(data).returning();
    return created;
  }

  async updateKhataRegister(id: number, data: Partial<InsertKhataRegister>): Promise<KhataRegister | undefined> {
    const [updated] = await db.update(khataRegisters).set({ ...data, updatedAt: new Date() }).where(eq(khataRegisters.id, id)).returning();
    return updated;
  }

  async deleteKhataRegister(id: number): Promise<void> {
    await db.delete(khataItems).where(eq(khataItems.khataRegisterId, id));
    await db.delete(khataRegisters).where(eq(khataRegisters.id, id));
  }

  async getKhataItems(registerId: number): Promise<KhataItem[]> {
    return db.select().from(khataItems).where(eq(khataItems.khataRegisterId, registerId)).orderBy(desc(khataItems.date));
  }

  async getKhataItem(id: number): Promise<KhataItem | undefined> {
    const [item] = await db.select().from(khataItems).where(eq(khataItems.id, id));
    return item;
  }

  async createKhataItem(data: InsertKhataItem): Promise<KhataItem> {
    const [created] = await db.insert(khataItems).values(data).returning();
    return created;
  }

  async updateKhataItem(id: number, data: Partial<InsertKhataItem>): Promise<KhataItem | undefined> {
    const [updated] = await db.update(khataItems).set(data).where(eq(khataItems.id, id)).returning();
    return updated;
  }

  async deleteKhataItem(id: number): Promise<void> {
    await db.delete(khataItems).where(eq(khataItems.id, id));
  }

  async recalculateKhataTotals(registerId: number): Promise<void> {
    const items = await this.getKhataItems(registerId);
    const reg = await this.getKhataRegister(registerId);
    let totalDue = 0;
    let totalPaid = 0;
    let totalOwnerExpense = 0;
    let totalBataidarExpense = 0;
    const isBatai = reg?.khataType === "batai";
    const isRental = reg?.khataType === "rental";
    const ownerRatio = reg?.bataiType === "half" ? 0.5 : (reg?.bataiType === "one_third" ? 2/3 : 1);
    const bataidarRatio = 1 - ownerRatio;

    if (isRental) {
      const openingBal = parseFloat(reg?.rentalOpeningBalance || "0") || 0;
      totalDue += openingBal;
      for (const item of items) {
        const charges = parseFloat(item.rentalTotalCharges || "0") || 0;
        if (item.rentalIsPaid) {
          totalPaid += charges;
        } else {
          totalDue += charges;
        }
      }
    } else {
      for (const item of items) {
        const cost = parseFloat(item.totalCost) || 0;
        if (item.isPaid) {
          totalPaid += cost;
        } else {
          totalDue += cost;
        }
        if (isBatai) {
          if (item.expenseBornBy === "owner") {
            totalOwnerExpense += cost;
          } else if (item.expenseBornBy === "bataidar") {
            totalBataidarExpense += cost;
          } else {
            totalOwnerExpense += Math.round(cost * ownerRatio);
            totalBataidarExpense += Math.round(cost * bataidarRatio);
          }
        }
      }
    }
    await db.update(khataRegisters).set({
      totalDue: totalDue.toString(),
      totalPaid: totalPaid.toString(),
      totalOwnerExpense: totalOwnerExpense.toString(),
      totalBataidarExpense: totalBataidarExpense.toString(),
      updatedAt: new Date(),
    }).where(eq(khataRegisters.id, registerId));
  }

  async getPanatPayments(registerId: number): Promise<PanatPayment[]> {
    return db.select().from(panatPayments).where(eq(panatPayments.khataRegisterId, registerId)).orderBy(panatPayments.date);
  }

  async createPanatPayment(data: InsertPanatPayment): Promise<PanatPayment> {
    const [created] = await db.insert(panatPayments).values(data).returning();
    return created;
  }

  async getPanatPayment(id: number): Promise<PanatPayment | undefined> {
    const [payment] = await db.select().from(panatPayments).where(eq(panatPayments.id, id));
    return payment;
  }

  async deletePanatPayment(id: number): Promise<void> {
    await db.delete(panatPayments).where(eq(panatPayments.id, id));
  }

  async getLendenTransactions(registerId: number): Promise<LendenTransaction[]> {
    return db.select().from(lendenTransactions).where(eq(lendenTransactions.khataRegisterId, registerId)).orderBy(asc(lendenTransactions.date), asc(lendenTransactions.id));
  }

  async getLendenTransaction(id: number): Promise<LendenTransaction | undefined> {
    const [txn] = await db.select().from(lendenTransactions).where(eq(lendenTransactions.id, id));
    return txn;
  }

  async createLendenBorrowing(data: { khataRegisterId: number; date: string; principalAmount: string; interestRateMonthly: string; remarks?: string }): Promise<LendenTransaction> {
    const [created] = await db.insert(lendenTransactions).values({
      khataRegisterId: data.khataRegisterId,
      transactionType: "borrowing",
      date: data.date,
      principalAmount: data.principalAmount,
      interestRateMonthly: data.interestRateMonthly,
      remainingPrincipal: data.principalAmount,
      accruedInterest: "0",
      lastAccrualDate: data.date,
      borrowingDate: data.date,
      remarks: data.remarks || null,
    }).returning();
    return created;
  }

  private calculateInterestForBorrowing(borrowing: LendenTransaction, upToDate: Date): { interest: number; shouldCompound: boolean } {
    const remainingP = parseFloat(borrowing.remainingPrincipal || "0") || 0;
    if (remainingP <= 0) return { interest: 0, shouldCompound: false };

    const lastAccrual = new Date(borrowing.lastAccrualDate || borrowing.borrowingDate || borrowing.date);
    const diffMs = upToDate.getTime() - lastAccrual.getTime();
    const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    if (days <= 0) return { interest: 0, shouldCompound: false };

    const monthlyRate = parseFloat(borrowing.interestRateMonthly || "0") || 0;
    const annualRate = monthlyRate * 12 / 100;
    const interestForPeriod = remainingP * annualRate * days / 365;

    const borrowDate = new Date(borrowing.borrowingDate || borrowing.date);
    const totalDays = Math.floor((upToDate.getTime() - borrowDate.getTime()) / (1000 * 60 * 60 * 24));
    const shouldCompound = totalDays >= 365;

    return { interest: Math.round(interestForPeriod * 100) / 100, shouldCompound };
  }

  async createLendenPayment(registerId: number, paymentDate: string, amount: number, remarks?: string): Promise<LendenTransaction> {
    const borrowings = await db.select().from(lendenTransactions)
      .where(and(eq(lendenTransactions.khataRegisterId, registerId), eq(lendenTransactions.transactionType, "borrowing")))
      .orderBy(asc(lendenTransactions.date), asc(lendenTransactions.id));

    let remaining = amount;
    let totalAppliedInterest = 0;
    let totalAppliedPrincipal = 0;
    let targetBorrowingId: number | null = null;
    const payDate = new Date(paymentDate + "T00:00:00Z");

    for (const b of borrowings) {
      const rp = parseFloat(b.remainingPrincipal || "0") || 0;
      if (rp <= 0 && (parseFloat(b.accruedInterest || "0") || 0) <= 0) continue;
      if (remaining <= 0) break;

      const { interest } = this.calculateInterestForBorrowing(b, payDate);
      let currentInterest = (parseFloat(b.accruedInterest || "0") || 0) + interest;
      let currentPrincipal = rp;

      if (!targetBorrowingId) targetBorrowingId = b.id;

      let appliedInterest = 0;
      let appliedPrincipal = 0;

      if (remaining >= currentInterest) {
        appliedInterest = currentInterest;
        remaining -= currentInterest;
        currentInterest = 0;
      } else {
        appliedInterest = remaining;
        currentInterest -= remaining;
        remaining = 0;
      }

      if (remaining > 0 && currentPrincipal > 0) {
        if (remaining >= currentPrincipal) {
          appliedPrincipal = currentPrincipal;
          remaining -= currentPrincipal;
          currentPrincipal = 0;
        } else {
          appliedPrincipal = remaining;
          currentPrincipal -= remaining;
          remaining = 0;
        }
      }

      totalAppliedInterest += appliedInterest;
      totalAppliedPrincipal += appliedPrincipal;

      await db.update(lendenTransactions).set({
        remainingPrincipal: currentPrincipal.toFixed(2),
        accruedInterest: currentInterest.toFixed(2),
        lastAccrualDate: paymentDate,
      }).where(eq(lendenTransactions.id, b.id));
    }

    const [payment] = await db.insert(lendenTransactions).values({
      khataRegisterId: registerId,
      transactionType: "payment",
      date: paymentDate,
      paymentAmount: amount.toString(),
      appliedToInterest: totalAppliedInterest.toFixed(2),
      appliedToPrincipal: totalAppliedPrincipal.toFixed(2),
      targetBorrowingId,
      remarks: remarks || null,
    }).returning();

    return payment;
  }

  async deleteLendenTransaction(id: number): Promise<void> {
    await db.delete(lendenTransactions).where(eq(lendenTransactions.id, id));
  }

  async recalculateLendenTotals(registerId: number): Promise<void> {
    const txns = await this.getLendenTransactions(registerId);
    let totalDue = 0;
    let totalPaid = 0;

    for (const t of txns) {
      if (t.transactionType === "borrowing") {
        const rp = parseFloat(t.remainingPrincipal || "0") || 0;
        const ai = parseFloat(t.accruedInterest || "0") || 0;
        totalDue += rp + ai;
      } else if (t.transactionType === "payment") {
        totalPaid += parseFloat(t.paymentAmount || "0") || 0;
      }
    }

    await db.update(khataRegisters).set({
      totalDue: totalDue.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      updatedAt: new Date(),
    }).where(eq(khataRegisters.id, registerId));
  }

  async accrueInterestForRegister(registerId: number): Promise<void> {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const borrowings = await db.select().from(lendenTransactions)
      .where(and(eq(lendenTransactions.khataRegisterId, registerId), eq(lendenTransactions.transactionType, "borrowing")));

    for (const b of borrowings) {
      let rp = parseFloat(b.remainingPrincipal || "0") || 0;
      if (rp <= 0) continue;

      const { interest, shouldCompound } = this.calculateInterestForBorrowing(b, today);
      let currentInterest = (parseFloat(b.accruedInterest || "0") || 0) + interest;

      if (shouldCompound && currentInterest > 0) {
        rp += currentInterest;
        currentInterest = 0;
        await db.update(lendenTransactions).set({
          remainingPrincipal: rp.toFixed(2),
          accruedInterest: "0",
          lastAccrualDate: todayStr,
          borrowingDate: todayStr,
        }).where(eq(lendenTransactions.id, b.id));
      } else {
        await db.update(lendenTransactions).set({
          accruedInterest: currentInterest.toFixed(2),
          lastAccrualDate: todayStr,
        }).where(eq(lendenTransactions.id, b.id));
      }
    }

    await this.recalculateLendenTotals(registerId);
  }

  async accrueInterestAllLenden(): Promise<void> {
    const registers = await db.select().from(khataRegisters).where(eq(khataRegisters.khataType, "lending_ledger"));
    for (const reg of registers) {
      try {
        await this.accrueInterestForRegister(reg.id);
      } catch (e) {
        console.error(`Failed to accrue interest for register ${reg.id}:`, e);
      }
    }
  }

  async saveChatImage(userId: string, imageData: string, mimeType: string): Promise<ChatImage> {
    const [image] = await db.insert(chatImages).values({ userId, imageData, mimeType }).returning();
    return image;
  }

  async getChatImage(id: number): Promise<ChatImage | undefined> {
    const [image] = await db.select().from(chatImages).where(eq(chatImages.id, id));
    return image;
  }

  async createServiceRequest(data: InsertServiceRequest): Promise<ServiceRequest> {
    const [req] = await db.insert(serviceRequests).values(data).returning();
    return req;
  }

  async getServiceRequestsByUser(userId: string): Promise<ServiceRequest[]> {
    return db.select().from(serviceRequests).where(eq(serviceRequests.userId, userId)).orderBy(desc(serviceRequests.createdAt));
  }

  async getAllServiceRequests(): Promise<ServiceRequest[]> {
    return db.select().from(serviceRequests).orderBy(desc(serviceRequests.createdAt));
  }

  async getServiceRequest(id: number): Promise<ServiceRequest | undefined> {
    const [req] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id));
    return req;
  }

  async updateServiceRequest(id: number, data: Partial<Pick<ServiceRequest, "status" | "adminRemarks" | "isArchived">>): Promise<ServiceRequest | undefined> {
    const [updated] = await db.update(serviceRequests).set({ ...data, updatedAt: new Date() }).where(eq(serviceRequests.id, id)).returning();
    return updated;
  }

  async createBill(data: InsertBill): Promise<Bill> {
    // Atomically resolve / create the buyer and link the bill.
    return db.transaction(async (tx) => {
      const payload = (data.payload ?? {}) as {
        buyerName?: string; buyerPhone?: string; buyerAddress?: string;
      };
      const name = normalizeBuyerName(String(payload.buyerName ?? ""));
      const phone = normalizeBuyerPhone(String(payload.buyerPhone ?? ""));
      const address = String(payload.buyerAddress ?? "").trim();

      // Per-seller advisory lock to serialise buyer-code allocation for this
      // seller. hashtextextended returns bigint, which matches the single-arg
      // pg_advisory_xact_lock(int8) signature exactly. (The 2-arg form takes
      // (int4, int4) and would not accept a bigint without casting.)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${data.sellerId}, 7426112))`);

      // Find existing buyer by (sellerId, lower(name), phone).
      const existing = await tx
        .select()
        .from(buyers)
        .where(
          and(
            eq(buyers.sellerId, data.sellerId),
            sql`lower(${buyers.name}) = lower(${name})`,
            eq(buyers.phone, phone),
          ),
        )
        .limit(1);

      let buyerId: number;
      if (existing[0]) {
        buyerId = existing[0].id;
      } else {
        // Buyer code uses the IST CREATION date (now), not the bill date —
        // bills can be backdated, but the buyer's identity date must reflect
        // when this seller actually first met them.
        const istDateRow = await tx.execute<{ ist_date: string }>(sql`
          SELECT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') AS ist_date
        `);
        const datePart = String(istDateRow.rows[0]?.ist_date ?? "").replace(/-/g, "");
        // Per-seller GLOBAL counter — `{N}` increments across ALL of this
        // seller's buyers regardless of date. Strip the `B` + 8-digit date
        // prefix from each existing buyer_code and take MAX(trailing N) + 1.
        const seqRow = await tx.execute<{ next_n: number }>(sql`
          SELECT COALESCE(MAX(
            CASE WHEN buyer_code ~ '^B[0-9]{8}[0-9]+$'
                 THEN substring(buyer_code from 10)::int
                 ELSE 0 END
          ), 0) + 1 AS next_n
          FROM buyers WHERE seller_id = ${data.sellerId}
        `);
        const nextN = Number(seqRow.rows[0]?.next_n ?? 1);
        const code = `B${datePart}${nextN}`;
        const [created] = await tx.insert(buyers).values({
          sellerId: data.sellerId,
          buyerCode: code,
          name,
          phone,
          address,
        }).returning();
        buyerId = created.id;
      }

      const paidAt = data.paymentType === "cash" ? data.billDate : null;
      const [createdBill] = await tx.insert(bills).values({
        ...data,
        buyerId,
        paidAt,
      }).returning();
      return createdBill;
    });
  }

  async listBuyersForSeller(sellerId: string): Promise<BuyerWithDue[]> {
    const rows = await db.execute<{
      id: number; seller_id: string; buyer_code: string; name: string; phone: string; address: string;
      red_flag: boolean; opening_balance: string; merged_from_codes: string[]; created_at: Date;
      total_due: string; total_paid: string;
    }>(sql`
      SELECT b.*,
        (b.opening_balance + COALESCE(SUM(
          CASE WHEN bl.payment_type = 'credit' AND bl.paid_at IS NULL
            THEN bill_total(bl.payload)
            ELSE 0 END
        ), 0))::text AS total_due,
        COALESCE(SUM(
          CASE WHEN bl.paid_at IS NOT NULL
            THEN bill_total(bl.payload)
            ELSE 0 END
        ), 0)::text AS total_paid
      FROM buyers b
      LEFT JOIN bills bl ON bl.buyer_id = b.id AND bl.archived = false
      WHERE b.seller_id = ${sellerId}
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `);
    return rows.rows.map((r) => ({
      id: r.id,
      sellerId: r.seller_id,
      buyerCode: r.buyer_code,
      name: r.name,
      phone: r.phone,
      address: r.address,
      redFlag: r.red_flag,
      openingBalance: r.opening_balance,
      mergedFromCodes: r.merged_from_codes ?? [],
      createdAt: r.created_at,
      totalDue: r.total_due,
      totalPaid: r.total_paid,
    }));
  }

  async getBuyer(sellerId: string, buyerId: number): Promise<Buyer | undefined> {
    const [row] = await db.select().from(buyers).where(and(eq(buyers.sellerId, sellerId), eq(buyers.id, buyerId)));
    return row;
  }

  async findBuyerByNamePhone(sellerId: string, name: string, phone: string): Promise<Buyer | undefined> {
    const n = normalizeBuyerName(name);
    const p = normalizeBuyerPhone(phone);
    const [row] = await db
      .select()
      .from(buyers)
      .where(
        and(
          eq(buyers.sellerId, sellerId),
          sql`lower(${buyers.name}) = lower(${n})`,
          eq(buyers.phone, p),
        ),
      )
      .limit(1);
    return row;
  }

  async updateBuyer(
    sellerId: string,
    buyerId: number,
    data: Partial<Pick<Buyer, "name" | "phone" | "address" | "redFlag" | "openingBalance">>,
  ): Promise<Buyer | undefined> {
    const patch: Partial<Pick<Buyer, "name" | "phone" | "address" | "redFlag" | "openingBalance">> = { ...data };
    if (patch.name != null) patch.name = normalizeBuyerName(patch.name);
    if (patch.phone != null) patch.phone = normalizeBuyerPhone(patch.phone);
    const [row] = await db
      .update(buyers)
      .set(patch)
      .where(and(eq(buyers.sellerId, sellerId), eq(buyers.id, buyerId)))
      .returning();
    return row;
  }

  async mergeBuyers(sellerId: string, survivorId: number, deletedId: number): Promise<Buyer | undefined> {
    if (survivorId === deletedId) {
      return this.getBuyer(sellerId, survivorId);
    }
    return db.transaction(async (tx) => {
      const [survivor] = await tx.select().from(buyers).where(and(eq(buyers.sellerId, sellerId), eq(buyers.id, survivorId)));
      const [deleted] = await tx.select().from(buyers).where(and(eq(buyers.sellerId, sellerId), eq(buyers.id, deletedId)));
      if (!survivor || !deleted) {
        throw new Error("Buyer not found for merge");
      }
      // Re-point bills to survivor.
      await tx.update(bills).set({ buyerId: survivorId }).where(and(eq(bills.sellerId, sellerId), eq(bills.buyerId, deletedId)));
      // Delete the loser FIRST so the unique index is freed before we possibly
      // touch the survivor's name/phone in the future.
      await tx.delete(buyers).where(and(eq(buyers.sellerId, sellerId), eq(buyers.id, deletedId)));
      // Sum opening balances, OR red flags, append merged-from codes.
      const newOpening = (Number(survivor.openingBalance) + Number(deleted.openingBalance)).toFixed(2);
      const newCodes = [...(survivor.mergedFromCodes ?? []), deleted.buyerCode, ...(deleted.mergedFromCodes ?? [])];
      const [updated] = await tx
        .update(buyers)
        .set({
          openingBalance: newOpening,
          redFlag: survivor.redFlag || deleted.redFlag,
          mergedFromCodes: newCodes,
        })
        .where(and(eq(buyers.sellerId, sellerId), eq(buyers.id, survivorId)))
        .returning();
      return updated;
    });
  }

  async getBill(sellerId: string, billId: number): Promise<Bill | undefined> {
    const [row] = await db.select().from(bills)
      .where(and(eq(bills.sellerId, sellerId), eq(bills.id, billId)))
      .limit(1);
    return row;
  }

  async listBillsForBuyer(sellerId: string, buyerId: number): Promise<Bill[]> {
    return db.select().from(bills)
      .where(and(eq(bills.sellerId, sellerId), eq(bills.buyerId, buyerId)))
      .orderBy(desc(bills.billDate), desc(bills.id));
  }

  async markBillPaid(sellerId: string, billId: number, paidDate: string | null): Promise<Bill | undefined> {
    const [row] = await db
      .update(bills)
      .set({ paidAt: paidDate })
      .where(and(eq(bills.sellerId, sellerId), eq(bills.id, billId)))
      .returning();
    return row;
  }

  async setBillArchived(sellerId: string, billId: number, archived: boolean): Promise<Bill | undefined> {
    const [row] = await db
      .update(bills)
      .set({ archived })
      .where(and(eq(bills.sellerId, sellerId), eq(bills.id, billId)))
      .returning();
    return row;
  }

  // Task #128: anonymized recent-buyer groups for a listing.
  // Window: last `days` days of non-archived bills linked to this listing.
  // Groups by (normalizedVillage, roundedUnitPrice). Returns no buyer identity.
  async getRecentBuyerGroupsForListing(listingId: number, days: number = 30): Promise<RecentBuyerGroup[]> {
    if (!Number.isInteger(listingId) || listingId <= 0) return [];
    const rows = await db
      .select({
        buyerId: bills.buyerId,
        payload: bills.payload,
      })
      .from(bills)
      .where(and(
        eq(bills.listingId, listingId),
        eq(bills.archived, false),
        sql`${bills.billDate} >= (current_date - (${days}::int * interval '1 day'))`,
      ));

    type GroupAcc = {
      village: string;             // sanitized village display (truncated, no PII tokens)
      displayCounts: Map<string, number>;
      unitPrice: number;
      buyerKeys: Set<string>;      // distinct buyer identity tokens
    };
    const groups = new Map<string, GroupAcc>();

    // Task #128: extract a privacy-safe "village" token from the freehand
    // buyer address. Buyers may type their full address ("Plot 12,
    // Krishna Nagar, near 9876543210, Ujjain") so we (a) take only the
    // first comma-separated segment, (b) drop any segment that looks
    // like a phone number / house number, (c) strip stray digits from
    // the chosen token, and (d) cap to 40 chars. Result is never the
    // raw buyer-typed string.
    const extractVillage = (raw: string): { display: string; norm: string } => {
      const cleaned = String(raw ?? "").replace(/\s+/g, " ").trim();
      if (!cleaned) return { display: "", norm: "" };
      const segments = cleaned.split(",").map(s => s.trim()).filter(Boolean);
      let pick = "";
      // Pick the FIRST non-numeric comma-segment. Sellers in this app
      // type the village name first, then larger area / district —
      // e.g. "Kachnariya, Makdone, Ujjain" → "Kachnariya".
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const digits = (seg.match(/\d/g) ?? []).length;
        if (digits >= 4) continue;            // looks like a phone / pincode
        if (/^\d+$/.test(seg)) continue;      // pure number (house no.)
        pick = seg;
        break;
      }
      if (!pick) pick = segments[0] ?? cleaned;
      pick = pick.replace(/\d+/g, "").replace(/\s+/g, " ").trim();
      if (pick.length > 40) pick = pick.slice(0, 40).trim();
      return { display: pick, norm: pick.toLowerCase() };
    };

    for (const row of rows) {
      const payload = (row.payload ?? {}) as {
        product?: { unitPrice?: string; discount?: string; qty?: string };
        buyerAddress?: string;
        buyerName?: string;
        buyerPhone?: string;
      };
      // The bill stores `unitPrice` = MRP and `discount` = (MRP - KrashuVed
      // price), so the price the buyer actually paid is the NET of the two.
      // Surface that net KrashuVed price in the "recent buyers" badge, not
      // the struck-through MRP.
      const unitPriceRaw = Number(String(payload.product?.unitPrice ?? "").trim());
      if (!Number.isFinite(unitPriceRaw) || unitPriceRaw <= 0) continue;
      const discountRaw = Number(String(payload.product?.discount ?? "").trim());
      const discount = Number.isFinite(discountRaw) && discountRaw > 0 ? discountRaw : 0;
      const netPrice = unitPriceRaw - discount;
      if (!Number.isFinite(netPrice) || netPrice <= 0) continue;
      const unitPrice = Math.round(netPrice * 100) / 100;
      if (unitPrice <= 0) continue;
      const { display: villageDisplay, norm: villageNorm } = extractVillage(String(payload.buyerAddress ?? ""));
      const key = `${villageNorm}|${unitPrice}`;
      let g = groups.get(key);
      if (!g) {
        g = { village: villageDisplay, displayCounts: new Map(), unitPrice, buyerKeys: new Set() };
        groups.set(key, g);
      }
      if (villageDisplay) {
        g.displayCounts.set(villageDisplay, (g.displayCounts.get(villageDisplay) ?? 0) + 1);
      }
      const buyerKey = row.buyerId != null
        ? `id:${row.buyerId}`
        : `np:${normalizeBuyerName(String(payload.buyerName ?? ""))}|${normalizeBuyerPhone(String(payload.buyerPhone ?? ""))}`;
      g.buyerKeys.add(buyerKey);
    }

    const result: RecentBuyerGroup[] = [];
    for (const g of groups.values()) {
      let display = "";
      let best = 0;
      for (const [d, c] of g.displayCounts) {
        if (c > best) { best = c; display = d; }
      }
      result.push({
        village: display,
        buyerCount: g.buyerKeys.size,
        unitPrice: g.unitPrice,
      });
    }
    // Most buyers first, then highest unit-price as a tiebreak.
    result.sort((a, b) => (b.buyerCount - a.buyerCount) || (b.unitPrice - a.unitPrice));
    return result;
  }

  async createMarketplaceListing(data: InsertMarketplaceListing): Promise<MarketplaceListing> {
    // Task #81: allocate the per-IST-day stockId (`YYYYMMDD-N`) atomically
    // in the same transaction as the listing insert.
    return db.transaction(async (tx) => {
      const result = await tx.execute<{ ist_day: string; last_n: number }>(sql`
        INSERT INTO marketplace_stock_counters (ist_day, last_n)
        VALUES (to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD'), 1)
        ON CONFLICT (ist_day) DO UPDATE SET last_n = marketplace_stock_counters.last_n + 1
        RETURNING ist_day, last_n
      `);
      const counterRow = result.rows[0];
      if (!counterRow) {
        throw new Error("Failed to allocate marketplace stockId");
      }
      const stockId = `${counterRow.ist_day}-${counterRow.last_n}`;
      const [created] = await tx.insert(marketplaceListings).values({ ...data, stockId }).returning();
      return created;
    });
  }

  async getMarketplaceListings(filters?: { category?: string }): Promise<MarketplaceListing[]> {
    const conditions = [eq(marketplaceListings.isActive, true)];
    if (filters?.category) {
      conditions.push(eq(marketplaceListings.category, filters.category));
    }
    return db.select().from(marketplaceListings).where(and(...conditions)).orderBy(desc(marketplaceListings.createdAt));
  }

  async getMarketplaceListing(id: number): Promise<MarketplaceListing | undefined> {
    const [listing] = await db.select().from(marketplaceListings).where(eq(marketplaceListings.id, id));
    return listing;
  }

  async updateMarketplaceListing(id: number, data: Partial<InsertMarketplaceListing>): Promise<MarketplaceListing | undefined> {
    // Task #81: stockId is immutable after creation — strip it from updates.
    const { stockId: _ignored, ...rest } = data as Partial<InsertMarketplaceListing> & { stockId?: unknown };
    const [updated] = await db.update(marketplaceListings).set(rest).where(eq(marketplaceListings.id, id)).returning();
    return updated;
  }

  async deleteMarketplaceListing(id: number): Promise<void> {
    await db.delete(marketplacePhotos).where(eq(marketplacePhotos.listingId, id));
    await db.delete(marketplaceListings).where(eq(marketplaceListings.id, id));
  }

  async getAllMarketplaceListingIds(): Promise<number[]> {
    const rows = await db.select({ id: marketplaceListings.id }).from(marketplaceListings);
    return rows.map(r => r.id);
  }

  async addListingPhotos(listingId: number, photos: { photoData: string; photoMime: string; sortOrder: number }[]): Promise<void> {
    if (photos.length === 0) return;
    await db.insert(marketplacePhotos).values(photos.map(p => ({ ...p, listingId })));
  }

  async replaceListingPhotos(listingId: number, photos: { photoData: string; photoMime: string; sortOrder: number }[]): Promise<void> {
    await db.delete(marketplacePhotos).where(eq(marketplacePhotos.listingId, listingId));
    if (photos.length === 0) return;
    await db.insert(marketplacePhotos).values(photos.map(p => ({ ...p, listingId })));
  }

  async getListingPhotos(listingId: number): Promise<MarketplacePhoto[]> {
    return db.select().from(marketplacePhotos).where(eq(marketplacePhotos.listingId, listingId)).orderBy(asc(marketplacePhotos.sortOrder));
  }

  async getListingPhotoByIndex(listingId: number, index: number): Promise<MarketplacePhoto | undefined> {
    const [photo] = await db.select().from(marketplacePhotos).where(and(eq(marketplacePhotos.listingId, listingId), eq(marketplacePhotos.sortOrder, index)));
    return photo;
  }

  async getListingPhotoCount(listingId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(marketplacePhotos).where(eq(marketplacePhotos.listingId, listingId));
    return result[0]?.count ?? 0;
  }

  async getListingPhotoIds(listingId: number): Promise<number[]> {
    // Lightweight ID-only fetch (avoids loading the huge base64 photoData
    // blobs that getListingPhotos returns). Used by the marketplace
    // endpoints to compute each listing's `shareVersion` token without
    // blowing up the response payload.
    const rows = await db
      .select({ id: marketplacePhotos.id })
      .from(marketplacePhotos)
      .where(eq(marketplacePhotos.listingId, listingId))
      .orderBy(asc(marketplacePhotos.sortOrder));
    return rows.map((r) => r.id);
  }

  async upsertListingRating(listingId: number, userId: string, stars: number): Promise<MarketplaceRating> {
    const result = await db.execute(sql`
      INSERT INTO marketplace_ratings (listing_id, user_id, stars, created_at)
      VALUES (${listingId}, ${userId}, ${stars}, CURRENT_TIMESTAMP)
      ON CONFLICT (listing_id, user_id) DO UPDATE SET stars = ${stars}
      RETURNING *
    `);
    const row = (result as any).rows?.[0] || (result as any)[0];
    return {
      id: row.id,
      listingId: row.listing_id,
      userId: row.user_id,
      stars: row.stars,
      createdAt: row.created_at,
    };
  }

  async getListingRating(listingId: number, userId: string): Promise<MarketplaceRating | undefined> {
    const [rating] = await db.select().from(marketplaceRatings).where(and(eq(marketplaceRatings.listingId, listingId), eq(marketplaceRatings.userId, userId)));
    return rating;
  }

  async getListingAvgRating(listingId: number): Promise<{ avg: number; count: number }> {
    const result = await db.select({
      avg: sql<number>`COALESCE(AVG(stars), 0)::float`,
      count: sql<number>`count(*)::int`,
    }).from(marketplaceRatings).where(eq(marketplaceRatings.listingId, listingId));
    const row = result[0];
    if (!row || row.count === 0) return { avg: 0, count: 0 };
    return { avg: Math.round(row.avg * 10) / 10, count: row.count };
  }

  async getSellerAvgRating(sellerId: string): Promise<{ avg: number; count: number }> {
    const result = await db.select({
      avg: sql<number>`COALESCE(AVG(${marketplaceRatings.stars}), 0)::float`,
      count: sql<number>`count(${marketplaceRatings.id})::int`,
    }).from(marketplaceRatings)
      .innerJoin(marketplaceListings, eq(marketplaceRatings.listingId, marketplaceListings.id))
      .where(eq(marketplaceListings.sellerId, sellerId));
    const row = result[0];
    if (!row || row.count === 0) return { avg: 0, count: 0 };
    return { avg: Math.round(row.avg * 10) / 10, count: row.count };
  }
  async getActiveBanners(): Promise<Banner[]> {
    return db.select().from(banners).where(eq(banners.isActive, true)).orderBy(asc(banners.sortOrder));
  }

  async getAllBanners(): Promise<Banner[]> {
    return db.select().from(banners).orderBy(asc(banners.sortOrder));
  }

  async createBanner(data: InsertBanner): Promise<Banner> {
    const [banner] = await db.insert(banners).values(data).returning();
    return banner;
  }

  async updateBanner(id: number, data: Partial<InsertBanner>): Promise<Banner | undefined> {
    const [banner] = await db.update(banners).set(data).where(eq(banners.id, id)).returning();
    return banner;
  }

  async deleteBanner(id: number): Promise<void> {
    await db.delete(banners).where(eq(banners.id, id));
  }

  async getBanner(id: number): Promise<Banner | undefined> {
    const [banner] = await db.select().from(banners).where(eq(banners.id, id));
    return banner;
  }

  async getActivePriceCrops(): Promise<PriceCrop[]> {
    return db.select().from(priceCrops).where(eq(priceCrops.isActive, true)).orderBy(asc(priceCrops.nameEn));
  }

  async getAllPriceCrops(): Promise<PriceCrop[]> {
    return db.select().from(priceCrops).orderBy(asc(priceCrops.nameEn));
  }

  async getPriceCrop(id: number): Promise<PriceCrop | undefined> {
    const [crop] = await db.select().from(priceCrops).where(eq(priceCrops.id, id));
    return crop;
  }

  async createPriceCrop(data: InsertPriceCrop): Promise<PriceCrop> {
    const [crop] = await db.insert(priceCrops).values(data).returning();
    return crop;
  }

  async updatePriceCrop(id: number, data: Partial<InsertPriceCrop>): Promise<PriceCrop | undefined> {
    const [crop] = await db.update(priceCrops).set(data).where(eq(priceCrops.id, id)).returning();
    return crop;
  }

  async deletePriceCrop(id: number): Promise<void> {
    await db.delete(priceCrops).where(eq(priceCrops.id, id));
  }

  async getCropStageReference(cropKey: string, stageKey: string): Promise<CropStageReference | undefined> {
    const [row] = await db
      .select()
      .from(cropStageReferences)
      .where(and(eq(cropStageReferences.cropKey, cropKey), eq(cropStageReferences.stageKey, stageKey)));
    return row;
  }

  async getAllCropStageReferences(): Promise<CropStageReference[]> {
    return db.select().from(cropStageReferences).orderBy(asc(cropStageReferences.cropKey), asc(cropStageReferences.stageKey));
  }

  // Task #143: idempotently seed the per-crop, per-stage healthy index ranges
  // so the Plot Health verdict works out of the box in dev and prod. Rows are
  // generated from a compact (crop → stage → phenological phase) mapping plus a
  // per-phase band table, then inserted with onConflictDoNothing so any later
  // admin/manual tuning of a row is preserved across restarts.
  async seedCropStageReferences(): Promise<void> {
    const rows = buildCropStageReferenceSeed();
    if (rows.length === 0) return;
    await db.insert(cropStageReferences).values(rows).onConflictDoNothing();
  }

  async createPlotHealthSearch(data: InsertPlotHealthSearch): Promise<PlotHealthSearch> {
    const [row] = await db.insert(plotHealthSearches).values(data).returning();
    return row;
  }

  // Task #146: most recent earlier reading for the SAME plot + crop, used to
  // detect a >threshold drop in any index. "Same plot" = within ~50 m (coords
  // rarely repeat to 5 decimals across taps). Only successful readings (clear
  // image, non-null NDVI mean) with a strictly-earlier resolved date qualify.
  async getPreviousPlotHealthSearch(params: {
    userId: string | null;
    cropType: string;
    latitude: number;
    longitude: number;
    beforeResolvedDate: string;
  }): Promise<PlotHealthSearch | undefined> {
    const { userId, cropType, latitude, longitude, beforeResolvedDate } = params;
    // ~5.5 m at Indian latitudes — tight enough that an adjacent field never
    // matches, matching the 5-decimal precision of the stats cache key. A
    // larger window risks comparing against a neighbouring plot.
    const COORD_TOL = 0.00005;
    const conditions = [
      userId ? eq(plotHealthSearches.userId, userId) : isNull(plotHealthSearches.userId),
      eq(plotHealthSearches.cropType, cropType),
      eq(plotHealthSearches.noClearImage, false),
      isNotNull(plotHealthSearches.ndviMean),
      isNotNull(plotHealthSearches.resolvedDate),
      lt(plotHealthSearches.resolvedDate, beforeResolvedDate),
      sql`abs(${plotHealthSearches.latitude} - ${latitude}) <= ${COORD_TOL}`,
      sql`abs(${plotHealthSearches.longitude} - ${longitude}) <= ${COORD_TOL}`,
    ];
    const [row] = await db
      .select()
      .from(plotHealthSearches)
      .where(and(...conditions))
      .orderBy(desc(plotHealthSearches.resolvedDate), desc(plotHealthSearches.createdAt))
      .limit(1);
    return row;
  }

  async getSavedFarmsByUser(userId: string): Promise<SavedFarm[]> {
    return db.select().from(savedFarms).where(eq(savedFarms.userId, userId)).orderBy(desc(savedFarms.createdAt));
  }

  async createSavedFarm(data: InsertSavedFarm & { userId: string }): Promise<SavedFarm> {
    const [row] = await db.insert(savedFarms).values(data).returning();
    return row;
  }

  async deleteSavedFarm(userId: string, id: number): Promise<boolean> {
    const result = await db.delete(savedFarms).where(and(eq(savedFarms.id, id), eq(savedFarms.userId, userId))).returning();
    return result.length > 0;
  }

  async getPriceEntries(cropId: number, limit?: number): Promise<PriceEntry[]> {
    const distinctDates = await db.selectDistinct({ date: priceEntries.date })
      .from(priceEntries)
      .where(eq(priceEntries.cropId, cropId))
      .orderBy(desc(priceEntries.date))
      .limit(limit || 5);
    
    if (distinctDates.length === 0) return [];
    
    const dates = distinctDates.map(d => d.date);
    const results = await db.select().from(priceEntries)
      .where(and(
        eq(priceEntries.cropId, cropId),
        sql`${priceEntries.date} IN (${sql.join(dates.map(d => sql`${d}`), sql`, `)})`
      ))
      .orderBy(desc(priceEntries.date), asc(priceEntries.market));
    
    return results;
  }

  async bulkInsertPriceEntries(entries: InsertPriceEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      await db.insert(priceEntries).values(batch);
    }
  }

  async clearPriceEntries(cropId: number): Promise<void> {
    await db.delete(priceEntries).where(eq(priceEntries.cropId, cropId));
  }

  async upsertPricePoll(cropId: number, userId: string, vote: string): Promise<PricePoll> {
    const result = await db.execute(sql`
      INSERT INTO price_polls (crop_id, user_id, vote) VALUES (${cropId}, ${userId}, ${vote})
      ON CONFLICT (crop_id, user_id) DO UPDATE SET vote = ${vote}, created_at = CURRENT_TIMESTAMP
      RETURNING *
    `);
    return result.rows[0] as any as PricePoll;
  }

  async getPricePollResults(cropId: number): Promise<{ hold: number; sale: number }> {
    const results = await db.execute(sql`
      SELECT vote, COUNT(*)::int as count FROM price_polls WHERE crop_id = ${cropId} GROUP BY vote
    `);
    let hold = 0, sale = 0;
    for (const row of results.rows as any[]) {
      if (row.vote === "hold") hold = row.count;
      if (row.vote === "sale") sale = row.count;
    }
    return { hold, sale };
  }

  async getUserPollVote(cropId: number, userId: string): Promise<PricePoll | undefined> {
    const [poll] = await db.select().from(pricePolls)
      .where(and(eq(pricePolls.cropId, cropId), eq(pricePolls.userId, userId)));
    return poll;
  }

  async recordSiteVisit(visitorId: string, ip?: string): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const existing = await db.execute(sql`
      SELECT id FROM site_visits WHERE visitor_id = ${visitorId} AND created_at::date = ${today}::date LIMIT 1
    `);
    if (existing.rows.length === 0) {
      await db.insert(siteVisits).values({ visitorId, ip: ip || null });
    }
  }

  async getTotalUniqueVisitors(): Promise<number> {
    const result = await db.execute(sql`SELECT COUNT(DISTINCT visitor_id)::int as count FROM site_visits`);
    return (result.rows[0] as any)?.count || 0;
  }

  async getTodayUniqueVisitors(): Promise<number> {
    const today = new Date().toISOString().split("T")[0];
    const result = await db.execute(sql`SELECT COUNT(DISTINCT visitor_id)::int as count FROM site_visits WHERE created_at::date = ${today}::date`);
    return (result.rows[0] as any)?.count || 0;
  }

  async insertWeatherLog(log: InsertWeatherLog): Promise<void> {
    await db.insert(weatherLogs).values(log).onConflictDoNothing();
  }

  async getDistinctUserLocations(): Promise<Array<{ latitude: string; longitude: string; label: string }>> {
    const result = await db.execute(sql`
      SELECT DISTINCT
        ROUND(latitude::numeric, 2)::text as latitude,
        ROUND(longitude::numeric, 2)::text as longitude,
        COALESCE(district, village, 'Unknown') as label
      FROM users
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        AND latitude != '' AND longitude != ''
    `);
    return result.rows as any[];
  }

  async fetchAndLogWeather(): Promise<number> {
    const userLocations = await this.getDistinctUserLocations();
    const defaultLocations = [
      { latitude: "28.61", longitude: "77.21", label: "Delhi" },
      { latitude: "26.85", longitude: "80.91", label: "Lucknow" },
      { latitude: "27.18", longitude: "78.02", label: "Agra" },
      { latitude: "26.45", longitude: "80.33", label: "Kanpur" },
      { latitude: "25.32", longitude: "82.99", label: "Varanasi" },
      { latitude: "23.26", longitude: "77.41", label: "Bhopal" },
      { latitude: "22.72", longitude: "75.86", label: "Indore" },
      { latitude: "21.15", longitude: "79.09", label: "Nagpur" },
      { latitude: "19.08", longitude: "72.88", label: "Mumbai" },
      { latitude: "18.52", longitude: "73.86", label: "Pune" },
      { latitude: "12.97", longitude: "77.59", label: "Bangalore" },
      { latitude: "17.39", longitude: "78.49", label: "Hyderabad" },
      { latitude: "21.17", longitude: "72.83", label: "Surat" },
      { latitude: "25.61", longitude: "85.14", label: "Patna" },
      { latitude: "30.73", longitude: "76.78", label: "Chandigarh" },
      { latitude: "26.92", longitude: "75.79", label: "Jaipur" },
    ];
    const seen = new Set(userLocations.map(l => `${l.latitude},${l.longitude}`));
    const locations = [...userLocations];
    for (const dl of defaultLocations) {
      if (!seen.has(`${dl.latitude},${dl.longitude}`)) {
        locations.push(dl);
        seen.add(`${dl.latitude},${dl.longitude}`);
      }
    }
    if (locations.length === 0) return 0;

    let logged = 0;
    for (const loc of locations) {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}`
          + `&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,apparent_temperature_max,apparent_temperature_min`
          + `,precipitation_sum,rain_sum,weather_code,wind_speed_10m_max,wind_gusts_10m_max`
          + `,et0_fao_evapotranspiration,uv_index_max,sunrise,sunset,daylight_duration`
          + `&hourly=relative_humidity_2m,dew_point_2m,pressure_msl,soil_temperature_0_to_7cm,soil_temperature_7_to_28cm`
          + `,soil_temperature_28_to_100cm,soil_moisture_0_to_7cm,soil_moisture_7_to_28cm,soil_moisture_28_to_100cm`
          + `&timezone=Asia%2FKolkata&past_days=1&forecast_days=1`;

        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();

        const yesterdayIdx = 0;
        const d = json.daily;
        const dateStr = d.time[yesterdayIdx];

        const hourlyStart = yesterdayIdx * 24;
        const hourlyEnd = hourlyStart + 24;
        const h = json.hourly;

        const avg = (arr: number[], start: number, end: number) => {
          const slice = arr.slice(start, end).filter((v: any) => v != null);
          if (slice.length === 0) return null;
          return Math.round((slice.reduce((a: number, b: number) => a + b, 0) / slice.length) * 100) / 100;
        };

        await this.insertWeatherLog({
          date: dateStr,
          latitude: loc.latitude,
          longitude: loc.longitude,
          locationLabel: loc.label,
          tempMax: d.temperature_2m_max?.[yesterdayIdx]?.toString() ?? null,
          tempMin: d.temperature_2m_min?.[yesterdayIdx]?.toString() ?? null,
          tempMean: d.temperature_2m_mean?.[yesterdayIdx]?.toString() ?? null,
          apparentTempMax: d.apparent_temperature_max?.[yesterdayIdx]?.toString() ?? null,
          apparentTempMin: d.apparent_temperature_min?.[yesterdayIdx]?.toString() ?? null,
          precipitationSum: d.precipitation_sum?.[yesterdayIdx]?.toString() ?? null,
          rainSum: d.rain_sum?.[yesterdayIdx]?.toString() ?? null,
          weatherCode: d.weather_code?.[yesterdayIdx] ?? null,
          windSpeedMax: d.wind_speed_10m_max?.[yesterdayIdx]?.toString() ?? null,
          windGustsMax: d.wind_gusts_10m_max?.[yesterdayIdx]?.toString() ?? null,
          humidityMean: avg(h.relative_humidity_2m, hourlyStart, hourlyEnd)?.toString() ?? null,
          dewPointMean: avg(h.dew_point_2m, hourlyStart, hourlyEnd)?.toString() ?? null,
          pressureMean: avg(h.pressure_msl, hourlyStart, hourlyEnd)?.toString() ?? null,
          soilTemp0to7: avg(h.soil_temperature_0_to_7cm, hourlyStart, hourlyEnd)?.toString() ?? null,
          soilTemp7to28: avg(h.soil_temperature_7_to_28cm, hourlyStart, hourlyEnd)?.toString() ?? null,
          soilTemp28to100: avg(h.soil_temperature_28_to_100cm, hourlyStart, hourlyEnd)?.toString() ?? null,
          soilMoisture0to7: avg(h.soil_moisture_0_to_7cm, hourlyStart, hourlyEnd)?.toString() ?? null,
          soilMoisture7to28: avg(h.soil_moisture_7_to_28cm, hourlyStart, hourlyEnd)?.toString() ?? null,
          soilMoisture28to100: avg(h.soil_moisture_28_to_100cm, hourlyStart, hourlyEnd)?.toString() ?? null,
          et0Evapotranspiration: d.et0_fao_evapotranspiration?.[yesterdayIdx]?.toString() ?? null,
          uvIndexMax: d.uv_index_max?.[yesterdayIdx]?.toString() ?? null,
          sunrise: d.sunrise?.[yesterdayIdx] ?? null,
          sunset: d.sunset?.[yesterdayIdx] ?? null,
          daylightDuration: d.daylight_duration?.[yesterdayIdx]?.toString() ?? null,
        });
        logged++;
      } catch (err) {
        console.error(`Weather log failed for ${loc.label} (${loc.latitude},${loc.longitude}):`, err);
      }
    }
    return logged;
  }
}

export const storage = new DatabaseStorage();
