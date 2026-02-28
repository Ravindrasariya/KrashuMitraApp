import { db } from "./db";
import { users, type User, cropCards, cropEvents, type CropCard, type InsertCropCard, type CropEvent, type InsertCropEvent } from "@shared/schema";
import { eq, desc, and, like, sql } from "drizzle-orm";

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  ensureFarmerCode(userId: string): Promise<string>;
  getCropCardsByUser(userId: string): Promise<CropCard[]>;
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

  async getCropCardsByUser(userId: string): Promise<CropCard[]> {
    return db.select().from(cropCards).where(eq(cropCards.userId, userId)).orderBy(desc(cropCards.createdAt));
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
}

export const storage = new DatabaseStorage();
