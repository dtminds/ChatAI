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

type SwitchPhase = "settled" | "exiting" | "entering";

const EXIT_ANIMATION_MS = 120;
const ENTER_ANIMATION_MS = 160;

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
  const phaseRef = React.useRef<SwitchPhase>("settled");
  const displayedValueRef = React.useRef(value);
  const pendingValueRef = React.useRef<string | null>(null);
  const staggerMsRef = React.useRef(staggerMs);
  const targetValueRef = React.useRef<string | null>(null);
  const enterTimeoutRef = React.useRef<ReturnType<typeof globalThis.setTimeout> | null>(
    null,
  );
  const settleTimeoutRef = React.useRef<ReturnType<typeof globalThis.setTimeout> | null>(
    null,
  );
  const nextRunIdRef = React.useRef(1);

  staggerMsRef.current = staggerMs;

  function clearEnterTimeout() {
    if (enterTimeoutRef.current !== null) {
      globalThis.clearTimeout(enterTimeoutRef.current);
      enterTimeoutRef.current = null;
    }
  }

  function clearSettleTimeout() {
    if (settleTimeoutRef.current !== null) {
      globalThis.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  }

  function getEnterDuration(nextValue: string) {
    return ENTER_ANIMATION_MS
      + Math.max(splitText(nextValue).length - 1, 0) * staggerMsRef.current;
  }

  function beginEnter(nextValue: string) {
    clearSettleTimeout();
    phaseRef.current = "entering";
    displayedValueRef.current = nextValue;
    setRuns([
      {
        id: nextRunIdRef.current,
        phase: "enter",
        value: nextValue,
      },
    ]);
    nextRunIdRef.current += 1;

    const enterDuration =
      getEnterDuration(nextValue);

    settleTimeoutRef.current = globalThis.setTimeout(() => {
      settleTimeoutRef.current = null;
      const pendingValue = pendingValueRef.current;
      pendingValueRef.current = null;

      if (
        pendingValue !== null
        && pendingValue !== displayedValueRef.current
      ) {
        beginExit(pendingValue);
        return;
      }

      phaseRef.current = "settled";
      setIsSettled(true);
    }, enterDuration);
  }

  function beginExit(nextValue: string) {
    clearEnterTimeout();
    clearSettleTimeout();
    phaseRef.current = "exiting";
    targetValueRef.current = nextValue;
    pendingValueRef.current = null;
    setIsSettled(false);
    setRuns([
      {
        id: nextRunIdRef.current,
        phase: "exit",
        value: displayedValueRef.current,
      },
    ]);
    nextRunIdRef.current += 1;

    enterTimeoutRef.current = globalThis.setTimeout(() => {
      enterTimeoutRef.current = null;
      const targetValue = targetValueRef.current;
      targetValueRef.current = null;

      if (
        targetValue === null
        || targetValue === displayedValueRef.current
      ) {
        phaseRef.current = "settled";
        setRuns([
          {
            id: nextRunIdRef.current,
            phase: "enter",
            value: displayedValueRef.current,
          },
        ]);
        nextRunIdRef.current += 1;
        setIsSettled(true);
        return;
      }

      beginEnter(targetValue);
    }, EXIT_ANIMATION_MS);
  }

  React.useEffect(() => {
    if (phaseRef.current === "settled") {
      if (value !== displayedValueRef.current) {
        beginExit(value);
      }
      return undefined;
    }

    if (phaseRef.current === "exiting") {
      targetValueRef.current = value;
      return undefined;
    }

    pendingValueRef.current =
      value === displayedValueRef.current ? null : value;
    return undefined;
  }, [value]);

  React.useEffect(() => () => {
    clearEnterTimeout();
    clearSettleTimeout();
  }, []);

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
