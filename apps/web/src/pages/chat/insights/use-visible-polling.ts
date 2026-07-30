import { useEffect } from "react";

type VisiblePollingLoadOptions = {
  showLoading: boolean;
  signal: AbortSignal;
};

export function useVisiblePolling({
  enabled,
  intervalMs,
  load,
  refreshKey,
}: {
  enabled: boolean;
  intervalMs: number;
  load: (options: VisiblePollingLoadOptions) => Promise<void>;
  refreshKey?: unknown;
}) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    let inFlight = false;

    const run = async (showLoading: boolean) => {
      if (inFlight || document.visibilityState !== "visible") {
        return;
      }

      inFlight = true;

      try {
        await load({
          showLoading,
          signal: controller.signal,
        });
      } finally {
        inFlight = false;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void run(false);
      }
    };

    void run(true);
    const timer = window.setInterval(() => {
      void run(false);
    }, intervalMs);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, intervalMs, load, refreshKey]);
}
