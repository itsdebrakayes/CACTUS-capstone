import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const dbDir = path.join(repoRoot, "DB");
const filePath = path.join(dbDir, `write-check-${Date.now()}.json`);

fs.mkdirSync(dbDir, { recursive: true });

const payload = {
  ok: true,
  createdAt: new Date().toISOString(),
  source: "verify-db-json-write",
};

fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
const readBack = JSON.parse(fs.readFileSync(filePath, "utf8"));

if (!readBack.ok) {
  throw new Error("Write check failed: unexpected JSON content");
}

console.log(`DB JSON write check passed: ${filePath}`);
