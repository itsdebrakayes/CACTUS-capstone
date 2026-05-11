import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

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
