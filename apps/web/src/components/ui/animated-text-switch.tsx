import * as React from "react";
import { cn } from "@/lib/utils";

type AnimatedTextSwitchProps = Omit<
  React.ComponentProps<"span">,
  "children"
> & {
  value: string;
  charClassName?: string;
  shiny?: boolean;
  shinyDuration?: number;
  shinyShimmerWidth?: number;
  staggerMs?: number;
};

type TextRun = {
  id: number;
  phase: "enter" | "exit";
  value: string;
};

const EXIT_ANIMATION_MS = 120;
const ENTER_ANIMATION_MS = 340;

function splitText(value: string) {
  return Array.from(value);
}

function AnimatedTextSwitch({
  value,
  className,
  charClassName,
  shiny = false,
  shinyDuration = 1.35,
  shinyShimmerWidth = 56,
  staggerMs = 18,
  style,
  ...props
}: AnimatedTextSwitchProps) {
  const [runs, setRuns] = React.useState<TextRun[]>([
    { id: 0, phase: "enter", value },
  ]);
  const [isSettled, setIsSettled] = React.useState(true);
  const latestValueRef = React.useRef(value);
  const nextRunIdRef = React.useRef(1);

  React.useEffect(() => {
    if (latestValueRef.current === value) {
      return undefined;
    }

    const previousValue = latestValueRef.current;
    const enterRun: TextRun = {
      id: nextRunIdRef.current + 1,
      phase: "enter",
      value,
    };
    const exitRun: TextRun = {
      id: nextRunIdRef.current,
      phase: "exit",
      value: previousValue,
    };
    const exitDuration = EXIT_ANIMATION_MS;
    const enterDuration =
      ENTER_ANIMATION_MS + splitText(value).length * staggerMs;

    nextRunIdRef.current += 2;
    latestValueRef.current = value;
    if (shiny) {
      setIsSettled(false);
    }
    setRuns([exitRun]);

    const enterTimeoutId = globalThis.setTimeout(() => {
      setRuns([enterRun]);
    }, exitDuration);
    const settleTimeoutId = shiny
      ? globalThis.setTimeout(() => {
          setIsSettled(true);
        }, exitDuration + enterDuration)
      : undefined;

    return () => {
      globalThis.clearTimeout(enterTimeoutId);
      if (settleTimeoutId !== undefined) {
        globalThis.clearTimeout(settleTimeoutId);
      }
    };
  }, [shiny, staggerMs, value]);

  return (
    <span
      aria-label={value}
      className={cn("animated-text-switch", className)}
      data-slot="animated-text-switch"
      style={style}
      {...props}
    >
      {runs.map((run) => {
        const shouldRenderShinyText =
          shiny && run.phase === "enter" && isSettled;

        return (
          <span
            aria-hidden="true"
            className={cn(
              "animated-text-switch__run",
              run.phase === "enter" && "animated-text-switch__run--enter",
              run.phase === "exit" && "animated-text-switch__run--exit",
              shouldRenderShinyText && "shiny-text",
            )}
            data-phase={run.phase}
            data-slot="animated-text-switch-run"
            key={run.id}
            style={
              shouldRenderShinyText
                ? ({
                    "--shiny-text-duration": `${shinyDuration}s`,
                    "--shiny-text-shimmer-width": `${shinyShimmerWidth}px`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {shouldRenderShinyText
              ? run.value
              : splitText(run.value).map((character, index) => (
                  <span
                    className={cn(
                      "animated-text-switch__char",
                      run.phase === "enter"
                        ? "animated-text-switch__char--enter"
                        : "animated-text-switch__char--exit",
                      charClassName,
                    )}
                    data-slot="animated-text-switch-char"
                    key={`${run.id}-${index}-${character}`}
                    style={
                      {
                        "--animated-text-switch-delay": `${index * staggerMs}ms`,
                      } as React.CSSProperties
                    }
                  >
                    {character === " " ? "\u00A0" : character}
                  </span>
                ))}
          </span>
        );
      })}
    </span>
  );
}

export { AnimatedTextSwitch };
