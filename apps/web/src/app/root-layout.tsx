import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { Toaster } from "@/components/ui/sonner";
import {
  applyAppearanceTheme,
  getInitialAppearanceTheme,
} from "@/lib/appearance-theme";
import { getAuthSession } from "@/pages/auth/auth-service";
import { subscribeAuthSessionChanged } from "@/pages/auth/auth-tokens";

const PUBLIC_PATHS = new Set(["/login"]);
type AuthStatus = "checking" | "authenticated" | "anonymous";
type AuthState = {
  checkedPath: string | null;
  status: AuthStatus;
};

export function RootLayout() {
  const location = useLocation();
  const [authState, setAuthState] = useState<AuthState>({
    checkedPath: null,
    status: PUBLIC_PATHS.has(location.pathname) ? "anonymous" : "checking",
  });
  const authStatusRef = useRef(authState.status);

  function updateAuthState(nextStatus: AuthStatus, checkedPath: string | null = null) {
    authStatusRef.current = nextStatus;
    setAuthState({
      checkedPath,
      status: nextStatus,
    });
  }

  useEffect(() => {
    applyAppearanceTheme(getInitialAppearanceTheme());
  }, []);

  useEffect(() => {
    let isActive = true;

    if (PUBLIC_PATHS.has(location.pathname)) {
      updateAuthState("anonymous");
      return undefined;
    }

    const syncAuthSessionState = async (options: { force?: boolean } = {}) => {
      if (!options.force && authStatusRef.current === "authenticated") {
        return;
      }

      updateAuthState("checking");

      try {
        await getAuthSession();

        if (isActive) {
          updateAuthState("authenticated");
        }
      } catch {
        if (isActive) {
          updateAuthState("anonymous", location.pathname);
        }
      }
    };

    void syncAuthSessionState();
    const unsubscribe = subscribeAuthSessionChanged(() => {
      void syncAuthSessionState({ force: true });
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [location.pathname]);

  const isPublicPath = PUBLIC_PATHS.has(location.pathname);
  const shouldVerifyPrivatePath =
    !isPublicPath &&
    authState.status !== "authenticated" &&
    authState.checkedPath !== location.pathname;

  if (
    !isPublicPath &&
    (authState.status === "checking" || shouldVerifyPrivatePath)
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
              type="square-5"
            />
            <span>正在验证登录状态</span>
          </div>
        </main>
        <Toaster position="top-right" richColors />
      </div>
    );
  }

  if (!isPublicPath && authState.status === "anonymous") {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <Outlet />
      <Toaster position="top-right" richColors />
    </div>
  );
}
