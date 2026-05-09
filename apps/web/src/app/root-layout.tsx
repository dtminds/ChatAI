import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { hasStoredAuthToken } from "@/pages/auth/auth-tokens";

const PUBLIC_PATHS = new Set(["/login"]);

export function RootLayout() {
  const location = useLocation();

  if (!PUBLIC_PATHS.has(location.pathname) && !hasStoredAuthToken()) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <Outlet />
      <Toaster position="top-right" richColors />
    </div>
  );
}
