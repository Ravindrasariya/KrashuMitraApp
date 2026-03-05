import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: varchar("phone_number").unique(),
  pin: varchar("pin"),
  knownIps: text("known_ips").array(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  farmerCode: varchar("farmer_code").unique(),
  village: varchar("village"),
  tehsil: varchar("tehsil"),
  district: varchar("district"),
  state: varchar("state"),
  postalCode: varchar("postal_code"),
  latitude: varchar("latitude"),
  longitude: varchar("longitude"),
  isAdmin: boolean("is_admin").default(false),
  mustChangePin: boolean("must_change_pin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
