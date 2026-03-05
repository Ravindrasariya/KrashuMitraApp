import { db } from "./db";
import { users, type User, cropCards, cropEvents, type CropCard, type InsertCropCard, type CropEvent, type InsertCropEvent, khataRegisters, khataItems, type KhataRegister, type InsertKhataRegister, type KhataItem, type InsertKhataItem, panatPayments, type PanatPayment, type InsertPanatPayment, lendenTransactions, type LendenTransaction, type InsertLendenTransaction, chatImages, type ChatImage, serviceRequests, type ServiceRequest, type InsertServiceRequest, marketplaceListings, type MarketplaceListing, type InsertMarketplaceListing } from "@shared/schema";
import { eq, desc, and, like, sql, ilike, asc } from "drizzle-orm";

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  ensureFarmerCode(userId: string): Promise<string>;
  getAllUsers(): Promise<User[]>;
  updateUserAdmin(id: string, data: Partial<Pick<User, "firstName" | "lastName" | "phoneNumber" | "email">>): Promise<User | undefined>;
  updateUserProfile(id: string, data: Partial<Pick<User, "firstName" | "village" | "tehsil" | "district" | "state" | "postalCode" | "latitude" | "longitude">>): Promise<User | undefined>;
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
  deleteMarketplaceListing(id: number): Promise<void>;
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

  async updateUserProfile(id: string, data: Partial<Pick<User, "firstName" | "village" | "tehsil" | "district" | "state" | "postalCode" | "latitude" | "longitude">>): Promise<User | undefined> {
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

  async createMarketplaceListing(data: InsertMarketplaceListing): Promise<MarketplaceListing> {
    const [created] = await db.insert(marketplaceListings).values(data).returning();
    return created;
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

  async deleteMarketplaceListing(id: number): Promise<void> {
    await db.delete(marketplaceListings).where(eq(marketplaceListings.id, id));
  }
}

export const storage = new DatabaseStorage();
