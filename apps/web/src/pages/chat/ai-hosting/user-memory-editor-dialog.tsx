import type {
  AgentUserMemoryCategory,
  AgentUserMemoryItem,
} from "@chatai/contracts";
import {
  ArrowDown01Icon,
  Calendar03Icon,
  InformationCircleIcon,
  PreferenceHorizontalIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { addDays, endOfDay, startOfDay } from "date-fns";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const USER_MEMORY_CATEGORIES = [
  {
    description: "身份背景、身体特征与稳定生活信息",
    icon: UserCircleIcon,
    label: "客户画像",
    placeholder: "例如：身高 168cm，日常穿 M 码",
    value: "customer_profile",
  },
  {
    description: "商品选择、服务方式与营销触达偏好",
    icon: PreferenceHorizontalIcon,
    label: "偏好与约束",
    placeholder: "例如：偏好宽松版型，预算在 500 元以内",
    value: "preference",
  },
  {
    description: "有明确时效的需求或购买计划",
    icon: Calendar03Icon,
    label: "近期意向",
    placeholder: "例如：下月参加婚礼，需要一套浅色礼服",
    value: "recent_intent",
  },
] satisfies Array<{
  description: string;
  icon: typeof UserCircleIcon;
  label: string;
  placeholder: string;
  value: AgentUserMemoryCategory;
}>;

export function UserMemoryEditorDialog({
  item,
  onOpenChange,
  onSave,
  open,
  saving,
}: {
  item?: AgentUserMemoryItem;
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    category: AgentUserMemoryCategory;
    content: string;
    expiresAt: number | null;
  }) => void;
  open: boolean;
  saving: boolean;
}) {
  const [category, setCategory] =
    useState<AgentUserMemoryCategory>("customer_profile");
  const [content, setContent] = useState("");
  const [expiryPreset, setExpiryPreset] =
    useState<ExpiryPreset>("30_days");
  const [customExpiryDate, setCustomExpiryDate] = useState<Date>();
  const [customCalendarOpen, setCustomCalendarOpen] = useState(false);
  const selectedCategory =
    USER_MEMORY_CATEGORIES.find((option) => option.value === category) ??
    USER_MEMORY_CATEGORIES[0];
  const today = startOfDay(new Date());

  useEffect(() => {
    if (!open) return;
    setCategory(item?.category ?? "customer_profile");
    setContent(item?.content ?? "");
    if (item?.expiresAt) {
      setExpiryPreset("custom");
      setCustomExpiryDate(new Date(item.expiresAt));
    } else {
      setExpiryPreset("30_days");
      setCustomExpiryDate(undefined);
    }
    setCustomCalendarOpen(false);
  }, [item, open]);

  function changeCategory(value: AgentUserMemoryCategory) {
    setCategory(value);
    setCustomCalendarOpen(false);
    if (value === "recent_intent" && category !== "recent_intent") {
      setExpiryPreset("30_days");
      setCustomExpiryDate(undefined);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[560px]"
        closeButtonDisabled={saving}
      >
        <DialogHeader className="border-b px-6 py-5 pr-14">
          <DialogTitle>{item ? "编辑记忆" : "创建新记忆"}</DialogTitle>
          <DialogDescription>
            记录客户的重要信息，方便后续沟通与服务
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          <fieldset>
            <legend className="mb-3 text-sm font-medium">分类</legend>
            <RadioGroup
              className="grid gap-2 sm:grid-cols-3"
              onValueChange={(value) =>
                changeCategory(value as AgentUserMemoryCategory)
              }
              value={category}
            >
              {USER_MEMORY_CATEGORIES.map((option) => {
                const selected = category === option.value;
                return (
                  <label
                    className={cn(
                      "flex min-w-0 cursor-pointer flex-col gap-2 rounded-[10px] border bg-background p-3 transition-colors hover:bg-accent/50",
                      selected &&
                        "border-primary bg-accent text-accent-foreground",
                    )}
                    key={option.value}
                  >
                    <RadioGroupItem
                      aria-label={option.label}
                      className="sr-only"
                      value={option.value}
                    />
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <HugeiconsIcon
                        aria-hidden="true"
                        icon={option.icon}
                        size={17}
                        strokeWidth={1.8}
                      />
                      {option.label}
                    </span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          </fieldset>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium" htmlFor="user-memory-content">
                记忆内容
              </label>
              <span className="text-xs text-muted-foreground">
                {content.length}/100
              </span>
            </div>
            <Textarea
              className="min-h-32 resize-none"
              id="user-memory-content"
              maxLength={100}
              onChange={(event) => setContent(event.target.value)}
              placeholder={selectedCategory.placeholder}
              value={content}
            />
          </div>

          {category === "recent_intent" ? (
            <div className="flex items-center gap-3">
              <span className="flex shrink-0 items-center gap-1">
                <span className="text-sm font-medium">有效期</span>
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="有效期说明"
                        className="size-6 rounded-full p-0 text-muted-foreground"
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={InformationCircleIcon}
                          size={14}
                          strokeWidth={1.8}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      className="max-w-none whitespace-nowrap px-3 py-2 text-left leading-5"
                      sideOffset={6}
                    >
                      到期后，这条近期意向将不再作为有效记忆使用
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
              <div
                aria-label="有效期"
                className="grid min-w-0 flex-1 grid-cols-4 gap-2"
                role="group"
              >
                {EXPIRY_PRESETS.map((preset) => (
                  <Button
                    aria-pressed={expiryPreset === preset.value}
                    className={cn(
                      "min-w-0 px-2",
                      expiryPreset === preset.value && "border-primary",
                    )}
                    key={preset.value}
                    onClick={() => {
                      setExpiryPreset(preset.value);
                      setCustomCalendarOpen(false);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {preset.label}
                  </Button>
                ))}
                <Popover
                  onOpenChange={setCustomCalendarOpen}
                  open={customCalendarOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      aria-pressed={expiryPreset === "custom"}
                      className={cn(
                        "min-w-0 gap-1 px-2",
                        expiryPreset === "custom" && "border-primary",
                      )}
                      onClick={() => setExpiryPreset("custom")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <span className="truncate">
                        {customExpiryDate
                          ? formatExpiryDate(customExpiryDate)
                          : "自定义"}
                      </span>
                      <HugeiconsIcon
                        aria-hidden="true"
                        icon={ArrowDown01Icon}
                        size={13}
                        strokeWidth={1.8}
                      />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto p-2">
                    <Calendar
                      disabled={{
                        after: addDays(today, 180),
                        before: addDays(today, 1),
                      }}
                      mode="single"
                      onSelect={(date) => {
                        if (!date) return;
                        setCustomExpiryDate(date);
                        setExpiryPreset("custom");
                        setCustomCalendarOpen(false);
                      }}
                      selected={customExpiryDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t bg-surface-muted px-6 py-4">
          <Button
            disabled={saving}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={
              saving ||
              !content.trim() ||
              (category === "recent_intent" &&
                expiryPreset === "custom" &&
                !customExpiryDate)
            }
            onClick={() =>
              onSave({
                category,
                content: content.trim(),
                expiresAt: resolveExpiryTimestamp({
                  category,
                  customExpiryDate,
                  expiryPreset,
                }),
              })
            }
          >
            {saving ? <Spinner size={16} /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ExpiryPreset = "7_days" | "30_days" | "90_days" | "custom";

const EXPIRY_PRESETS: Array<{
  days: number;
  label: string;
  value: Exclude<ExpiryPreset, "custom">;
}> = [
  { days: 7, label: "7天", value: "7_days" },
  { days: 30, label: "30天", value: "30_days" },
  { days: 90, label: "90天", value: "90_days" },
];

export function getUserMemoryCategoryLabel(
  value: AgentUserMemoryCategory,
) {
  return (
    USER_MEMORY_CATEGORIES.find((category) => category.value === value)?.label ??
    value
  );
}

function resolveExpiryTimestamp({
  category,
  customExpiryDate,
  expiryPreset,
}: {
  category: AgentUserMemoryCategory;
  customExpiryDate?: Date;
  expiryPreset: ExpiryPreset;
}) {
  if (category !== "recent_intent") return null;
  const now = new Date();
  const maxTimestamp = now.getTime() + 180 * 24 * 60 * 60 * 1000;
  const preset = EXPIRY_PRESETS.find((option) => option.value === expiryPreset);
  const expiryDate = preset
    ? addDays(now, preset.days)
    : customExpiryDate;
  if (!expiryDate) return null;
  return Math.min(endOfDay(expiryDate).getTime(), maxTimestamp);
}

function formatExpiryDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}
