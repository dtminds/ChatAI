import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { Toaster } from "@/components/ui/sonner";
import {
  applyAppearanceTheme,
  getInitialAppearanceTheme,
} from "@/lib/appearance-theme";
import { getAuthSession } from "@/pages/auth/auth-service";
import { subscribeAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { useAuthStore } from "@/store/auth-store";
import { useWorkbenchStore } from "@/store/workbench-store";

const PUBLIC_PATHS = new Set(["/login"]);

export function RootLayout() {
  const location = useLocation();
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

  useEffect(() => {
    authStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    authSubUserIdRef.current = subUserId;
  }, [subUserId]);

  useEffect(() => {
    applyAppearanceTheme(getInitialAppearanceTheme());
  }, []);

  useEffect(() => {
    let isActive = true;

    if (PUBLIC_PATHS.has(location.pathname)) {
      resetWorkbenchSession();
      lastSubUserIdRef.current = null;
      clearSession();
      return undefined;
    }

    const syncAuthSessionState = async (options: { force?: boolean } = {}) => {
      if (!options.force && authStatusRef.current === "authenticated") {
        return;
      }

      setChecking();

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
          setSession(response.data.subUser);
        }
      } catch {
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
      unsubscribe();
    };
  }, [
    clearSession,
    resetWorkbenchSession,
    setChecking,
    setSession,
    location.pathname,
  ]);

  const isPublicPath = PUBLIC_PATHS.has(location.pathname);
  const shouldVerifyPrivatePath =
    !isPublicPath &&
    status !== "authenticated" &&
    checkedPath !== location.pathname;

  if (
    !isPublicPath &&
    (status === "checking" || shouldVerifyPrivatePath)
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
        <Toaster position="top-right" richColors />
      </div>
    );
  }

  if (!isPublicPath && status === "anonymous") {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <Outlet />
      <Toaster position="top-right" richColors />
    </div>
  );
}
