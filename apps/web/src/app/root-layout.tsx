import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import {
  applyAppearanceTheme,
  getInitialAppearanceTheme,
} from "@/lib/appearance-theme";
import { getAuthSession } from "@/pages/auth/auth-service";
import { subscribeAuthSessionChanged } from "@/pages/auth/auth-tokens";

const PUBLIC_PATHS = new Set(["/login"]);

export function RootLayout() {
  const location = useLocation();
  const [authStatus, setAuthStatus] = useState<"checking" | "authenticated" | "anonymous">(
    PUBLIC_PATHS.has(location.pathname) ? "anonymous" : "checking",
  );
  const authStatusRef = useRef(authStatus);

  function updateAuthStatus(nextStatus: typeof authStatus) {
    authStatusRef.current = nextStatus;
    setAuthStatus(nextStatus);
  }

  useEffect(() => {
    applyAppearanceTheme(getInitialAppearanceTheme());
  }, []);

  useEffect(() => {
    let isActive = true;

    if (PUBLIC_PATHS.has(location.pathname)) {
      updateAuthStatus("anonymous");
      return undefined;
    }

    const syncAuthSessionState = async (options: { force?: boolean } = {}) => {
      if (!options.force && authStatusRef.current === "authenticated") {
        return;
      }

      updateAuthStatus("checking");

      try {
        await getAuthSession();

        if (isActive) {
          updateAuthStatus("authenticated");
        }
      } catch {
        if (isActive) {
          updateAuthStatus("anonymous");
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

  if (!PUBLIC_PATHS.has(location.pathname) && authStatus === "checking") {
    return (
      <div className="min-h-svh bg-background text-foreground">
        <Toaster position="top-right" richColors />
      </div>
    );
  }

  if (!PUBLIC_PATHS.has(location.pathname) && authStatus === "anonymous") {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <Outlet />
      <Toaster position="top-right" richColors />
    </div>
  );
}
