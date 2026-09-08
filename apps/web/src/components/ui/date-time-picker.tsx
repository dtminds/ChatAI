import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TimePicker, type TimePickerPrecision } from "@/components/ui/time-picker";
import { parseLocalDateTime } from "@/lib/local-date-time";
import { cn } from "@/lib/utils";

type LocalDateTimePickerProps = {
  "aria-label": string;
  "aria-invalid"?: boolean;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  onValueChange(value: string): void;
  timePrecision?: TimePickerPrecision;
  validateValue?(value: string): string | undefined;
  value: string;
};

type DatePickerProps = {
  "aria-label": string;
  className?: string;
  disabled?: boolean;
  onValueChange(value: string): void;
  placeholder?: string;
  value: string;
};

export function DateTimePicker(props: LocalDateTimePickerProps) {
  return <LocalDateTimePicker {...props} />;
}

export function DatePicker({
  "aria-label": ariaLabel,
  className,
  disabled = false,
  onValueChange,
  placeholder = "请选择日期",
  value,
}: DatePickerProps) {
  const parsedValue = parseDateValue(value);
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<Date | undefined>(parsedValue);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftDate(parseDateValue(value));
    setOpen(nextOpen);
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
            {parsedValue ? formatDateValue(parsedValue) : placeholder}
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
        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
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
          <Button
            disabled={!draftDate}
            onClick={() => {
              if (!draftDate) return;
              onValueChange(formatDateValue(draftDate));
              setOpen(false);
            }}
            size="sm"
            type="button"
          >
            确定
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LocalDateTimePicker({
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  children,
  className,
  disabled = false,
  onValueChange,
  timePrecision = "minute",
  validateValue,
  value,
}: LocalDateTimePickerProps) {
  const parsedValue = parseLocalDateTime(value);
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<Date | undefined>(parsedValue?.date);
  const [draftTime, setDraftTime] = useState(normalizeTimePrecision(
    parsedValue?.time,
    timePrecision,
  ));
  const [error, setError] = useState<string>();

  const handleOpenChange = (nextOpen: boolean) => {
    setError(undefined);
    if (nextOpen) {
      const nextValue = parseLocalDateTime(value);
      setDraftDate(nextValue?.date);
      setDraftTime(normalizeTimePrecision(nextValue?.time, timePrecision));
    }
    setOpen(nextOpen);
  };

  const applyValue = () => {
    if (!draftDate) return;
    const next = `${formatDateValue(draftDate)}T${draftTime}`;
    const validationError = validateValue?.(next);
    setError(validationError);
    if (validationError) return;
    onValueChange(next);
    setOpen(false);
  };

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid || undefined}
            className={cn(
              "h-9 w-full justify-between px-3 font-normal",
              ariaInvalid && "border-destructive focus-visible:ring-destructive/20",
              className,
            )}
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
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          defaultMonth={draftDate}
          mode="single"
          onSelect={date => { setDraftDate(date); setError(undefined); }}
          selected={draftDate}
        />
        <div className="flex items-center justify-between gap-3 border-t border-border p-3">
          <TimePicker
            aria-label={`${ariaLabel}时间`}
            onValueChange={time => { setDraftTime(time); setError(undefined); }}
            precision={timePrecision}
            value={draftTime}
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                onValueChange("");
                setError(undefined);
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
        {error ? <p role="alert" className="px-3 pb-3 text-xs text-destructive">{error}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

function normalizeTimePrecision(value: string | undefined, precision: TimePickerPrecision) {
  if (precision === "second") return value?.length === 8 ? value : `${value ?? "00:00"}:00`;
  return value?.slice(0, 5) ?? "00:00";
}

function formatDateValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    ? date
    : undefined;
}
