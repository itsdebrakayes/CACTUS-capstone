import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

export function useAuth(options?: { redirectTo?: string }) {
  const { data, isLoading, error, refetch } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation();

  const isAuthenticated = !!data && !error;

  useEffect(() => {
    if (!isLoading && !isAuthenticated && options?.redirectTo) {
      window.location.href = options.redirectTo;
    }
  }, [isLoading, isAuthenticated, options?.redirectTo]);

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // ignore
    }
    window.location.href = getLoginUrl();
  }, [logoutMutation]);

  const refresh = useCallback(() => refetch(), [refetch]);

  return useMemo(
    () => ({
      user: data ?? null,
      loading: isLoading,
      error: error instanceof TRPCClientError ? error : null,
      isAuthenticated,
      refresh,
      logout,
    }),
    [data, isLoading, error, isAuthenticated, refresh, logout]
  );
}
