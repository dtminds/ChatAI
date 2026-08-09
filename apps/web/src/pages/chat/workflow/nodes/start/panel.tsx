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
  getWorkflowStartFixtureAccounts,
  getWorkflowStartFixtureTags,
} from "./fixture-options";

export function StartConfig({
  accounts = getWorkflowStartFixtureAccounts(),
  node,
  onNodeChange,
  tags = getWorkflowStartFixtureTags(),
}: NodeSettingsProps<"start"> & {
  accounts?: ReturnType<typeof getWorkflowStartFixtureAccounts>;
  tags?: ReturnType<typeof getWorkflowStartFixtureTags>;
}) {
  const { accountIds, entryPolicy, triggers } = node.data;
  const updateStartConfig = (patch: {
    accountIds?: string[];
    entryPolicy?: WorkflowEntryPolicy;
    triggers?: WorkflowStartTrigger[];
  }) => {
    const nextAccountIds = patch.accountIds ?? accountIds;
    const nextTriggers = patch.triggers ?? triggers;
    const configured = nextAccountIds.length > 0 && nextTriggers.length > 0;
    onNodeChange({
      ...patch,
      metric: configured
        ? `${nextAccountIds.length} 个账号 · ${nextTriggers.length} 个触发条件`
        : "待配置触发条件",
      status: configured ? "ready" : "warning",
    });
  };
  return (
    <Accordion
      className="-mx-1 -mt-1"
      defaultValue={["accounts", "triggers", "entry-policy"]}
      type="multiple"
    >
      <AccordionItem className="border-b-0" value="accounts">
        <AccordionTrigger className="items-center px-1 py-3 text-[15px] font-semibold text-foreground">
          托管账号
        </AccordionTrigger>
        <AccordionContent className="pb-3">
          <div className="space-y-2 rounded-[8px] border bg-card p-3">
            {accounts.length === 0 ? (
              <p className="py-2 text-center text-[13px] text-muted-foreground">暂无可用托管账号</p>
            ) : accounts.map(account => (
              <CheckboxRow
                checked={accountIds.includes(account.id)}
                key={account.id}
                label={account.label}
                onCheckedChange={(checked) => updateStartConfig({
                  accountIds: toggleValue(accountIds, account.id, checked),
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
            <TriggerCheckbox
              checked={hasTrigger(triggers, "contact.friend_added")}
              label="添加好友"
              onCheckedChange={(checked) => updateStartConfig({
                triggers: toggleTrigger(triggers, "contact.friend_added", checked),
              })}
            />
            <TriggerCheckbox
              checked={hasTrigger(triggers, "customer.tag_added")}
              disabled={tags.length === 0 && !hasTrigger(triggers, "customer.tag_added")}
              label="添加标签"
              onCheckedChange={(checked) => updateStartConfig({
                triggers: toggleTrigger(triggers, "customer.tag_added", checked),
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
            <TriggerCheckbox
              checked={hasMessageTrigger(triggers, "any")}
              label="用户发送消息"
              onCheckedChange={(checked) => updateStartConfig({
                triggers: toggleMessageTrigger(triggers, "any", checked),
              })}
            />
            <TriggerCheckbox
              checked={hasMessageTrigger(triggers, "keywords")}
              label="消息包含关键词"
              onCheckedChange={(checked) => updateStartConfig({
                triggers: toggleMessageTrigger(triggers, "keywords", checked),
              })}
            >
              <Input
                aria-label="消息关键词"
                className="ml-6 w-[calc(100%-1.5rem)]"
                onChange={(event) => updateStartConfig({
                  triggers: updateKeywords(triggers, event.target.value),
                })}
                placeholder="多个关键词用逗号分隔"
                value={getKeywords(triggers).join(", ")}
              />
            </TriggerCheckbox>
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

function toggleValue(values: string[], value: string, checked: boolean) {
  return checked ? [...new Set([...values, value])] : values.filter(item => item !== value);
}

function hasTrigger(triggers: WorkflowStartTrigger[], type: WorkflowStartTrigger["type"]) {
  return triggers.some(trigger => trigger.type === type);
}

function toggleTrigger(
  triggers: WorkflowStartTrigger[],
  type: "contact.friend_added" | "customer.tag_added",
  checked: boolean,
) {
  const remaining = triggers.filter(trigger => trigger.type !== type);
  if (!checked) return remaining;
  return type === "contact.friend_added"
    ? [...remaining, { type }]
    : [...remaining, { tagIds: [], type }];
}

function getTagIds(triggers: WorkflowStartTrigger[]) {
  return triggers.find(trigger => trigger.type === "customer.tag_added")?.tagIds ?? [];
}

function updateTagTrigger(triggers: WorkflowStartTrigger[], tagId: string, checked: boolean) {
  const tagIds = toggleValue(getTagIds(triggers), tagId, checked);
  const remaining = triggers.filter(trigger => trigger.type !== "customer.tag_added");
  return tagIds.length ? [...remaining, { tagIds, type: "customer.tag_added" as const }] : remaining;
}

function hasMessageTrigger(triggers: WorkflowStartTrigger[], match: "any" | "keywords") {
  return triggers.some(trigger => trigger.type === "message.received" && trigger.match === match);
}

function toggleMessageTrigger(
  triggers: WorkflowStartTrigger[],
  match: "any" | "keywords",
  checked: boolean,
) {
  const remaining = triggers.filter(trigger =>
    trigger.type !== "message.received" || trigger.match !== match,
  );
  if (!checked) return remaining;
  return match === "any"
    ? [...remaining, { match, type: "message.received" as const }]
    : [...remaining, { keywords: [], match, type: "message.received" as const }];
}

function getKeywords(triggers: WorkflowStartTrigger[]) {
  const trigger = triggers.find(item => item.type === "message.received" && item.match === "keywords");
  return trigger?.match === "keywords" ? trigger.keywords : [];
}

function updateKeywords(triggers: WorkflowStartTrigger[], value: string) {
  const keywords = [...new Set(value.split(/[,，]/).map(item => item.trim()).filter(Boolean))];
  const remaining = triggers.filter(trigger =>
    trigger.type !== "message.received" || trigger.match !== "keywords",
  );
  return [...remaining, { keywords, match: "keywords" as const, type: "message.received" as const }];
}
