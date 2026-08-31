import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useAppearancePreferences } from "@/hooks/use-appearance-preferences";
import {
  buildLoginRedirectPath,
  isEmbedWorkflowPath,
  readEmbedWorkflowSsoAttempt,
} from "@/pages/auth/auth-redirect";
import {
  consumeEmbedAuthHandoffFromSearch,
  getEmbedAccessToken,
  restoreEmbedAuthHandoff,
  setEmbedAccessToken,
  stripEmbedAccessTokenFromWindowLocation,
} from "@/lib/embed-access-token";
import {
  getAuthSession,
  isEmbedSsoRejected,
  loginWithEmbedSso,
} from "@/pages/auth/auth-service";
import { subscribeAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { readSmpBasementChatEmbedToken } from "@/pages/chat/workflow/workflow-embed-bridge";
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
  if (!isEmbedWorkflowPath(pathname)) {
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
  applyEmbedAuthHandoff(location.pathname, location.search);
  const embedSsoAttempt = readEmbedWorkflowSsoAttempt(location);
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
  const [embedHandoffVersion, setEmbedHandoffVersion] = useState(0);
  const hasEmbedAccessToken = isEmbedWorkflowPath(location.pathname)
    && Boolean(getEmbedAccessToken());

  useEffect(() => {
    authStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    authSubUserIdRef.current = subUserId;
  }, [subUserId]);

  useEffect(() => {
    if (!isEmbedWorkflowPath(location.pathname)) {
      return undefined;
    }

    const onMessage = (event: MessageEvent) => {
      const token = readSmpBasementChatEmbedToken(event.data);

      if (!token) {
        return;
      }

      setEmbedAccessToken(token);
      setEmbedHandoffVersion((value) => value + 1);
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [location.pathname]);

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

      const tokenAtStart = getEmbedAccessToken();

      if (!tokenAtStart) {
        setChecking();
      }

      try {
        const response = await getAuthSession();

        if (isActive) {
          const nextSubUserId = response.data.subUser.subUserId;
          // RootLayout may mount after login already populated auth-store, so
          // compare the last synced session first and fall back to auth-store.
          const currentSubUserId =
            lastSubUserIdRef.current ?? authSubUserIdRef.current;

          if (
            currentSubUserId !== null &&
            currentSubUserId !== nextSubUserId
          ) {
            resetWorkbenchSession();
          }

          lastSubUserIdRef.current = nextSubUserId;
          setEmbedLoginUnavailable(false);
          setSession(response.data.subUser);
        }
      } catch {
        if (embedSsoAttempt) {
          try {
            const embedLogin = await loginWithEmbedSso(embedSsoAttempt.params);

            if (isActive) {
              lastSubUserIdRef.current = embedLogin.data.subUser.subUserId;
              setEmbedLoginUnavailable(false);
              setSession(embedLogin.data.subUser);
            }
            return;
          } catch (embedError) {
            if (isActive && !isEmbedSsoRejected(embedError)) {
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
              return;
            }
          }
        }

        const tokenNow = getEmbedAccessToken();

        if (isActive && tokenNow && tokenNow !== tokenAtStart) {
          void syncAuthSessionState({ force: true });
          return;
        }

        if (isActive) {
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
    embedHandoffVersion,
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

  if (embedSsoAttempt && embedLoginUnavailable) {
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

  if (embedSsoAttempt && status === "anonymous" && !hasEmbedAccessToken) {
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
