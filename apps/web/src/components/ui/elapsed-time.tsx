import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ELAPSED_TIME_REFRESH_MS = 100;

export function ElapsedTime({
  className,
  startedAt,
}: {
  className?: string;
  startedAt: number;
}) {
  const [elapsedDeciseconds, setElapsedDeciseconds] = useState(() =>
    getElapsedDeciseconds(startedAt),
  );

  useEffect(() => {
    const updateElapsedTime = () => {
      setElapsedDeciseconds(getElapsedDeciseconds(startedAt));
    };

    updateElapsedTime();
    const timer = window.setInterval(
      updateElapsedTime,
      ELAPSED_TIME_REFRESH_MS,
    );

    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "w-[4.5rem] shrink-0 text-left text-xs text-muted-foreground/60 leading-none tabular-nums",
        className,
      )}
      data-slot="elapsed-time"
    >
      {formatElapsedTime(elapsedDeciseconds)}
    </span>
  );
}

function getElapsedDeciseconds(startedAt: number) {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 100));
}

function formatElapsedTime(elapsedDeciseconds: number) {
  const totalSeconds = elapsedDeciseconds / 10;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toFixed(1)}s`;
}
