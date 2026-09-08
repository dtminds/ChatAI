import { Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const seconds = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

export type TimePickerPrecision = "minute" | "second";

export function TimePicker({
  "aria-label": ariaLabel,
  className,
  disabled = false,
  onValueChange,
  precision = "minute",
  value,
  variant = "outline",
}: {
  "aria-label": string;
  className?: string;
  disabled?: boolean;
  onValueChange(value: string): void;
  precision?: TimePickerPrecision;
  value: string;
  variant?: "outline" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const parsedTime = parseTime(value, precision);
  const [hour, minute, second] = parsedTime ?? ["00", "00", "00"];
  const [draftHour, setDraftHour] = useState(hour);
  const [draftMinute, setDraftMinute] = useState(minute);
  const [draftSecond, setDraftSecond] = useState(second);
  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const selectedMinuteRef = useRef<HTMLButtonElement>(null);
  const selectedSecondRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    selectedHourRef.current?.scrollIntoView?.({ block: "center" });
    selectedMinuteRef.current?.scrollIntoView?.({ block: "center" });
    selectedSecondRef.current?.scrollIntoView?.({ block: "center" });
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftHour(hour);
      setDraftMinute(minute);
      setDraftSecond(second);
    }
    setOpen(nextOpen);
  };

  const updateDraftTime = (next: Partial<{
    hour: string;
    minute: string;
    second: string;
  }>) => {
    const nextHour = next.hour ?? draftHour;
    const nextMinute = next.minute ?? draftMinute;
    const nextSecond = next.second ?? draftSecond;
    if (next.hour !== undefined) setDraftHour(next.hour);
    if (next.minute !== undefined) setDraftMinute(next.minute);
    if (next.second !== undefined) setDraftSecond(next.second);
    onValueChange(formatTime(nextHour, nextMinute, nextSecond, precision));
  };

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className={cn(
            "h-9 justify-between rounded-[10px] px-2.5 font-normal",
            precision === "second" ? "w-36" : "w-28",
            className,
          )}
          disabled={disabled}
          type="button"
          variant={variant}
        >
          <span className={cn(!parsedTime && "text-muted-foreground")}>
            {parsedTime ? formatTime(hour, minute, second, precision) : "未配置"}
          </span>
          <HugeiconsIcon
            aria-hidden="true"
            className="text-muted-foreground"
            icon={Clock01Icon}
            size={16}
            strokeWidth={1.8}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "flex h-60 max-h-[var(--radix-popover-content-available-height)] flex-col p-2",
          precision === "second" ? "w-60" : "w-44",
        )}
      >
        <div className={cn(
          "grid min-h-0 flex-1 divide-x divide-border",
          precision === "second" ? "grid-cols-3" : "grid-cols-2",
        )}
        >
          <TimeColumn
            label="时"
            onSelect={hour => updateDraftTime({ hour })}
            options={hours}
            selectedRef={selectedHourRef}
            value={draftHour}
          />
          <TimeColumn
            label="分"
            onSelect={minute => updateDraftTime({ minute })}
            options={minutes}
            selectedRef={selectedMinuteRef}
            value={draftMinute}
          />
          {precision === "second" ? (
            <TimeColumn
              label="秒"
              onSelect={second => updateDraftTime({ second })}
              options={seconds}
              selectedRef={selectedSecondRef}
              value={draftSecond}
            />
          ) : null}
        </div>
        <Button
          aria-label={`${ariaLabel}确认`}
          className="shrink-0 self-end"
          onClick={() => {
            setOpen(false);
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          确定
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function TimeColumn({
  label,
  onSelect,
  options,
  selectedRef,
  value,
}: {
  label: string;
  onSelect(value: string): void;
  options: string[];
  selectedRef: RefObject<HTMLButtonElement | null>;
  value: string;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col px-1.5">
      <div className="shrink-0 pb-1.5 text-center text-xs text-muted-foreground">{label}</div>
      <div
        className="-mr-1.5 min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={event => event.stopPropagation()}
      >
        <div className="space-y-0.5 pr-1.5">
          {options.map((option) => {
            const selected = option === value;
            return (
              <Button
                aria-pressed={selected}
                className={cn(
                  "h-8 w-full rounded-[8px] px-2 text-sm font-normal",
                  selected && "bg-accent text-accent-foreground",
                )}
                key={option}
                onClick={() => onSelect(option)}
                ref={selected ? selectedRef : undefined}
                size="sm"
                type="button"
                variant="ghost"
              >
                <span>{option}</span>
                <span className="sr-only">{label}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function parseTime(value: string, precision: TimePickerPrecision): [string, string, string] | undefined {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.exec(value);
  if (!match) return undefined;
  if (precision === "minute") return [value.slice(0, 2), value.slice(3, 5), "00"];
  return [value.slice(0, 2), value.slice(3, 5), value.slice(6, 8) || "00"];
}

function formatTime(
  hour: string,
  minute: string,
  second: string,
  precision: TimePickerPrecision,
) {
  return precision === "second" ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
}
