type WorkerLogger = {
  error(payload: Record<string, unknown>, message: string): void;
  info(payload: Record<string, unknown>, message: string): void;
};

export type NonOverlappingTicker = {
  tick(): Promise<boolean>;
};

export function createNonOverlappingTicker(run: () => Promise<void>): NonOverlappingTicker {
  let running = false;

  return {
    async tick() {
      if (running) {
        return false;
      }

      running = true;

      try {
        await run();

        return true;
      } finally {
        running = false;
      }
    },
  };
}

export function startInsightsWorker(options: {
  intervalMs?: number;
  logger: WorkerLogger;
  runOnce: () => Promise<void>;
}) {
  const intervalMs = options.intervalMs ?? 3_000;
  const ticker = createNonOverlappingTicker(options.runOnce);
  const timer = setInterval(() => {
    void ticker.tick().catch((error: unknown) => {
      options.logger.error({ err: error }, "会话洞察 worker tick 失败");
    });
  }, intervalMs);

  options.logger.info({ intervalMs }, "会话洞察 worker 已启动");

  return {
    async stop() {
      clearInterval(timer);
    },
    ticker,
  };
}
