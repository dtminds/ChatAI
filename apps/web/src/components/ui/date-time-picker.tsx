import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TimePicker } from "@/components/ui/time-picker";
import { parseLocalDateTime } from "@/lib/local-date-time";
import { cn } from "@/lib/utils";

export function DateTimePicker({
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
  const parsedValue = parseLocalDateTime(value);
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<Date | undefined>(parsedValue?.date);
  const [draftTime, setDraftTime] = useState(parsedValue?.time ?? "00:00");

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const nextValue = parseLocalDateTime(value);
      setDraftDate(nextValue?.date);
      setDraftTime(nextValue?.time ?? "00:00");
    }
    setOpen(nextOpen);
  };

  const applyValue = () => {
    if (!draftDate) return;
    onValueChange(`${formatDateValue(draftDate)}T${draftTime}`);
    setOpen(false);
  };

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className={cn("h-9 w-full justify-between px-3 font-normal", className)}
          disabled={disabled}
          type="button"
          variant="outline"
        >
          <span className={cn("truncate", !parsedValue && "text-muted-foreground")}>
            {parsedValue ? `${formatDateValue(parsedValue.date)} ${parsedValue.time}` : "请选择日期时间"}
          </span>
          <HugeiconsIcon
            aria-hidden="true"
            className="shrink-0 text-muted-foreground"
            icon={Calendar03Icon}
            size={16}
            strokeWidth={1.8}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          defaultMonth={draftDate}
          mode="single"
          onSelect={setDraftDate}
          selected={draftDate}
        />
        <div className="flex items-center justify-between gap-3 border-t border-border p-3">
          <TimePicker
            aria-label={`${ariaLabel}时间`}
            onValueChange={setDraftTime}
            value={draftTime}
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                onValueChange("");
                setOpen(false);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              清除
            </Button>
            <Button disabled={!draftDate} onClick={applyValue} size="sm" type="button">
              确定
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatDateValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
