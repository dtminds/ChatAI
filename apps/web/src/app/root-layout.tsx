import { useEffect, useRef, useState } from "react";
import {
  AlertCircleIcon,
  SecurityLockIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { Button } from "@/components/ui/button";
import { IconStack } from "@/components/ui/icon-stack";
import { Toaster } from "@/components/ui/sonner";
import { useAppearancePreferences } from "@/hooks/use-appearance-preferences";
import {
  buildLoginRedirectPath,
  isEmbedPath,
  readEmbedSsoAttempt,
} from "@/pages/auth/auth-redirect";
import {
  clearEmbedAuthHandoff,
  clearEmbedHandoffToken,
  consumeEmbedAuthHandoffFromSearch,
  getEmbedAccessToken,
  restoreEmbedAuthHandoff,
  stripEmbedHandoffTokenFromWindowLocation,
} from "@/lib/embed-access-token";
import {
  getAuthSession,
  isAuthSessionRejected,
  isEmbedHandoffRejected,
  isEmbedSsoRejected,
  isEmbedSsoRetryable,
  loginWithEmbedSso,
} from "@/pages/auth/auth-service";
import { subscribeAuthSessionChanged } from "@/pages/auth/auth-tokens";
import {
  postChatEmbedLoadError,
  type ChatEmbedLoadErrorCode,
} from "@/lib/embed-parent-bridge";
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
  stripEmbedHandoffTokenFromWindowLocation();
}

const EMBED_SSO_RETRY_DELAYS_MS = [1000, 2000] as const;

function EmbedLoadFailureView({
  code,
  onRetry,
}: {
  code: ChatEmbedLoadErrorCode;
  onRetry: () => void;
}) {
  const accessDenied = code === "EMBED_ACCESS_DENIED";
  const icon = accessDenied ? SecurityLockIcon : AlertCircleIcon;

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="flex min-h-svh items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <IconStack aria-hidden="true" className="mb-3 h-20 w-18">
            <HugeiconsIcon
              aria-hidden="true"
              icon={icon}
              size={16}
              strokeWidth={1.8}
            />
          </IconStack>
          <p className="text-sm text-muted-foreground">
            {accessDenied ? "暂无权限使用此功能" : "页面加载失败，请稍后重试"}
          </p>
          {!accessDenied && (
            <Button
              onClick={onRetry}
              size="sm"
              type="button"
              variant="outline"
            >
              重试
            </Button>
          )}
        </div>
      </main>
      <Toaster position="top-right" />
    </div>
  );
}

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
  const [embedLoadFailure, setEmbedLoadFailure] =
    useState<ChatEmbedLoadErrorCode | null>(null);
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

    setEmbedLoadFailure(null);
    let embedRetryCount = 0;
    let embedRetryTimer: number | undefined;
    let pendingEmbedRetry: (() => void) | undefined;

    const reportEmbedLoadFailure = (code: ChatEmbedLoadErrorCode) => {
      if (!isActive) {
        return;
      }

      setEmbedLoadFailure(code);
      postChatEmbedLoadError(code);
    };

    const scheduleEmbedRetry = (retry: () => void, delay: number) => {
      const runRetry = () => {
        if (document.visibilityState === "hidden") {
          pendingEmbedRetry = retry;
          return;
        }

        retry();
      };

      if (document.visibilityState === "hidden") {
        pendingEmbedRetry = retry;
        return;
      }

      embedRetryTimer = window.setTimeout(runRetry, delay);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !pendingEmbedRetry) {
        return;
      }

      const retry = pendingEmbedRetry;
      pendingEmbedRetry = undefined;
      retry();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

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
        setEmbedLoadFailure(null);
        setSession(nextSubUser);
      };

      if (embedSsoAttempt) {
        try {
          const embedLogin = await loginWithEmbedSso(embedSsoAttempt.params);
          clearEmbedHandoffToken();
          applyAuthenticatedSession(embedLogin.data.subUser);
          return;
        } catch (embedError) {
          if (isActive && isEmbedHandoffRejected(embedError)) {
            clearEmbedAuthHandoff();
            resetWorkbenchSession();
            lastSubUserIdRef.current = null;
            reportEmbedLoadFailure("EMBED_HANDOFF_REQUIRED");
            clearSession(location.pathname);
            return;
          }

          if (isActive && isEmbedSsoRejected(embedError)) {
            clearEmbedAuthHandoff();
            resetWorkbenchSession();
            lastSubUserIdRef.current = null;
            reportEmbedLoadFailure("EMBED_ACCESS_DENIED");
            clearSession(location.pathname);
            return;
          }

          if (isActive) {
            if (embedRetryTimer !== undefined) {
              window.clearTimeout(embedRetryTimer);
            }

            if (
              !isEmbedSsoRetryable(embedError)
              || embedRetryCount >= EMBED_SSO_RETRY_DELAYS_MS.length
            ) {
              reportEmbedLoadFailure("EMBED_SSO_UNAVAILABLE");
              return;
            }

            const retryDelay = EMBED_SSO_RETRY_DELAYS_MS[embedRetryCount];
            embedRetryCount += 1;
            scheduleEmbedRetry(
              () => void syncAuthSessionState({ force: true }),
              retryDelay,
            );
          }
          return;
        }
      }

      try {
        const response = await getAuthSession();
        applyAuthenticatedSession(response.data.subUser);
      } catch (sessionError) {
        if (isActive) {
          if (embedPath) {
            const handoffRequired = isAuthSessionRejected(sessionError);

            reportEmbedLoadFailure(
              handoffRequired
                ? "EMBED_HANDOFF_REQUIRED"
                : "EMBED_SSO_UNAVAILABLE",
            );

            if (!handoffRequired) {
              return;
            }

            clearEmbedAuthHandoff();
          }
          resetWorkbenchSession();
          lastSubUserIdRef.current = null;
          clearSession(location.pathname);
        }
      }
    };

    if (isActive) {
      void syncAuthSessionState({ force: embedPath && embedRetryNonce > 0 });
    }
    const unsubscribe = subscribeAuthSessionChanged(() => {
      void syncAuthSessionState({ force: true });
    });

    return () => {
      isActive = false;
      if (embedRetryTimer !== undefined) {
        window.clearTimeout(embedRetryTimer);
      }
      pendingEmbedRetry = undefined;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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

  if (embedPath && embedLoadFailure) {
    return (
      <EmbedLoadFailureView
        code={embedLoadFailure}
        onRetry={() => {
          setEmbedLoadFailure(null);
          setEmbedRetryNonce((value) => value + 1);
        }}
      />
    );
  }

  if (
    !publicPath &&
    (status === "checking" || shouldVerifyPrivatePath) &&
    !hasEmbedAccessToken
  ) {
    const loadingLabel = embedPath ? "正在加载" : "正在验证登录状态";

    return (
      <div className="min-h-svh bg-background text-foreground">
        <main className="flex min-h-svh items-center justify-center">
          <div
            aria-label={loadingLabel}
            className="inline-flex items-center gap-3 text-sm text-muted-foreground"
            role="status"
          >
            <DotMatrixLoader
              ariaLabel={embedPath ? "加载中" : "正在验证"}
              className="text-muted-foreground"
              dotSize={3}
              size={22}
            />
            <span>{loadingLabel}</span>
          </div>
        </main>
        <Toaster position="top-right" />
      </div>
    );
  }

  if (embedPath && status === "anonymous" && !hasEmbedAccessToken) {
    return (
      <EmbedLoadFailureView
        code="EMBED_HANDOFF_REQUIRED"
        onRetry={() => setEmbedRetryNonce((value) => value + 1)}
      />
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
