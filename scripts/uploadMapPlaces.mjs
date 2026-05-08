import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE_NAME = process.env.SUPABASE_MAP_TABLE || "map_places";
const BATCH_SIZE = 100;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in your environment."
  );
  process.exit(1);
}

async function main() {
  const jsonPath = path.join(__dirname, "map-places.json");
  const raw = await fs.readFile(jsonPath, "utf8");
 const places = JSON.parse(raw).map((place) => ({
  source_id: place.source_id,
  name: place.name,
  type: place.type,
  source_category: place.source_category ?? place.type,
  lat: place.lat,
  lng: place.lng,
  parent_name: place.parent_name ?? null,
  description: place.description ?? null,
  is_active: place.is_active ?? true,
}));

  if (!Array.isArray(places) || places.length === 0) {
    throw new Error("scripts/map-places.json is empty or invalid.");
  }

  const endpoint = new URL(
    `/rest/v1/${TABLE_NAME}?on_conflict=source_id`,
    SUPABASE_URL
  );

  let totalUpserted = 0;

  for (let index = 0; index < places.length; index += BATCH_SIZE) {
    const batch = places.slice(index, index + BATCH_SIZE);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(batch),
    });

    const responseText = await response.text();
    const responseBody = responseText ? JSON.parse(responseText) : null;

    if (!response.ok) {
      console.error("Supabase upsert failed:", responseBody ?? responseText);
      process.exit(1);
    }

    totalUpserted += Array.isArray(responseBody) ? responseBody.length : batch.length;
    console.log(
      `Uploaded batch ${Math.floor(index / BATCH_SIZE) + 1}: ${batch.length} rows`
    );
  }

  const typeSummary = places.reduce((summary, place) => {
    summary[place.type] = (summary[place.type] ?? 0) + 1;
    return summary;
  }, {});

  console.log(`Done. Upserted ${totalUpserted} rows into ${TABLE_NAME}.`);
  console.log("Type summary:");
  for (const [type, count] of Object.entries(typeSummary).sort()) {
    console.log(`- ${type}: ${count}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
