import { db } from "./db";
import { cropCards, cropEvents, type CropCard, type InsertCropCard, type CropEvent, type InsertCropEvent } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  getCropCardsByUser(userId: string): Promise<CropCard[]>;
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
  async getCropCardsByUser(userId: string): Promise<CropCard[]> {
    return db.select().from(cropCards).where(eq(cropCards.userId, userId)).orderBy(desc(cropCards.createdAt));
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
