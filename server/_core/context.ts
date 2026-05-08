import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
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

        user =
          (await db.syncSupabaseAuthUser({
            supabaseUserId: supabaseUser.id,
            email: supabaseUser.email ?? null,
            name: fullName,
            avatarUrl,
          })) ?? null;
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
