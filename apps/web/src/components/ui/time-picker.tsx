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

export function TimePicker({
  "aria-label": ariaLabel,
  className,
  disabled = false,
  onValueChange,
  value,
}: {
  "aria-label": string;
  className?: string;
  disabled?: boolean;
  onValueChange(value: string): void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const parsedTime = parseTime(value);
  const [hour, minute] = parsedTime ?? ["00", "00"];
  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const selectedMinuteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    selectedHourRef.current?.scrollIntoView?.({ block: "center" });
    selectedMinuteRef.current?.scrollIntoView?.({ block: "center" });
  }, [open]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className={cn("h-9 w-28 justify-between rounded-[10px] px-2.5 font-normal", className)}
          disabled={disabled}
          type="button"
          variant="outline"
        >
          <span className={cn(!parsedTime && "text-muted-foreground")}>
            {parsedTime ? `${hour}:${minute}` : "未配置"}
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
      <PopoverContent align="start" className="w-44 p-2">
        <div className="grid grid-cols-2 divide-x divide-border">
          <TimeColumn
            label="时"
            onSelect={(nextHour) => onValueChange(`${nextHour}:${minute}`)}
            options={hours}
            selectedRef={selectedHourRef}
            value={hour}
          />
          <TimeColumn
            label="分"
            onSelect={(nextMinute) => onValueChange(`${hour}:${nextMinute}`)}
            options={minutes}
            selectedRef={selectedMinuteRef}
            value={minute}
          />
        </div>
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
    <div className="min-w-0 px-1.5">
      <div className="pb-1.5 text-center text-xs text-muted-foreground">{label}</div>
      <div className="h-48 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="space-y-0.5 pr-1">
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

function parseTime(value: string): [string, string] | undefined {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  return match ? [value.slice(0, 2), value.slice(3, 5)] : undefined;
}
