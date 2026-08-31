import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useAppearancePreferences } from "@/hooks/use-appearance-preferences";
import {
  buildLoginRedirectPath,
  isEmbedPath,
  readEmbedSsoAttempt,
} from "@/pages/auth/auth-redirect";
import {
  clearEmbedAuthHandoff,
  consumeEmbedAuthHandoffFromSearch,
  getEmbedAccessToken,
  restoreEmbedAuthHandoff,
  stripEmbedAccessTokenFromWindowLocation,
} from "@/lib/embed-access-token";
import {
  getAuthSession,
  isEmbedSsoRejected,
  loginWithEmbedSso,
} from "@/pages/auth/auth-service";
import { subscribeAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { useAuthStore } from "@/store/auth-store";
import { useWorkbenchStore } from "@/store/workbench-store";

function isDirectEndpointPath(pathname: string, search: string) {
  if (pathname !== "/workflow/endpoint") return false;
  return Boolean(new URLSearchParams(search).get("key"));
}

function isPublicPath(pathname: string, search: string) {
  return pathname === "/login" || isDirectEndpointPath(pathname, search);
}

function applyEmbedAuthHandoff(pathname: string, search: string) {
  if (!isEmbedPath(pathname)) {
    return;
  }

  restoreEmbedAuthHandoff();
  consumeEmbedAuthHandoffFromSearch(search);
  stripEmbedAccessTokenFromWindowLocation();
}

const EMBED_SSO_RETRY_INTERVAL_MS = 2000;
const EMBED_SSO_RETRY_LIMIT = 15;

export function RootLayout() {
  useAppearancePreferences();

  const location = useLocation();
  const appliedEmbedHandoffLocationRef = useRef<string | null>(null);

  if (appliedEmbedHandoffLocationRef.current !== location.key) {
    applyEmbedAuthHandoff(location.pathname, location.search);
    appliedEmbedHandoffLocationRef.current = location.key;
  }
  const embedPath = isEmbedPath(location.pathname);
  const embedSsoAttempt = readEmbedSsoAttempt(location);
  const clearSession = useAuthStore((state) => state.clearSession);
  const checkedPath = useAuthStore((state) => state.checkedPath);
  const setChecking = useAuthStore((state) => state.setChecking);
  const setSession = useAuthStore((state) => state.setSession);
  const status = useAuthStore((state) => state.status);
  const subUserId = useAuthStore((state) => state.subUser?.subUserId ?? null);
  const resetWorkbenchSession = useWorkbenchStore(
    (state) => state.resetWorkbenchSession,
  );
  const authStatusRef = useRef(status);
  const authSubUserIdRef = useRef(subUserId);
  const lastSubUserIdRef = useRef<string | null>(null);
  const [embedLoginUnavailable, setEmbedLoginUnavailable] = useState(false);
  const [embedRetryNonce, setEmbedRetryNonce] = useState(0);
  const hasEmbedAccessToken = embedPath
    && !embedSsoAttempt
    && Boolean(getEmbedAccessToken());

  useEffect(() => {
    authStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    authSubUserIdRef.current = subUserId;
  }, [subUserId]);

  useEffect(() => {
    let isActive = true;

    if (location.pathname === "/login" && !embedSsoAttempt) {
      resetWorkbenchSession();
      lastSubUserIdRef.current = null;
      clearSession();
      return undefined;
    }
    if (isDirectEndpointPath(location.pathname, location.search)) return undefined;

    setEmbedLoginUnavailable(false);
    let embedRetryCount = 0;
    let embedRetryTimer: number | undefined;

    const syncAuthSessionState = async (options: { force?: boolean } = {}) => {
      if (
        !options.force
        && authStatusRef.current === "authenticated"
        && (!embedSsoAttempt || getEmbedAccessToken())
      ) {
        return;
      }

      if (!getEmbedAccessToken()) {
        setChecking();
      }

      const applyAuthenticatedSession = (
        nextSubUser: Awaited<ReturnType<typeof getAuthSession>>["data"]["subUser"],
      ) => {
        if (!isActive) {
          return;
        }

        const nextSubUserId = nextSubUser.subUserId;
        const currentSubUserId =
          lastSubUserIdRef.current ?? authSubUserIdRef.current;

        if (currentSubUserId !== null && currentSubUserId !== nextSubUserId) {
          resetWorkbenchSession();
        }

        lastSubUserIdRef.current = nextSubUserId;
        setEmbedLoginUnavailable(false);
        setSession(nextSubUser);
      };

      if (embedSsoAttempt) {
        try {
          const embedLogin = await loginWithEmbedSso(embedSsoAttempt.params);
          applyAuthenticatedSession(embedLogin.data.subUser);
          return;
        } catch (embedError) {
          if (isActive && isEmbedSsoRejected(embedError)) {
            clearEmbedAuthHandoff();
            resetWorkbenchSession();
            lastSubUserIdRef.current = null;
            clearSession(location.pathname);
            return;
          }

          if (isActive) {
            if (embedRetryTimer !== undefined) {
              window.clearTimeout(embedRetryTimer);
            }

            if (embedRetryCount >= EMBED_SSO_RETRY_LIMIT) {
              setEmbedLoginUnavailable(true);
              return;
            }

            embedRetryCount += 1;
            embedRetryTimer = window.setTimeout(() => {
              void syncAuthSessionState({ force: true });
            }, EMBED_SSO_RETRY_INTERVAL_MS);
          }
          return;
        }
      }

      try {
        const response = await getAuthSession();
        applyAuthenticatedSession(response.data.subUser);
      } catch {
        if (isActive) {
          if (embedPath) {
            clearEmbedAuthHandoff();
          }
          resetWorkbenchSession();
          lastSubUserIdRef.current = null;
          clearSession(location.pathname);
        }
      }
    };

    if (isActive) {
      void syncAuthSessionState();
    }
    const unsubscribe = subscribeAuthSessionChanged(() => {
      void syncAuthSessionState({ force: true });
    });

    return () => {
      isActive = false;
      if (embedRetryTimer !== undefined) {
        window.clearTimeout(embedRetryTimer);
      }
      unsubscribe();
    };
  }, [
    clearSession,
    embedRetryNonce,
    resetWorkbenchSession,
    setChecking,
    setSession,
    location.pathname,
    location.search,
  ]);

  const publicPath = isPublicPath(location.pathname, location.search)
    && !embedSsoAttempt;
  const shouldVerifyPrivatePath =
    !publicPath &&
    status !== "authenticated" &&
    checkedPath !== location.pathname;

  if (status === "authenticated" && embedSsoAttempt && location.pathname === "/login") {
    return <Navigate replace to={embedSsoAttempt.returnPath} />;
  }

  if (embedPath && embedLoginUnavailable) {
    return (
      <div className="min-h-svh bg-background text-foreground">
        <main className="flex min-h-svh items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">操作失败，请稍后重试</p>
            <Button
              onClick={() => {
                setEmbedLoginUnavailable(false);
                setEmbedRetryNonce((value) => value + 1);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              重试
            </Button>
          </div>
        </main>
        <Toaster position="top-right" />
      </div>
    );
  }

  if (
    !publicPath &&
    (status === "checking" || shouldVerifyPrivatePath) &&
    !hasEmbedAccessToken
  ) {
    return (
      <div className="min-h-svh bg-background text-foreground">
        <main className="flex min-h-svh items-center justify-center">
          <div
            aria-label="正在验证登录状态"
            className="inline-flex items-center gap-3 text-sm text-muted-foreground"
            role="status"
          >
            <DotMatrixLoader
              ariaLabel="正在验证"
              className="text-muted-foreground"
              dotSize={3}
              size={22}
            />
            <span>正在验证登录状态</span>
          </div>
        </main>
        <Toaster position="top-right" />
      </div>
    );
  }

  if (embedPath && status === "anonymous" && !hasEmbedAccessToken) {
    return (
      <div className="min-h-svh bg-background text-foreground">
        <main className="flex min-h-svh items-center justify-center">
          <p className="text-sm text-muted-foreground">当前账号不可用</p>
        </main>
        <Toaster position="top-right" />
      </div>
    );
  }

  if (!publicPath && status === "anonymous" && !hasEmbedAccessToken) {
    return <Navigate replace to={buildLoginRedirectPath(location)} />;
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <Outlet />
      <Toaster position="top-right" />
    </div>
  );
}
