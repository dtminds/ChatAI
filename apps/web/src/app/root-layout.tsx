import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import {
  hasStoredAuthToken,
  subscribeAuthTokensChanged,
} from "@/pages/auth/auth-tokens";

const PUBLIC_PATHS = new Set(["/login"]);

export function RootLayout() {
  const location = useLocation();
  const [hasAuthToken, setHasAuthToken] = useState(hasStoredAuthToken);

  useEffect(() => {
    const syncAuthTokenState = () => {
      setHasAuthToken(hasStoredAuthToken());
    };

    const unsubscribe = subscribeAuthTokensChanged(syncAuthTokenState);
    window.addEventListener("storage", syncAuthTokenState);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", syncAuthTokenState);
    };
  }, []);

  if (!PUBLIC_PATHS.has(location.pathname) && !hasAuthToken) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <Outlet />
      <Toaster position="top-right" richColors />
    </div>
  );
}
