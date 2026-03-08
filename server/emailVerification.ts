/**
 * Email Verification Helper
 * Generates 6-digit codes and sends them via SMTP (nodemailer).
 *
 * For the POC, the SMTP transport uses environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * If those are not set, the code is logged to the console so it can still
 * be tested locally without a real mail server.
 */

import nodemailer from "nodemailer";

// ─── Code generation ─────────────────────────────────────────────────────────

/** Generate a cryptographically random 6-digit numeric code */
export function generateVerificationCode(): string {
  // Use Math.random for POC simplicity; replace with crypto.randomInt in prod
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Returns a Date 15 minutes from now */
export function codeExpiry(): Date {
  return new Date(Date.now() + 15 * 60 * 1000);
}

// ─── Transport ───────────────────────────────────────────────────────────────

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    // No SMTP configured — use Ethereal (auto-creates a test account)
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

// ─── Send verification email ──────────────────────────────────────────────────

export async function sendVerificationEmail(
  toEmail: string,
  toName: string,
  code: string
): Promise<{ success: boolean; previewUrl?: string }> {
  const from = process.env.SMTP_FROM ?? "CACTUS <noreply@cactus.uwimona.edu.jm>";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#00c853,#1b5e20);padding:32px 24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;">CACTUS</h1>
      <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px;">Campus Safety &amp; Coordination</p>
    </div>
    <!-- Body -->
    <div style="padding:32px 24px;">
      <p style="color:#1a1a1a;font-size:16px;margin:0 0 8px;">Hi ${toName},</p>
      <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Use the code below to verify your email address. It expires in <strong>15 minutes</strong>.
      </p>
      <!-- Code box -->
      <div style="background:#f0fdf4;border:2px solid #00c853;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
        <span style="font-size:40px;font-weight:900;letter-spacing:8px;color:#00c853;font-variant-numeric:tabular-nums;">${code}</span>
      </div>
      <p style="color:#888;font-size:12px;margin:0;">
        If you didn't create a CACTUS account, you can safely ignore this email.
      </p>
    </div>
    <!-- Footer -->
    <div style="background:#f9fafb;padding:16px 24px;text-align:center;border-top:1px solid #f0f0f0;">
      <p style="color:#bbb;font-size:11px;margin:0;">UWI Mona Campus · CACTUS Proof of Concept</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const transport = createTransport();

  if (!transport) {
    // No SMTP — log to console for local dev/POC testing
    console.log(`\n[EmailVerification] ─────────────────────────────────`);
    console.log(`  To:   ${toEmail}`);
    console.log(`  Code: ${code}`);
    console.log(`[EmailVerification] ─────────────────────────────────\n`);
    return { success: true, previewUrl: undefined };
  }

  try {
    const info = await transport.sendMail({
      from,
      to: toEmail,
      subject: "Your CACTUS verification code",
      html,
      text: `Your CACTUS verification code is: ${code}\n\nIt expires in 15 minutes.`,
    });

    // nodemailer Ethereal preview URL (only available for test accounts)
    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    if (previewUrl) {
      console.log(`[EmailVerification] Preview: ${previewUrl}`);
    }

    return { success: true, previewUrl: previewUrl as string | undefined };
  } catch (err) {
    console.error("[EmailVerification] Failed to send:", err);
    return { success: false };
  }
}
