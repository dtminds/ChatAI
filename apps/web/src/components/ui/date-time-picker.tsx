import { useState } from "react";
import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

type DateTimePickerProps = {
  ariaLabel: string;
  className?: string;
  onChange: (value: Date | undefined) => void;
  placeholder?: string;
  value?: Date;
};

export function DateTimePicker({
  ariaLabel,
  className,
  onChange,
  placeholder = "选择日期和时间",
  value,
}: DateTimePickerProps) {
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
          className={cn("h-10 w-full justify-between rounded-[10px] px-3.5 font-normal", !value && "text-muted-foreground", className)}
          type="button"
          variant="outline"
        >
          <span>{value ? formatDateTime(value) : placeholder}</span>
          <HugeiconsIcon aria-hidden="true" className="text-muted-foreground" icon={Calendar03Icon} size={16} strokeWidth={1.8} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar className="mx-auto" mode="single" onSelect={selectDate} selected={draft} />
        <div className="flex items-end gap-2 border-t p-3">
          <div className="grid flex-1 gap-1.5">
            <span className="text-xs text-muted-foreground">时间</span>
            <div className="flex items-center gap-2">
              <Select onValueChange={(nextValue) => updateTime("hour", nextValue)} value={hours[draft.getHours()]}>
                <SelectTrigger aria-label="小时" className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">{hours.map((hour) => <SelectItem key={hour} value={hour}>{hour}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-muted-foreground">:</span>
              <Select onValueChange={(nextValue) => updateTime("minute", nextValue)} value={minutes[draft.getMinutes()]}>
                <SelectTrigger aria-label="分钟" className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">{minutes.map((minute) => <SelectItem key={minute} value={minute}>{minute}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {value ? <Button onClick={() => { onChange(undefined); setIsOpen(false); }} type="button" variant="ghost">清除</Button> : null}
          <Button onClick={() => { onChange(draft); setIsOpen(false); }} type="button">确定</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
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
