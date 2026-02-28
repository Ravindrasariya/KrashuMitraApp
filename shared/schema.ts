import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, varchar, timestamp, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
export * from "./models/chat";

import { users } from "./models/auth";

export const cropCards = pgTable("crop_cards", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  cropName: text("crop_name").notNull(),
  startDate: date("start_date").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const cropEvents = pgTable("crop_events", {
  id: serial("id").primaryKey(),
  cropCardId: integer("crop_card_id").notNull().references(() => cropCards.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  description: text("description"),
  eventDate: date("event_date").notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCropCardSchema = createInsertSchema(cropCards).omit({
  id: true,
  createdAt: true,
});

export const insertCropEventSchema = createInsertSchema(cropEvents).omit({
  id: true,
  createdAt: true,
});

export type CropCard = typeof cropCards.$inferSelect;
export type InsertCropCard = z.infer<typeof insertCropCardSchema>;
export type CropEvent = typeof cropEvents.$inferSelect;
export type InsertCropEvent = z.infer<typeof insertCropEventSchema>;
