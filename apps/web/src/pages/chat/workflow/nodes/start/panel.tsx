import {
  WORKFLOW_ENTRY_WINDOW_MAX_DAYS,
  WORKFLOW_ENTRY_WINDOW_MAX_HOURS,
  type WorkflowEntryPolicy,
  type WorkflowStartTrigger,
} from "@chatai/contracts";
import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NodeSettingsProps } from "../../panels/types";
import {
  getStartNodeSourceIds,
  isChatAiStartNodeData,
  type WorkflowNodeConfigPatch,
} from "../../types";
import {
  getWorkflowStartFixtureSeats,
  getWorkflowStartFixtureTags,
  getWorkflowStartFixtureWorkUsers,
} from "./fixture-options";

export function StartConfig({
  allowedEntryEventTypes = [],
  node,
  onNodeChange,
  seats = getWorkflowStartFixtureSeats(),
  tags = getWorkflowStartFixtureTags(),
  workUsers = getWorkflowStartFixtureWorkUsers(),
}: NodeSettingsProps<"start"> & {
  seats?: ReturnType<typeof getWorkflowStartFixtureSeats>;
  tags?: ReturnType<typeof getWorkflowStartFixtureTags>;
  workUsers?: ReturnType<typeof getWorkflowStartFixtureWorkUsers>;
}) {
  const { entryPolicy, triggers } = node.data;
  const isChatAi = isChatAiStartNodeData(node.data);
  const sourceIds = getStartNodeSourceIds(node.data);
  const sourceOptions = isChatAi ? seats : workUsers;
  const sourceLabel = isChatAi ? "席位" : "企微成员";
  const allowedEventTypes = new Set(allowedEntryEventTypes);
  const updateStartConfig = (patch: {
    entryPolicy?: WorkflowEntryPolicy;
    seatIds?: number[];
    triggers?: WorkflowStartTrigger[];
    workUserIds?: number[];
  }) => {
    const nextSourceIds = (isChatAi ? patch.seatIds : patch.workUserIds) ?? sourceIds;
    const nextTriggers = patch.triggers ?? triggers;
    const configured = nextSourceIds.length > 0 && nextTriggers.length > 0;
    onNodeChange({
      ...patch,
      metric: configured
        ? `${nextSourceIds.length} 个${sourceLabel} · ${nextTriggers.length} 个触发条件`
        : "待配置触发条件",
      status: configured ? "ready" : "warning",
    } as WorkflowNodeConfigPatch<"start">);
  };
  return (
    <Accordion
      className="-mx-1 -mt-1"
      defaultValue={["sources", "triggers", "entry-policy"]}
      type="multiple"
    >
      <AccordionItem className="border-b-0" value="sources">
        <AccordionTrigger className="items-center px-1 py-3 text-[15px] font-semibold text-foreground">
          {sourceLabel}
        </AccordionTrigger>
        <AccordionContent className="pb-3">
          <div className="space-y-2 rounded-[8px] border bg-card p-3">
            {sourceOptions.length === 0 ? (
              <p className="py-2 text-center text-[13px] text-muted-foreground">
                暂无可用{sourceLabel}
              </p>
            ) : sourceOptions.map(option => (
              <CheckboxRow
                checked={sourceIds.includes(option.id)}
                key={option.id}
                label={option.label}
                onCheckedChange={(checked) => updateStartConfig({
                  ...(isChatAi
                    ? { seatIds: toggleValue(sourceIds, option.id, checked) }
                    : { workUserIds: toggleValue(sourceIds, option.id, checked) }),
                })}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem className="border-b-0" value="triggers">
        <AccordionTrigger className="items-center px-1 py-3 text-[15px] font-semibold text-foreground">
          触发条件
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pb-3">
          <div className="space-y-3 rounded-[8px] border bg-card p-3">
            {allowedEventTypes.has("contact.friend_added") ? (
              <TriggerCheckbox
                checked={hasTrigger(triggers, "contact.friend_added")}
                label="添加好友"
                onCheckedChange={(checked) => updateStartConfig({
                  triggers: toggleTrigger(triggers, "contact.friend_added", checked),
                })}
              />
            ) : null}
            {allowedEventTypes.has("contact.tag_added") ? (
              <TriggerCheckbox
                checked={hasTrigger(triggers, "contact.tag_added")}
                disabled={tags.length === 0 && !hasTrigger(triggers, "contact.tag_added")}
                label="添加标签"
                onCheckedChange={(checked) => updateStartConfig({
                  triggers: toggleTrigger(triggers, "contact.tag_added", checked),
                })}
              >
                <div className="ml-6 space-y-2">
                  {tags.map(tag => (
                    <CheckboxRow
                      checked={getTagIds(triggers).includes(tag.id)}
                      key={tag.id}
                      label={tag.label}
                      onCheckedChange={(checked) => updateStartConfig({
                        triggers: updateTagTrigger(triggers, tag.id, checked),
                      })}
                    />
                  ))}
                  {tags.length === 0 ? (
                    <p className="py-2 text-center text-[13px] text-muted-foreground">暂无可用标签</p>
                  ) : null}
                </div>
              </TriggerCheckbox>
            ) : null}
            {allowedEventTypes.has("message.received") ? (
              <TriggerCheckbox
                checked={hasTrigger(triggers, "message.received")}
                label="用户发送消息"
                onCheckedChange={(checked) => updateStartConfig({
                  triggers: toggleMessageTrigger(triggers, checked),
                })}
              />
            ) : null}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem className="border-b-0" value="entry-policy">
        <AccordionTrigger className="items-center px-1 py-3 text-[15px] font-semibold text-foreground">
          进入限制
        </AccordionTrigger>
        <AccordionContent className="pb-3">
          <RadioGroup
            className="rounded-[8px] border bg-card p-3"
            onValueChange={(mode) => updateStartConfig({ entryPolicy: createEntryPolicy(mode) })}
            value={entryPolicy.mode}
          >
            <RadioRow label="不允许重复进入" value="never" />
            <RadioRow label="最多进入 M 次" value="lifetime_limit">
              {entryPolicy.mode === "lifetime_limit" ? (
                <NumberInput
                  ariaLabel="最多进入次数"
                  max={1_000}
                  onChange={(maxEntries) => updateStartConfig({
                    entryPolicy: { maxEntries, mode: "lifetime_limit" },
                  })}
                  value={entryPolicy.maxEntries}
                />
              ) : null}
            </RadioRow>
            <RadioRow label="时间范围内限制" value="rolling_window">
              {entryPolicy.mode === "rolling_window" ? (
                <div className="ml-6 grid grid-cols-[70px_1fr_70px] items-center gap-2">
                  <NumberInput
                    ariaLabel="时间范围"
                    max={getRollingWindowMaximum(entryPolicy.windowUnit)}
                    onChange={(windowSize) => updateStartConfig({
                      entryPolicy: { ...entryPolicy, windowSize },
                    })}
                    value={entryPolicy.windowSize}
                  />
                  <Select
                    onValueChange={(windowUnit: "hour" | "day") => updateStartConfig({
                      entryPolicy: {
                        ...entryPolicy,
                        windowSize: Math.min(
                          entryPolicy.windowSize,
                          getRollingWindowMaximum(windowUnit),
                        ),
                        windowUnit,
                      },
                    })}
                    value={entryPolicy.windowUnit}
                  >
                    <SelectTrigger aria-label="时间单位" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hour">小时</SelectItem>
                      <SelectItem value="day">天</SelectItem>
                    </SelectContent>
                  </Select>
                  <NumberInput
                    ariaLabel="时间范围内最多进入次数"
                    max={1_000}
                    onChange={(maxEntries) => updateStartConfig({
                      entryPolicy: { ...entryPolicy, maxEntries },
                    })}
                    value={entryPolicy.maxEntries}
                  />
                </div>
              ) : null}
            </RadioRow>
          </RadioGroup>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function CheckboxRow({ checked, disabled = false, label, onCheckedChange }: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange(checked: boolean): void;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-foreground">
      <Checkbox
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={value => onCheckedChange(value === true)}
      />
      <span>{label}</span>
    </label>
  );
}

function TriggerCheckbox({ checked, children, disabled = false, label, onCheckedChange }: {
  checked: boolean;
  children?: ReactNode;
  disabled?: boolean;
  label: string;
  onCheckedChange(checked: boolean): void;
}) {
  return (
    <div className="space-y-2">
      <CheckboxRow
        checked={checked}
        disabled={disabled}
        label={label}
        onCheckedChange={onCheckedChange}
      />
      {checked ? children : null}
    </div>
  );
}

function RadioRow({ children, label, value }: {
  children?: ReactNode;
  label: string;
  value: WorkflowEntryPolicy["mode"];
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-[13px] text-foreground">
        <RadioGroupItem value={value} />
        <span>{label}</span>
      </label>
      {children}
    </div>
  );
}

function NumberInput({ ariaLabel, max, onChange, value }: {
  ariaLabel: string;
  max: number;
  onChange(value: number): void;
  value: number;
}) {
  return (
    <Input
      aria-label={ariaLabel}
      className="h-9 px-2.5"
      max={max}
      min={1}
      onChange={(event) => {
        const nextValue = Math.trunc(Number(event.target.value)) || 1;
        onChange(Math.min(max, Math.max(1, nextValue)));
      }}
      step={1}
      type="number"
      value={value}
    />
  );
}

function createEntryPolicy(mode: string): WorkflowEntryPolicy {
  if (mode === "never") return { mode: "never" };
  if (mode === "rolling_window") {
    return { maxEntries: 2, mode: "rolling_window", windowSize: 7, windowUnit: "day" };
  }
  return { maxEntries: 2, mode: "lifetime_limit" };
}

function getRollingWindowMaximum(unit: "hour" | "day") {
  return unit === "hour" ? WORKFLOW_ENTRY_WINDOW_MAX_HOURS : WORKFLOW_ENTRY_WINDOW_MAX_DAYS;
}

function toggleValue(values: number[], value: number, checked: boolean) {
  return checked ? [...new Set([...values, value])] : values.filter(item => item !== value);
}

function hasTrigger(triggers: WorkflowStartTrigger[], type: WorkflowStartTrigger["type"]) {
  return triggers.some(trigger => trigger.type === type);
}

function toggleTrigger(
  triggers: WorkflowStartTrigger[],
  type: "contact.friend_added" | "contact.tag_added",
  checked: boolean,
) {
  const remaining = triggers.filter(trigger => trigger.type !== type);
  if (!checked) return remaining;
  return type === "contact.friend_added"
    ? [...remaining, { type }]
    : [...remaining, { tagIds: [], type }];
}

function getTagIds(triggers: WorkflowStartTrigger[]) {
  return triggers.find(trigger => trigger.type === "contact.tag_added")?.tagIds ?? [];
}

function updateTagTrigger(triggers: WorkflowStartTrigger[], tagId: number, checked: boolean) {
  const tagIds = toggleValue(getTagIds(triggers), tagId, checked);
  const remaining = triggers.filter(trigger => trigger.type !== "contact.tag_added");
  return tagIds.length ? [...remaining, { tagIds, type: "contact.tag_added" as const }] : remaining;
}

function toggleMessageTrigger(
  triggers: WorkflowStartTrigger[],
  checked: boolean,
) {
  const remaining = triggers.filter(trigger => trigger.type !== "message.received");
  if (!checked) return remaining;
  return [...remaining, { match: "any" as const, type: "message.received" as const }];
}
