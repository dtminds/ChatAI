import { useEffect, useRef, useState } from "react";
import {
  AlertCircleIcon,
  SecurityLockIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { IconStack } from "@/components/ui/icon-stack";
import { Toaster } from "@/components/ui/sonner";
import { useAppearancePreferences } from "@/hooks/use-appearance-preferences";
import {
  clearEmbedAuthHandoff,
  clearEmbedHandoffToken,
  consumeEmbedAuthHandoffFromSearch,
  getEmbedAccessToken,
  getRememberedEmbedHandoffToken,
  restoreEmbedAuthHandoff,
  stripEmbedHandoffTokenFromWindowLocation,
} from "@/lib/embed-access-token";
import {
  postChatEmbedLoadError,
  postChatEmbedNavigate,
  type ChatEmbedLoadErrorCode,
} from "@/lib/embed-parent-bridge";
import {
  getEmbedAuthSession,
  isAuthSessionRejected,
  isEmbedHandoffRejected,
  isEmbedSsoRejected,
  loginWithEmbedSso,
} from "@/pages/auth/auth-service";
import { subscribeAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { useAuthStore } from "@/store/auth-store";
import { useWorkbenchStore } from "@/store/workbench-store";

function applyEmbedAuthHandoff(search: string) {
  restoreEmbedAuthHandoff();
  consumeEmbedAuthHandoffFromSearch(search);
  stripEmbedHandoffTokenFromWindowLocation();
}

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
            <Button onClick={onRetry} size="sm" type="button" variant="outline">
              重试
            </Button>
          )}
        </div>
      </main>
      <Toaster position="top-right" />
    </div>
  );
}

export function EmbedRootLayout() {
  useAppearancePreferences();

  const location = useLocation();
  const appliedHandoffLocationRef = useRef<string | null>(null);
  const handoffInitializedRef = useRef(false);
  const handoffTokenRef = useRef<string | null>(null);
  const forceNextSyncRef = useRef(false);
  const clearSession = useAuthStore((state) => state.clearSession);
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
  const [loadFailure, setLoadFailure] =
    useState<ChatEmbedLoadErrorCode | null>(null);
  const [handoffReady, setHandoffReady] = useState(false);
  const [syncNonce, setSyncNonce] = useState(0);
  const hasAccessToken = handoffReady
    && !handoffTokenRef.current
    && Boolean(getEmbedAccessToken());

  useEffect(() => {
    if (appliedHandoffLocationRef.current === location.key) {
      return;
    }

    appliedHandoffLocationRef.current = location.key;
    applyEmbedAuthHandoff(location.search);
    handoffTokenRef.current = getRememberedEmbedHandoffToken();

    if (!handoffInitializedRef.current) {
      handoffInitializedRef.current = true;
      setHandoffReady(true);
      return;
    }

    if (handoffTokenRef.current) {
      setSyncNonce((value) => value + 1);
    }
  }, [location.key, location.search]);

  useEffect(() => {
    postChatEmbedNavigate(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    authStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    authSubUserIdRef.current = subUserId;
  }, [subUserId]);

  useEffect(() => {
    if (!handoffReady) return;

    let isActive = true;
    setLoadFailure(null);

    const reportFailure = (code: ChatEmbedLoadErrorCode) => {
      if (!isActive) return;
      setLoadFailure(code);
      postChatEmbedLoadError(code);
    };

    const applySession = (
      nextSubUser: Awaited<
        ReturnType<typeof getEmbedAuthSession>
      >["data"]["subUser"],
    ) => {
      if (!isActive) return;

      const currentSubUserId =
        lastSubUserIdRef.current ?? authSubUserIdRef.current;

      if (
        currentSubUserId !== null
        && currentSubUserId !== nextSubUser.subUserId
      ) {
        resetWorkbenchSession();
      }

      lastSubUserIdRef.current = nextSubUser.subUserId;
      setLoadFailure(null);
      setSession(nextSubUser);
    };

    const rejectSession = (code: ChatEmbedLoadErrorCode) => {
      if (!isActive) return;
      handoffTokenRef.current = null;
      clearEmbedAuthHandoff();
      resetWorkbenchSession();
      lastSubUserIdRef.current = null;
      reportFailure(code);
      clearSession();
    };

    const syncSession = async (force = false) => {
      const handoffToken = handoffTokenRef.current;

      if (
        !force
        && authStatusRef.current === "authenticated"
        && !handoffToken
        && Boolean(getEmbedAccessToken())
      ) {
        return;
      }

      if (!getEmbedAccessToken()) setChecking();

      if (handoffToken) {
        try {
          const login = await loginWithEmbedSso({ token: handoffToken });
          handoffTokenRef.current = null;
          clearEmbedHandoffToken();
          applySession(login.data.subUser);
        } catch (error) {
          if (isEmbedHandoffRejected(error)) {
            rejectSession("EMBED_HANDOFF_REQUIRED");
          } else if (isEmbedSsoRejected(error)) {
            rejectSession("EMBED_ACCESS_DENIED");
          } else {
            reportFailure("EMBED_SSO_UNAVAILABLE");
          }
        }
        return;
      }

      try {
        const response = await getEmbedAuthSession();
        applySession(response.data.subUser);
      } catch (error) {
        if (isAuthSessionRejected(error)) {
          rejectSession("EMBED_HANDOFF_REQUIRED");
        } else {
          reportFailure("EMBED_SSO_UNAVAILABLE");
        }
      }
    };

    const force = forceNextSyncRef.current;
    forceNextSyncRef.current = false;
    void syncSession(force);
    const unsubscribe = subscribeAuthSessionChanged(() => {
      void syncSession(true);
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [
    clearSession,
    handoffReady,
    resetWorkbenchSession,
    setChecking,
    setSession,
    syncNonce,
  ]);

  const retrySession = () => {
    forceNextSyncRef.current = true;
    setSyncNonce((value) => value + 1);
  };

  if (loadFailure) {
    return (
      <EmbedLoadFailureView
        code={loadFailure}
        onRetry={retrySession}
      />
    );
  }

  if (status === "checking" && !hasAccessToken) {
    return (
      <div className="min-h-svh bg-background text-foreground">
        <main className="flex min-h-svh items-center justify-center">
          <div
            aria-label="正在加载"
            className="inline-flex items-center gap-3 text-sm text-muted-foreground"
            role="status"
          >
            <DotMatrixLoader
              ariaLabel="加载中"
              className="text-muted-foreground"
              dotSize={3}
              size={22}
            />
            <span>正在加载</span>
          </div>
        </main>
        <Toaster position="top-right" />
      </div>
    );
  }

  if (status === "anonymous" && !hasAccessToken) {
    return (
      <EmbedLoadFailureView
        code="EMBED_HANDOFF_REQUIRED"
        onRetry={retrySession}
      />
    );
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <Outlet />
      <Toaster position="top-right" />
    </div>
  );
}
