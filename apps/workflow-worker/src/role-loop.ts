export function startRoleLoop(input: {
  intervalMs: number;
  now?: () => Date;
  onError?(error: unknown): void;
  onHeartbeat?(input: { completedAt: Date; durationMs: number; result: unknown }): void;
  role: string;
  run(): Promise<unknown>;
}) {
  const abortController = new AbortController();
  const completed = runLoop();
  let closed = false;
  return {
    async close() {
      if (closed) return;
      closed = true;
      abortController.abort();
      await completed;
    },
  };

  async function runLoop() {
    while (!abortController.signal.aborted) {
      const startedAt = input.now?.() ?? new Date();
      try {
        const result = await input.run();
        const completedAt = input.now?.() ?? new Date();
        input.onHeartbeat?.({
          completedAt,
          durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          result,
        });
      } catch (error) {
        input.onError?.(error);
      }
      await waitForNextIteration(input.intervalMs, abortController.signal);
    }
  }
}

function waitForNextIteration(intervalMs: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, intervalMs);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
