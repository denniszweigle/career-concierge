import { defineConfig } from "drizzle-kit";

const dbPath = (process.env.DATABASE_URL ?? "file:./data/db.sqlite").replace(/^file:/, "");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
