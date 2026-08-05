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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { parseLocalDateTime } from "@/lib/local-date-time";
import { cn } from "@/lib/utils";

const hours = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0"),
);
const minutes = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, "0"),
);

type LocalDateTimePickerProps = {
  "aria-label": string;
  className?: string;
  disabled?: boolean;
  onValueChange(value: string): void;
  value: string;
};

type DateValuePickerProps = {
  ariaLabel: string;
  className?: string;
  onChange(value: Date | undefined): void;
  placeholder?: string;
  value?: Date;
};

type DateTimePickerProps = LocalDateTimePickerProps | DateValuePickerProps;

export function DateTimePicker(props: DateTimePickerProps) {
  return "onValueChange" in props ? (
    <LocalDateTimePicker {...props} />
  ) : (
    <DateValuePicker {...props} />
  );
}

function LocalDateTimePicker({
  "aria-label": ariaLabel,
  className,
  disabled = false,
  onValueChange,
  value,
}: LocalDateTimePickerProps) {
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
            {parsedValue
              ? `${formatDateValue(parsedValue.date)} ${parsedValue.time}`
              : "请选择日期时间"}
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

function DateValuePicker({
  ariaLabel,
  className,
  onChange,
  placeholder = "选择日期和时间",
  value,
}: DateValuePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => normalizeDate(value ?? new Date()));

  function handleOpenChange(open: boolean) {
    if (open) setDraft(normalizeDate(value ?? new Date()));
    setIsOpen(open);
  }

  function selectDate(date: Date | undefined) {
    if (!date) return;
    const next = new Date(date);
    next.setHours(draft.getHours(), draft.getMinutes(), 0, 0);
    setDraft(next);
  }

  function updateTime(part: "hour" | "minute", nextValue: string) {
    const next = new Date(draft);
    if (part === "hour") next.setHours(Number(nextValue));
    else next.setMinutes(Number(nextValue));
    setDraft(next);
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={isOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className={cn(
            "h-10 w-full justify-between rounded-[10px] px-3.5 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
          type="button"
          variant="outline"
        >
          <span>{value ? formatDateTime(value) : placeholder}</span>
          <HugeiconsIcon
            aria-hidden="true"
            className="text-muted-foreground"
            icon={Calendar03Icon}
            size={16}
            strokeWidth={1.8}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          className="mx-auto"
          mode="single"
          onSelect={selectDate}
          selected={draft}
        />
        <div className="flex items-end gap-2 border-t p-3">
          <div className="grid flex-1 gap-1.5">
            <span className="text-xs text-muted-foreground">时间</span>
            <div className="flex items-center gap-2">
              <Select
                onValueChange={(nextValue) => updateTime("hour", nextValue)}
                value={hours[draft.getHours()]}
              >
                <SelectTrigger aria-label="小时" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {hours.map((hour) => (
                    <SelectItem key={hour} value={hour}>
                      {hour}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">:</span>
              <Select
                onValueChange={(nextValue) => updateTime("minute", nextValue)}
                value={minutes[draft.getMinutes()]}
              >
                <SelectTrigger aria-label="分钟" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {minutes.map((minute) => (
                    <SelectItem key={minute} value={minute}>
                      {minute}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {value ? (
            <Button
              onClick={() => {
                onChange(undefined);
                setIsOpen(false);
              }}
              type="button"
              variant="ghost"
            >
              清除
            </Button>
          ) : null}
          <Button
            onClick={() => {
              onChange(draft);
              setIsOpen(false);
            }}
            type="button"
          >
            确定
          </Button>
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

function normalizeDate(value: Date) {
  const normalized = new Date(value);
  normalized.setSeconds(0, 0);
  return normalized;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value);
}
