import { Outlet } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

export function RootLayout() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <Outlet />
      <Toaster position="top-right" richColors />
    </div>
  );
}
