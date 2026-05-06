import { useEffect, useEffectEvent } from "react";

type UseWorkbenchPollingOptions = {
  activeAccountId?: string;
  bootstrapStatus: "idle" | "loading" | "ready" | "error";
  intervalMs: number;
  jitterMs: number;
  pollWorkbench: () => Promise<void>;
};

export function useWorkbenchPolling({
  activeAccountId,
  bootstrapStatus,
  intervalMs,
  jitterMs,
  pollWorkbench,
}: UseWorkbenchPollingOptions) {
  const runPollCycle = useEffectEvent(async () => {
    await pollWorkbench();
  });

  useEffect(() => {
    if (bootstrapStatus !== "ready" || !activeAccountId) {
      return;
    }

    let timeoutId = 0;
    let cancelled = false;

    const scheduleNextPoll = () => {
      const baseInterval =
        document.visibilityState === "hidden" ? 10000 : intervalMs;
      const jitter = Math.floor(Math.random() * jitterMs);

      timeoutId = window.setTimeout(async () => {
        await runPollCycle();

        if (!cancelled) {
          scheduleNextPoll();
        }
      }, baseInterval + jitter);
    };

    scheduleNextPoll();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    activeAccountId,
    bootstrapStatus,
    intervalMs,
    jitterMs,
    runPollCycle,
  ]);
}
