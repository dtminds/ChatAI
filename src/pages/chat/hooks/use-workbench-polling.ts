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

    let timeoutId: number | undefined;
    let cancelled = false;

    const clearScheduledPoll = () => {
      if (timeoutId == null) {
        return;
      }

      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    };

    const scheduleNextPoll = () => {
      clearScheduledPoll();

      const baseInterval =
        document.visibilityState === "hidden" ? 10000 : intervalMs;
      const jitter = Math.floor(Math.random() * jitterMs);

      timeoutId = window.setTimeout(async () => {
        timeoutId = undefined;
        await runPollCycle();

        if (!cancelled) {
          scheduleNextPoll();
        }
      }, baseInterval + jitter);
    };

    const pollNowAndReschedule = async () => {
      clearScheduledPoll();
      await runPollCycle();

      if (!cancelled) {
        scheduleNextPoll();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pollNowAndReschedule();
        return;
      }

      scheduleNextPoll();
    };

    scheduleNextPoll();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearScheduledPoll();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    activeAccountId,
    bootstrapStatus,
    intervalMs,
    jitterMs,
    runPollCycle,
  ]);
}
