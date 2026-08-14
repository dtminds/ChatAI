import {
  DEFAULT_WORKFLOW_MESSAGE_SENDING_WINDOW,
  DEFAULT_WORKFLOW_PUSH_ACCOUNT_STRATEGY,
  WORKFLOW_ENTRY_MAX_ENTRIES,
  WORKFLOW_ENTRY_WINDOW_MAX_DAYS,
  WORKFLOW_ENTRY_WINDOW_MAX_HOURS,
  type WorkflowEntryPolicy,
  type WorkflowMessageSendingWindow,
  type WorkflowPushAccountStrategy,
  type WorkflowStartEntryMode,
  type WorkflowStartTrigger,
} from "@chatai/contracts";
import { HelpCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
import { TimePicker } from "@/components/ui/time-picker";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NodeSettingsProps } from "../../panels/types";
import {
  getStartNodeSourceIds,
  isChatAiStartNodeData,
  type WorkflowNodeConfigPatch,
} from "../../types";
import {
  getWorkflowStartFixtureSeats,
  getWorkflowStartFixtureWorkUsers,
} from "./fixture-options";
import { ManagedAccountSelection } from "./managed-account-selection";
import { WecomTagSelector } from "../../../components/wecom-tag-selector";

export function StartConfig({
  allowedEntryEventTypes = [],
  node,
  onNodeChange,
  resources,
  seats,
  workUsers = getWorkflowStartFixtureWorkUsers(),
}: NodeSettingsProps<"start"> & {
  seats?: ReturnType<typeof getWorkflowStartFixtureSeats>;
  workUsers?: ReturnType<typeof getWorkflowStartFixtureWorkUsers>;
}) {
  const startData = node.data;
  const { entryPolicy, triggers } = startData;
  const entryMode = startData.entryMode ?? "event";
  const chatAiStartData = isChatAiStartNodeData(startData) ? startData : undefined;
  const isChatAi = chatAiStartData !== undefined;
  const sourceIds = getStartNodeSourceIds(startData);
  const managedAccounts = resources?.managedAccounts;
  const messageSendingWindow = chatAiStartData?.messageSendingWindow
    ?? DEFAULT_WORKFLOW_MESSAGE_SENDING_WINDOW;
  const pushAccountStrategy = chatAiStartData?.pushAccountStrategy
    ?? DEFAULT_WORKFLOW_PUSH_ACCOUNT_STRATEGY;
  const sourceOptions = isChatAi
    ? seats ?? managedAccounts?.options ?? getWorkflowStartFixtureSeats()
    : workUsers;
  const sourceLabel = isChatAi ? "托管账号" : "企微成员";
  const allowedEventTypes = new Set(allowedEntryEventTypes);
  const updateStartConfig = (patch: {
    entryMode?: WorkflowStartEntryMode;
    entryPolicy?: WorkflowEntryPolicy;
    messageSendingWindow?: WorkflowMessageSendingWindow;
    pushAccountStrategy?: WorkflowPushAccountStrategy;
    seatIds?: number[];
    triggers?: WorkflowStartTrigger[];
    workUserIds?: number[];
  }) => {
    const nextSourceIds = (isChatAi ? patch.seatIds : patch.workUserIds) ?? sourceIds;
    const nextEntryMode = patch.entryMode ?? entryMode;
    const nextTriggers = patch.triggers ?? triggers;
    const configured = nextSourceIds.length > 0
      && (nextEntryMode === "audience-import" || nextTriggers.length > 0);
    onNodeChange({
      ...patch,
      metric: configured
        ? `${nextSourceIds.length} 个${sourceLabel} · ${nextEntryMode === "audience-import" ? "导入人群" : `${nextTriggers.length} 个触发条件`}`
        : "待配置进入方式",
      status: configured ? "ready" : "warning",
    } as WorkflowNodeConfigPatch<"start">);
  };
  return (
    <div className="-mx-1 -mt-1">
      <section>
        <h3 className="px-1 py-3 text-[15px] font-semibold text-foreground">
          {sourceLabel}
        </h3>
        <div className="pb-3">
          {isChatAi ? (
            <div className="px-1 pt-1">
              <ManagedAccountSelection
                onRetry={managedAccounts?.reload}
                onToggle={(id, checked) => updateStartConfig({
                  seatIds: toggleValue(sourceIds, id, checked),
                })}
                options={sourceOptions}
                selectedIds={sourceIds}
                status={managedAccounts?.status ?? "ready"}
              />
            </div>
          ) : (
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
                    workUserIds: toggleValue(sourceIds, option.id, checked),
                  })}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="px-1">
        <section className="pb-3">
          <h3 className="py-3 text-[15px] font-semibold text-foreground">进入方式</h3>
          <RadioGroup
            aria-label="进入方式"
            className="flex items-center gap-6"
            onValueChange={(mode) => {
              if (mode === "event" || mode === "audience-import") {
                updateStartConfig({ entryMode: mode, triggers: [] });
              }
            }}
            value={entryMode}
          >
            <label className="flex items-center gap-2 text-[13px] text-foreground">
              <RadioGroupItem value="event" />
              <span>事件触发</span>
            </label>
            <label className="flex items-center gap-2 text-[13px] text-foreground">
              <RadioGroupItem value="audience-import" />
              <span>导入人群</span>
            </label>
          </RadioGroup>
        </section>

        {entryMode === "event" ? (
          <section className="pb-3">
            <div className="space-y-5 rounded-[8px] border bg-card p-3">
            <div className="space-y-2.5">
              <p className="text-[13px] font-medium text-foreground">选择事件</p>
              <Select
                onValueChange={(eventType) => updateStartConfig({
                  triggers: [createTrigger(eventType as WorkflowStartTrigger["type"])],
                })}
                value={triggers[0]?.type}
              >
                <SelectTrigger
                  aria-label="选择事件"
                  className="h-9 w-full px-3 text-[13px]"
                  variant="soft"
                >
                  <SelectValue placeholder="请选择事件" />
                </SelectTrigger>
                <SelectContent>
                  {allowedEventTypes.has("contact.friend_added") ? (
                    <SelectItem value="contact.friend_added">添加好友</SelectItem>
                  ) : null}
                  {allowedEventTypes.has("contact.tag_added") ? (
                    <SelectItem value="contact.tag_added">
                      添加标签
                    </SelectItem>
                  ) : null}
                  {allowedEventTypes.has("message.received") ? (
                    <SelectItem value="message.received">用户发送消息</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>

            {hasTrigger(triggers, "contact.friend_added") ? (
              <TriggerParameter label="添加好友来源">
                <CommaSeparatedTriggerInput
                  ariaLabel="添加好友来源 ID"
                  onCommit={(sourceIds) => updateStartConfig({
                    triggers: [{ sourceIds, type: "contact.friend_added" }],
                  })}
                  placeholder="输入来源 ID，多个用英文逗号分隔"
                  values={getFriendSourceIds(triggers)}
                />
              </TriggerParameter>
            ) : null}
            {hasTrigger(triggers, "contact.tag_added") ? (
              <TriggerParameter label="选择标签">
                <WecomTagSelector
                  allowCrossGroup
                  maxSelected={5}
                  multiple
                  onChange={(tagIds) => updateStartConfig({
                    triggers: [{ tagIds, type: "contact.tag_added" }],
                  })}
                  value={getTagIds(triggers)}
                />
              </TriggerParameter>
            ) : null}
            {hasTrigger(triggers, "message.received") ? (
              <TriggerParameter label="消息关键词">
                <CommaSeparatedTriggerInput
                  ariaLabel="消息关键词"
                  onCommit={(keywords) => updateStartConfig({
                    triggers: [{ keywords, type: "message.received" }],
                  })}
                  placeholder="输入关键词，多个用英文逗号分隔"
                  values={getMessageKeywords(triggers)}
                />
              </TriggerParameter>
            ) : null}
            </div>
          </section>
        ) : (
          <p className="pb-3 text-[13px] leading-5 text-muted-foreground" role="note">
            发布后可在右上角点击“人群导入”按钮进行导入
          </p>
        )}
      </div>

      <section>
        <h3 className="px-1 py-3 text-[15px] font-semibold text-foreground">
          进入限制
        </h3>
        <div className="px-1 pb-3">
          <RadioGroup
            aria-label="进入限制"
            onValueChange={(mode) => updateStartConfig({ entryPolicy: createEntryPolicy(mode) })}
            value={entryPolicy.mode}
          >
            <RadioRow label="不允许重复进入" value="never" />
            <RadioRow inline label="每个客户最多进入" value="lifetime_limit">
              <EntryCountSelect
                ariaLabel="最多进入次数"
                disabled={entryPolicy.mode !== "lifetime_limit"}
                onChange={(maxEntries) => updateStartConfig({
                  entryPolicy: { maxEntries, mode: "lifetime_limit" },
                })}
                value={entryPolicy.mode === "lifetime_limit" ? entryPolicy.maxEntries : 1}
              />
            </RadioRow>
            <RadioRow label="周期进入限制" value="rolling_window">
              <RollingWindowControls
                disabled={entryPolicy.mode !== "rolling_window"}
                onChange={(nextPolicy) => updateStartConfig({ entryPolicy: nextPolicy })}
                value={entryPolicy.mode === "rolling_window"
                  ? entryPolicy
                  : createRollingWindowEntryPolicy()}
              />
            </RadioRow>
          </RadioGroup>
        </div>
      </section>

      {isChatAi ? (
        <>
          <section>
            <div className="flex items-center gap-1.5 px-1 py-3">
              <h3 className="text-[15px] font-semibold text-foreground">消息发送时段</h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="查看消息发送时段说明"
                      className="size-5 rounded-full p-0 text-muted-foreground"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon icon={HelpCircleIcon} size={15} strokeWidth={1.8} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-80" side="top" sideOffset={6}>
                    <ol className="list-decimal space-y-1 pl-4">
                      <li>消息仅在每日设置的有效时段内发送，时段外不会立即触发</li>
                      <li>若消息节点在时段外到达，系统会延迟到下一个允许发送的时间段再发送，降低打扰风险</li>
                    </ol>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="px-1 pb-3">
              <div className="flex items-center gap-2">
                <TimePicker
                  aria-label="消息发送开始时间"
                  className="min-w-0 flex-1"
                  onValueChange={(startTime) => updateStartConfig({
                    messageSendingWindow: { ...messageSendingWindow, startTime },
                  })}
                  value={messageSendingWindow.startTime}
                  variant="secondary"
                />
                <span className="shrink-0 text-[13px] text-muted-foreground">至</span>
                <TimePicker
                  aria-label="消息发送结束时间"
                  className="min-w-0 flex-1"
                  onValueChange={(endTime) => updateStartConfig({
                    messageSendingWindow: { ...messageSendingWindow, endTime },
                  })}
                  value={messageSendingWindow.endTime}
                  variant="secondary"
                />
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-1.5 px-1 py-3">
              <h3 className="text-[15px] font-semibold text-foreground">推送账号</h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="查看推送账号说明"
                      className="size-5 rounded-full p-0 text-muted-foreground"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon icon={HelpCircleIcon} size={15} strokeWidth={1.8} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-80" side="top" sideOffset={6}>
                    若 SOP 中包含发送消息、转人工等节点，会优先由客户的专属服务官执行。若所选托管账号均不是客户的专属服务官，则按以下优先级选择
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="px-1 pb-3">
              <RadioGroup
                className="flex items-center gap-6"
                onValueChange={(strategy) => updateStartConfig({
                  pushAccountStrategy: strategy as WorkflowPushAccountStrategy,
                })}
                value={pushAccountStrategy}
              >
                <label className="flex items-center gap-2 text-[13px] text-foreground">
                  <RadioGroupItem value="earliest-added" />
                  <span>优先最早添加的账号</span>
                </label>
                <label className="flex items-center gap-2 text-[13px] text-foreground">
                  <RadioGroupItem value="latest-added" />
                  <span>优先最新添加的账号</span>
                </label>
              </RadioGroup>
            </div>
          </section>
        </>
      ) : null}
    </div>
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

function TriggerParameter({ children, label }: {
  children?: ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-[13px] font-medium text-foreground">{label}</p>
      {children}
    </div>
  );
}

function CommaSeparatedTriggerInput({ ariaLabel, onCommit, placeholder, values }: {
  ariaLabel: string;
  onCommit(values: string[]): void;
  placeholder: string;
  values: string[];
}) {
  const serializedValues = values.join(",");
  const [text, setText] = useState(serializedValues);
  useEffect(() => setText(serializedValues), [serializedValues]);
  return (
    <Input
      aria-label={ariaLabel}
      className="h-9 px-3 text-[13px]"
      onBlur={() => {
        const normalized = normalizeCommaSeparatedValues(text);
        setText(normalized.join(","));
        onCommit(normalized);
      }}
      onChange={event => setText(event.target.value)}
      placeholder={placeholder}
      value={text}
      variant="soft"
    />
  );
}

function RadioRow({ children, inline = false, label, value }: {
  children?: ReactNode;
  inline?: boolean;
  label: string;
  value: WorkflowEntryPolicy["mode"];
}) {
  return (
    <div className={inline ? "flex items-center gap-2" : "space-y-2"}>
      <label className="flex items-center gap-2 text-[13px] text-foreground">
        <RadioGroupItem value={value} />
        <span>{label}</span>
      </label>
      {children}
    </div>
  );
}

function EntryCountSelect({ ariaLabel, disabled = false, onChange, value }: {
  ariaLabel: string;
  disabled?: boolean;
  onChange(value: number): void;
  value: number;
}) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(nextValue) => onChange(Number(nextValue))}
      value={String(value)}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-9 w-[82px] shrink-0 px-3 text-[13px]"
        variant="soft"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: WORKFLOW_ENTRY_MAX_ENTRIES }, (_, index) => index + 1).map(count => (
          <SelectItem key={count} value={String(count)}>{count}次</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RollingWindowControls({ disabled, onChange, value }: {
  disabled: boolean;
  onChange(value: Extract<WorkflowEntryPolicy, { mode: "rolling_window" }>): void;
  value: Extract<WorkflowEntryPolicy, { mode: "rolling_window" }>;
}) {
  return (
    <div className="ml-6 flex items-center gap-2 whitespace-nowrap">
      <NumberInput
        ariaLabel="时间范围"
        disabled={disabled}
        max={getRollingWindowMaximum(value.windowUnit)}
        onChange={(windowSize) => onChange({ ...value, windowSize })}
        value={value.windowSize}
      />
      <Select
        disabled={disabled}
        onValueChange={(windowUnit: "hour" | "day") => onChange({
          ...value,
          windowSize: Math.min(value.windowSize, getRollingWindowMaximum(windowUnit)),
          windowUnit,
        })}
        value={value.windowUnit}
      >
        <SelectTrigger
          aria-label="时间单位"
          className="h-9 w-[92px] shrink-0 px-3 text-[13px]"
          variant="soft"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="hour">小时</SelectItem>
          <SelectItem value="day">天</SelectItem>
        </SelectContent>
      </Select>
      <span className="text-[13px] text-foreground">内最多进入</span>
      <EntryCountSelect
        ariaLabel="时间范围内最多进入次数"
        disabled={disabled}
        onChange={(maxEntries) => onChange({ ...value, maxEntries })}
        value={value.maxEntries}
      />
    </div>
  );
}

function NumberInput({ ariaLabel, disabled = false, max, onChange, value }: {
  ariaLabel: string;
  disabled?: boolean;
  max: number;
  onChange(value: number): void;
  value: number;
}) {
  return (
    <Input
      aria-label={ariaLabel}
      className="h-9 w-[70px] shrink-0 px-2.5"
      disabled={disabled}
      max={max}
      min={1}
      onChange={(event) => {
        const nextValue = Math.trunc(Number(event.target.value)) || 1;
        onChange(Math.min(max, Math.max(1, nextValue)));
      }}
      step={1}
      type="number"
      value={value}
      variant="soft"
    />
  );
}

function createEntryPolicy(mode: string): WorkflowEntryPolicy {
  if (mode === "never") return { mode: "never" };
  if (mode === "rolling_window") return createRollingWindowEntryPolicy();
  return { maxEntries: 1, mode: "lifetime_limit" };
}

function createRollingWindowEntryPolicy(): Extract<WorkflowEntryPolicy, { mode: "rolling_window" }> {
  return { maxEntries: 1, mode: "rolling_window", windowSize: 7, windowUnit: "day" };
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

function createTrigger(type: WorkflowStartTrigger["type"]): WorkflowStartTrigger {
  if (type === "contact.friend_added") return { sourceIds: [], type };
  if (type === "contact.tag_added") return { tagIds: [], type };
  return { keywords: [], type };
}

function getFriendSourceIds(triggers: WorkflowStartTrigger[]) {
  return triggers.find(trigger => trigger.type === "contact.friend_added")?.sourceIds ?? [];
}

function getTagIds(triggers: WorkflowStartTrigger[]) {
  return triggers.find(trigger => trigger.type === "contact.tag_added")?.tagIds ?? [];
}

function getMessageKeywords(triggers: WorkflowStartTrigger[]) {
  return triggers.find(trigger => trigger.type === "message.received")?.keywords ?? [];
}

function normalizeCommaSeparatedValues(value: string) {
  return [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
}
