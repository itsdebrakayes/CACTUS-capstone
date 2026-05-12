import { sendVerificationEmail, generateVerificationCode } from "../server/emailVerification";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
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

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: corepack pnpm exec tsx scripts/test-email.ts <email>");
    process.exit(1);
  }

  const code = generateVerificationCode();
  const result = await sendVerificationEmail(to, "CACTUS User", code);

  if (!result.success) {
    console.error("Email send failed. Check SMTP_HOST/SMTP_USER/SMTP_PASS in .env");
    process.exit(1);
  }

  console.log(`Sent verification code ${code} to ${to}`);
  if (result.previewUrl) {
    console.log(`Preview URL: ${result.previewUrl}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
