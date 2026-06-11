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
  getPreviousMonthDateRange,
  getPreviousWeekDateRange,
  getRecentDateRange,
  getWeekDateRange,
  getYesterdayDateRange,
  parseDateInputValue,
  type InsightDateRange,
} from "./insights-date-range";

const defaultMaxDateRangeDays = 31;

type DateRangePresetOption = {
  label: string;
  range: () => InsightDateRange;
};

const presetOptions: DateRangePresetOption[] = [
  { label: "昨天", range: () => getYesterdayDateRange() },
  { label: "近7天", range: () => getRecentDateRange(7) },
  { label: "近30天", range: () => getDefaultDateRange() },
  { label: "本周", range: () => getWeekDateRange() },
  { label: "上周", range: () => getPreviousWeekDateRange() },
  { label: "本月", range: () => getCurrentMonthDateRange() },
  { label: "上月", range: () => getPreviousMonthDateRange() },
];

type InsightDateRangeFilterProps =
  | {
    allowEmpty?: false;
    emptyLabel?: string;
    from: string;
    maxRangeDays?: number;
    onChange: (range: InsightDateRange) => void;
    presets?: DateRangePresetOption[];
    to: string;
  }
  | {
    allowEmpty: true;
    emptyLabel?: string;
    from?: string;
    maxRangeDays?: number;
    onChange: (range: InsightDateRange | undefined) => void;
    presets?: DateRangePresetOption[];
    to?: string;
  };

export function InsightDateRangeFilter(props: InsightDateRangeFilterProps) {
  const {
    allowEmpty = false,
    emptyLabel = "选择时间",
    from,
    maxRangeDays = defaultMaxDateRangeDays,
    to,
  } = props;
  const presets = props.presets ?? presetOptions;
  const [isOpen, setIsOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange>(() => toCalendarRange(toValueRange(from, to)));
  const [draftPresetLabel, setDraftPresetLabel] = useState<string | undefined>(() =>
    getPresetLabel(toValueRange(from, to), presets),
  );
  const [selectedPresetLabel, setSelectedPresetLabel] = useState<string | undefined>(() =>
    getPresetLabel(toValueRange(from, to), presets),
  );
  const [visibleMonth, setVisibleMonth] = useState(() => getVisibleMonth(toValueRange(from, to)));
  const value = useMemo(() => from && to ? { from, to } : undefined, [from, to]);
  const label = value ? getActivePresetLabel(value, selectedPresetLabel, presets) ?? "自定义" : emptyLabel;
  const rangeText = value ? formatRangeText(value) : "";

  useEffect(() => {
    if (isOpen) {
      const nextValue = toValueRange(from, to);

      setDraftRange(toCalendarRange(nextValue));
      setDraftPresetLabel(value ? getActivePresetLabel(value, selectedPresetLabel, presets) : undefined);
      setVisibleMonth(getVisibleMonth(nextValue));
    }
  }, [from, isOpen, presets, selectedPresetLabel, to, value]);

  function selectPreset(option: DateRangePresetOption) {
    const range = option.range();

    props.onChange(range);
    setSelectedPresetLabel(option.label);
    setIsOpen(false);
  }

  function applyDraftRange() {
    const normalizedRange = normalizeCalendarRange(draftRange);

    if (!normalizedRange) {
      return;
    }

    props.onChange(normalizedRange);
    setSelectedPresetLabel(draftPresetLabel ?? getPresetLabel(normalizedRange, presets));
    setIsOpen(false);
  }

  function resetDraftRange() {
    const resetPreset = props.presets?.[0];
    const range = resetPreset?.range() ?? getDefaultDateRange();

    setDraftRange(toCalendarRange(range));
    setDraftPresetLabel(resetPreset?.label ?? "近30天");
    setVisibleMonth(getVisibleMonth(range));
  }

  function clearRange() {
    if (props.allowEmpty !== true) {
      resetDraftRange();
      return;
    }

    props.onChange(undefined);
    setSelectedPresetLabel(undefined);
    setIsOpen(false);
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={rangeText ? `日期范围 ${label} ${rangeText}` : `日期范围 ${label}`}
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
                {rangeText ? <span className="ml-2 text-muted-foreground">{rangeText}</span> : null}
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
            {presets.map((option) => {
              const isActive = isSameDateRange(
                normalizeCalendarRange(draftRange),
                option.range(),
              );

              return (
                <Button
                  className={cn("h-8 justify-start rounded-[8px] px-2.5 text-xs", isActive && "bg-accent")}
                  key={option.label}
                  onClick={() => selectPreset(option)}
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
              disabled={getDisabledDateMatcher(draftRange, maxRangeDays)}
              month={visibleMonth}
              mode="range"
              numberOfMonths={2}
              onMonthChange={setVisibleMonth}
              onSelect={(_range, triggerDate) => {
                setDraftRange((current) => getNextDraftRange(current, triggerDate));
                setDraftPresetLabel(undefined);
              }}
              selected={draftRange}
              showOutsideDays={false}
            />
            <div className="mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                已选择{" "}
                <span className="font-medium text-foreground">
                  {formatRangeText(normalizeCalendarRange(draftRange))}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button onClick={allowEmpty ? clearRange : resetDraftRange} size="sm" type="button" variant="ghost">
                  {allowEmpty ? "清除" : "重置"}
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

function toValueRange(from: string | undefined, to: string | undefined): InsightDateRange {
  return from && to ? { from, to } : getDefaultDateRange();
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

function getNextDraftRange(current: DateRange, triggerDate: Date): DateRange {
  if (!current.from || current.to) {
    return {
      from: triggerDate,
      to: undefined,
    };
  }

  return current.from <= triggerDate
    ? { from: current.from, to: triggerDate }
    : { from: triggerDate, to: current.from };
}

function getDisabledDateMatcher(range: DateRange, maxRangeDays: number) {
  if (!range.from || range.to) {
    return undefined;
  }

  const maxSelectableDate = new Date(range.from);

  maxSelectableDate.setDate(range.from.getDate() + maxRangeDays - 1);

  return [
    { before: range.from },
    { after: maxSelectableDate },
  ];
}

function formatRangeText(range: InsightDateRange | undefined) {
  if (!range) {
    return "请选择完整范围";
  }

  return `${range.from} 至 ${range.to}`;
}

function getPresetLabel(range: InsightDateRange, presets = presetOptions) {
  return presets.find((option) => isSameDateRange(range, option.range()))?.label;
}

function getActivePresetLabel(
  range: InsightDateRange,
  label: string | undefined,
  presets = presetOptions,
) {
  const option = presets.find((preset) => preset.label === label);

  if (option && isSameDateRange(range, option.range())) {
    return option.label;
  }

  return getPresetLabel(range, presets);
}

function isSameDateRange(
  left: InsightDateRange | undefined,
  right: InsightDateRange | undefined,
) {
  return Boolean(left && right && left.from === right.from && left.to === right.to);
}
