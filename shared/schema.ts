import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, varchar, timestamp, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
export * from "./models/chat";

import { users } from "./models/auth";

export const cropCards = pgTable("crop_cards", {
  id: serial("id").primaryKey(),
  uniqueId: integer("unique_id").default(sql`nextval('global_unique_id_seq')`),
  userId: varchar("user_id").notNull().references(() => users.id),
  cropName: text("crop_name").notNull(),
  farmName: text("farm_name"),
  variety: text("variety"),
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

export type CropCard = typeof cropCards.$inferSelect;
export type InsertCropCard = z.infer<typeof insertCropCardSchema>;
export type CropEvent = typeof cropEvents.$inferSelect;
export type InsertCropEvent = z.infer<typeof insertCropEventSchema>;
export type KhataRegister = typeof khataRegisters.$inferSelect;
export type InsertKhataRegister = z.infer<typeof insertKhataRegisterSchema>;
export type KhataItem = typeof khataItems.$inferSelect;
export type InsertKhataItem = z.infer<typeof insertKhataItemSchema>;
