import { getLoginUrl } from "@/const";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

let cachedSession: Session | null = null;
let hasResolvedInitialSession = false;

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();
  const [session, setSession] = useState<Session | null>(cachedSession);
  const [authLoading, setAuthLoading] = useState(!hasResolvedInitialSession);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: !!session,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      cachedSession = data.session;
      hasResolvedInitialSession = true;
      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      cachedSession = nextSession;
      hasResolvedInitialSession = true;
      setSession(nextSession);
      setAuthLoading(false);
      void utils.auth.me.invalidate();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [utils.auth.me]);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      cachedSession = null;
      hasResolvedInitialSession = true;
      setSession(null);
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [utils]);

  const state = useMemo(() => {
    const fallbackUser = session
      ? {
          id: 0,
          openId: `supabase:${session.user.id}`,
          name:
            (session.user.user_metadata.full_name as string | undefined) ??
            (session.user.user_metadata.name as string | undefined) ??
            session.user.email?.split("@")[0] ??
            "Student",
          email: session.user.email ?? null,
          passwordHash: null,
          emailVerified: Boolean(session.user.email_confirmed_at),
          verificationCode: null,
          verificationExpiry: null,
          avatarUrl:
            (session.user.user_metadata.avatar_url as string | undefined) ??
            null,
          loginMethod: "supabase",
          role: "student" as const,
          isVerified: Boolean(session.user.email_confirmed_at),
          trustScore: 50,
          suspensionStatus: "none" as const,
          suspendedUntil: null,
          createdAt: new Date(session.user.created_at),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null;
    const resolvedUser = meQuery.data ?? fallbackUser;

    if (typeof window !== "undefined") {
      localStorage.setItem(
        "manus-runtime-user-info",
        JSON.stringify(resolvedUser)
      );
    }
    return {
      user: resolvedUser,
      loading:
        authLoading || (Boolean(session) && !resolvedUser && meQuery.isLoading),
      error: meQuery.error ?? null,
      isAuthenticated: Boolean(session),
    };
  }, [authLoading, meQuery.data, meQuery.error, meQuery.isLoading, session]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (authLoading) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [authLoading, redirectOnUnauthenticated, redirectPath, state.user]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
