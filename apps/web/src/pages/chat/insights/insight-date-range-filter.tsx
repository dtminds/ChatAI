import { useEffect, useMemo, useState } from "react";
import { ArrowDown01Icon, Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  formatDateInputValue,
  getCurrentMonthDateRange,
  getDefaultDateRange,
  getRecentDateRange,
  parseDateInputValue,
  type InsightDateRange,
} from "./insights-date-range";

const presetOptions: Array<{
  label: string;
  range: () => InsightDateRange;
}> = [
  { label: "近7天", range: () => getRecentDateRange(7) },
  { label: "近30天", range: () => getDefaultDateRange() },
  { label: "本月", range: () => getCurrentMonthDateRange() },
];

const emptyCalendarRange: DateRange = {
  from: undefined,
  to: undefined,
};

export function InsightDateRangeFilter({
  from,
  onChange,
  to,
}: {
  from: string;
  onChange: (range: InsightDateRange) => void;
  to: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange>(() => toCalendarRange({ from, to }));
  const [visibleMonth, setVisibleMonth] = useState(() => getVisibleMonth({ from, to }));
  const value = useMemo(() => ({ from, to }), [from, to]);
  const label = getPresetLabel(value) ?? "自定义";
  const rangeText = formatRangeText(value);

  useEffect(() => {
    if (isOpen) {
      setDraftRange(toCalendarRange(value));
      setVisibleMonth(getVisibleMonth(value));
    }
  }, [isOpen, value]);

  function selectPreset(range: InsightDateRange) {
    setDraftRange(toCalendarRange(range));
    setVisibleMonth(getVisibleMonth(range));
  }

  function applyDraftRange() {
    const normalizedRange = normalizeCalendarRange(draftRange);

    if (!normalizedRange) {
      return;
    }

    onChange(normalizedRange);
    setIsOpen(false);
  }

  function resetToRecent30Days() {
    const range = getDefaultDateRange();

    setDraftRange(toCalendarRange(range));
    setVisibleMonth(getVisibleMonth(range));
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={`日期范围 ${label} ${rangeText}`}
          className="h-9 w-full justify-between rounded-[8px] px-3 text-left font-normal sm:w-auto sm:min-w-[17.5rem]"
          variant="outline"
        >
          <span className="flex min-w-0 items-center gap-2">
            <HugeiconsIcon
              aria-hidden="true"
              className="shrink-0 text-muted-foreground"
              icon={Calendar03Icon}
              size={16}
              strokeWidth={1.8}
            />
            <span className="min-w-0 truncate">
              <span className="font-medium text-foreground">{label}</span>
              <span className="ml-2 text-muted-foreground">{rangeText}</span>
            </span>
          </span>
          <HugeiconsIcon
            aria-hidden="true"
            className="shrink-0 text-muted-foreground"
            icon={ArrowDown01Icon}
            size={14}
            strokeWidth={1.8}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(42rem,calc(100vw-2rem))] p-0">
        <div className="grid gap-0 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
          <div className="flex gap-2 border-b p-3 sm:flex-col sm:border-b-0 sm:border-r">
            {presetOptions.map((option) => {
              const isActive = isSameDateRange(
                normalizeCalendarRange(draftRange),
                option.range(),
              );

              return (
                <Button
                  className={cn("h-8 justify-start rounded-[8px] px-2.5 text-xs", isActive && "bg-accent")}
                  key={option.label}
                  onClick={() => selectPreset(option.range())}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
          <div className="min-w-0 p-3">
            <Calendar
              month={visibleMonth}
              mode="range"
              numberOfMonths={2}
              onMonthChange={setVisibleMonth}
              onSelect={(range) => setDraftRange(range ?? emptyCalendarRange)}
              selected={draftRange}
            />
            <div className="mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                已选择{" "}
                <span className="font-medium text-foreground">
                  {formatRangeText(normalizeCalendarRange(draftRange))}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button onClick={resetToRecent30Days} size="sm" type="button" variant="ghost">
                  重置
                </Button>
                <Button
                  disabled={!normalizeCalendarRange(draftRange)}
                  onClick={applyDraftRange}
                  size="sm"
                  type="button"
                >
                  应用
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function toCalendarRange(range: InsightDateRange): DateRange {
  return {
    from: parseDateInputValue(range.from),
    to: parseDateInputValue(range.to),
  };
}

function getVisibleMonth(range: InsightDateRange) {
  const to = parseDateInputValue(range.to) ?? new Date();
  const visibleMonth = new Date(to.getFullYear(), to.getMonth(), 1);

  visibleMonth.setMonth(visibleMonth.getMonth() - 1);

  return visibleMonth;
}

function normalizeCalendarRange(range: DateRange | undefined): InsightDateRange | undefined {
  if (!range?.from || !range.to) {
    return undefined;
  }

  const from = range.from <= range.to ? range.from : range.to;
  const to = range.from <= range.to ? range.to : range.from;

  return {
    from: formatDateInputValue(from),
    to: formatDateInputValue(to),
  };
}

function formatRangeText(range: InsightDateRange | undefined) {
  if (!range) {
    return "请选择完整范围";
  }

  return `${range.from} 至 ${range.to}`;
}

function getPresetLabel(range: InsightDateRange) {
  return presetOptions.find((option) => isSameDateRange(range, option.range()))?.label;
}

function isSameDateRange(
  left: InsightDateRange | undefined,
  right: InsightDateRange | undefined,
) {
  return Boolean(left && right && left.from === right.from && left.to === right.to);
}
