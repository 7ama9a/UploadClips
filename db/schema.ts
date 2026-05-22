import { pgTable, text, timestamp, integer, uuid, primaryKey } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
});

export const clips = pgTable("clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").default(""),
  storagePath: text("storage_path").notNull(),
  originalName: text("original_name"),
  mimeType: text("mime_type"),
  fileSize: text("file_size"),
  views: integer("views").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const likes = pgTable("likes", {
  clipId: uuid("clip_id").notNull().references(() => clips.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.clipId, table.userId] })
]);
