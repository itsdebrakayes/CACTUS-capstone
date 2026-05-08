import "dotenv/config";

process.env.NODE_ENV ||= "development";
process.env.DISABLE_SQL ??= "true";

if (process.env.DISABLE_SQL === "true") {
  console.log("[Dev] SQL is disabled for local development. Set DISABLE_SQL=false to re-enable it.");
}

await import("../server/_core/index.ts");
