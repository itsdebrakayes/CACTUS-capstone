import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { TRUST_SCORE_DEFAULT } from "@shared/trust";
import * as db from "../db";
import { sdk } from "./sdk";
import { getBearerToken, getSupabaseUserForAccessToken } from "./supabaseAuth";

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
    const accessToken = getBearerToken(opts.req.headers.authorization);
    if (accessToken) {
      const supabaseUser = await getSupabaseUserForAccessToken(accessToken);
      if (supabaseUser) {
        const fullName =
          typeof supabaseUser.user_metadata?.full_name === "string"
            ? supabaseUser.user_metadata.full_name
            : typeof supabaseUser.user_metadata?.name === "string"
              ? supabaseUser.user_metadata.name
              : null;
        const avatarUrl =
          typeof supabaseUser.user_metadata?.avatar_url === "string"
            ? supabaseUser.user_metadata.avatar_url
            : null;

        try {
          user =
            (await db.syncSupabaseAuthUser({
              supabaseUserId: supabaseUser.id,
              email: supabaseUser.email ?? null,
              name: fullName,
              avatarUrl,
            })) ??
            buildSupabaseFallbackUser({
              supabaseUserId: supabaseUser.id,
              email: supabaseUser.email ?? null,
              name: fullName,
              avatarUrl,
            });
        } catch (error) {
          console.warn(
            "[Auth] Falling back to Supabase-only context user:",
            error
          );
          user = buildSupabaseFallbackUser({
            supabaseUserId: supabaseUser.id,
            email: supabaseUser.email ?? null,
            name: fullName,
            avatarUrl,
          });
        }
      }
    }
  }

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
