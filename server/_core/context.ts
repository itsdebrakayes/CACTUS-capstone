import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { TRUST_SCORE_DEFAULT } from "../../shared/trust";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function getDevBypassUser(): User | null {
  const isDevBypassEnabled =
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_AUTH_BYPASS === "true";

  if (!isDevBypassEnabled) {
    return null;
  }

  const now = new Date();
  return {
    id: 1,
    openId: "dev:bypass-user",
    name: "Dev User",
    email: "dev@local.test",
    passwordHash: null,
    emailVerified: true,
    verificationCode: null,
    verificationExpiry: null,
    avatarUrl: null,
    loginMethod: "dev-bypass",
    role: "guild_admin",
    isVerified: true,
    trustScore: 100,
    suspensionStatus: "none",
    suspendedUntil: null,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

function buildSupabaseFallbackUser(input: {
  supabaseUserId: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}): User {
  const now = new Date();

  return {
    id: 0,
    openId: `supabase:${input.supabaseUserId}`,
    name: input.name ?? input.email?.split("@")[0] ?? "Student",
    email: input.email ?? null,
    passwordHash: null,
    emailVerified: true,
    verificationCode: null,
    verificationExpiry: null,
    avatarUrl: input.avatarUrl ?? null,
    loginMethod: "supabase",
    role: "student",
    isVerified: true,
    trustScore: TRUST_SCORE_DEFAULT,
    suspensionStatus: "none",
    suspendedUntil: null,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = getDevBypassUser();

  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
