/**
 * Applies Drizzle migrations directly using the postgres-js client.
 * This bypasses drizzle-kit push (which has a bug with Supabase check constraints).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dependency needed)
const envPath = resolve(__dirname, "../.env");
const envLines = readFileSync(envPath, "utf8").split("\n");
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  const val = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, "");
  if (!process.env[key]) process.env[key] = val;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set in .env");
  process.exit(1);
}

console.log("Connecting to database...");
const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client);

// Wipe and recreate the public schema so we start from a clean slate.
// Safe to do in dev — removes all leftover tables from failed migration attempts.
console.log("Resetting public schema...");
await client`DROP SCHEMA public CASCADE`;
await client`CREATE SCHEMA public`;
await client`GRANT ALL ON SCHEMA public TO postgres`;
await client`GRANT ALL ON SCHEMA public TO public`;

console.log("Applying migrations from ./drizzle ...");
await migrate(db, { migrationsFolder: resolve(__dirname, "../drizzle") });

await client.end();
console.log("✅ Migrations complete — all tables are up to date.");
