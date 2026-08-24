import { useEffect, useState } from "react";
import {
  Add01Icon,
  Cancel01Icon,
  Delete01Icon,
  DragDropVerticalIcon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
} from "@/components/ui/sortable";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import type {
  AiCollectNodeData,
  WorkflowAiCollectField,
  WorkflowAiCollectFieldType,
  WorkflowAiCollectTimeout,
} from "../../types";
import { WorkflowVariableSelect } from "../../workflow-variable-select";
import { getAvailableIntentInputOutputsForNode } from "../../workflow-variables";
import {
  AI_COLLECT_FIELD_MAX_COUNT,
  AI_COLLECT_FIELD_MIN_COUNT,
  AI_COLLECT_FIELD_NAME_MAX_LENGTH,
  AI_COLLECT_INSTRUCTION_MAX_LENGTH,
  AI_COLLECT_MAX_FOLLOW_UP_COUNT,
  AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH,
  AI_COLLECT_TIMEOUT_MAX_BY_UNIT,
  aiCollectFieldTemplates,
  aiCollectFieldTypeLabels,
  createAiCollectField,
  getAiCollectMetric,
  getAiCollectStatus,
  normalizeAiCollectFields,
  normalizeAiCollectInputSelector,
  normalizeAiCollectMaxFollowUpCount,
  normalizeAiCollectOpeningMessage,
  normalizeAiCollectTimeout,
} from "./config";

const fieldTypes = Object.keys(aiCollectFieldTypeLabels) as WorkflowAiCollectFieldType[];
const followUpCountOptions = Array.from(
  { length: AI_COLLECT_MAX_FOLLOW_UP_COUNT },
  (_, index) => index + 1,
);

export function AiCollectConfig({ edges, node, nodes, onNodeChange }: NodeSettingsProps<"ai-collect">) {
  const fields = normalizeAiCollectFields(node.data.fields);
  const inputSelector = normalizeAiCollectInputSelector(node.data.inputSelector);
  const maxFollowUpCount = normalizeAiCollectMaxFollowUpCount(node.data.maxFollowUpCount);
  const openingMessage = normalizeAiCollectOpeningMessage(node.data.openingMessage);
  const timeout = normalizeAiCollectTimeout(node.data.timeout);
  const inputOptions = getAvailableIntentInputOutputsForNode(node.id, nodes, edges);

  const updateConfig = ({
    fields: nextFields = fields,
    inputSelector: nextInputSelector = inputSelector,
    maxFollowUpCount: nextMaxFollowUpCount = maxFollowUpCount,
    openingMessage: nextOpeningMessage = openingMessage,
    timeout: nextTimeout = timeout,
  }: Partial<Pick<
    AiCollectNodeData,
    "fields" | "inputSelector" | "maxFollowUpCount" | "openingMessage" | "timeout"
  >>) => {
    const nextData = {
      fields: nextFields,
      inputSelector: nextInputSelector,
      maxFollowUpCount: nextMaxFollowUpCount,
      openingMessage: nextOpeningMessage,
      timeout: nextTimeout,
    };
    onNodeChange({
      ...nextData,
      metric: getAiCollectMetric(nextData),
      status: getAiCollectStatus(nextData),
    });
  };

  const addField = (template?: (typeof aiCollectFieldTemplates)[number]) => {
    if (fields.length >= AI_COLLECT_FIELD_MAX_COUNT) return;
    const onlyField = fields.length === 1 ? fields[0] : undefined;
    if (template && onlyField && !onlyField.name.trim() && !onlyField.instruction.trim()) {
      updateConfig({ fields: [{ ...onlyField, ...template, id: onlyField.id }] });
      return;
    }
    updateConfig({ fields: [...fields, createAiCollectField(fields, template)] });
  };

  const updateField = (fieldId: string, patch: Partial<WorkflowAiCollectField>) => {
    updateConfig({
      fields: fields.map(field => field.id === fieldId
        ? { ...field, ...patch, id: field.id }
        : field),
    });
  };

  return (
    <>
      <WorkflowSettingsSection
        title={maxFollowUpCount === 0 ? (
          <>输入<span aria-hidden="true" className="ml-0.5 text-destructive">*</span></>
        ) : "输入"}
      >
        <div className="flex items-center gap-2">
          <WorkflowVariableSelect
            ariaLabel="输入"
            buttonClassName="h-10"
            invalidLabel="原节点输出不可用"
            onSelect={variable => updateConfig({ inputSelector: variable.selector })}
            placeholder="请选择前序节点输出"
            value={inputSelector}
            variables={inputOptions}
          />
          {maxFollowUpCount > 0 && inputSelector ? (
            <Button
              aria-label="清除输入"
              className="size-9 shrink-0 p-0 text-muted-foreground"
              onClick={() => updateConfig({ inputSelector: undefined })}
              size="sm"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
            </Button>
          ) : null}
        </div>
      </WorkflowSettingsSection>

      <WorkflowSettingsSection
        title="开场白"
        titleAccessory={(
          <SectionInfoTooltip
            label="开场白"
            text="配置后，运行到该节点时会先向客户发送这条消息；如果前序节点已发送开场消息，可以留空"
          />
        )}
      >
        <div className="relative">
          <Textarea
            aria-label="开场白"
            className="h-20 min-h-20 resize-none pb-7"
            maxLength={AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH}
            onChange={event => updateConfig({ openingMessage: event.target.value })}
            placeholder="请输入收集引导话术"
            rows={2}
            value={openingMessage}
          />
          <span className="pointer-events-none absolute bottom-2.5 right-3 text-xs text-muted-foreground">
            {openingMessage.length}/{AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH}
          </span>
        </div>
      </WorkflowSettingsSection>

      <WorkflowSettingsSection
        title={(
          <>收集字段<span aria-hidden="true" className="ml-0.5 text-destructive">*</span></>
        )}
      >
        <div className="space-y-3">
          <Sortable
            flatCursor
            getItemValue={field => field.id}
            onValueChange={nextFields => updateConfig({ fields: nextFields })}
            value={fields}
          >
            <SortableContent className="space-y-2">
              {fields.map((field, index) => (
                <SortableItem key={field.id} value={field.id}>
                  <AiCollectFieldEditor
                    field={field}
                    fields={fields}
                    index={index}
                    onChange={patch => updateField(field.id, patch)}
                    onDelete={() => updateConfig({
                      fields: fields.filter(item => item.id !== field.id),
                    })}
                  />
                </SortableItem>
              ))}
            </SortableContent>
          </Sortable>
          <div className="flex items-center gap-4">
            <Button
              aria-label="添加字段"
              className="h-auto justify-start gap-1 rounded-none p-0 text-xs text-primary hover:no-underline"
              disabled={fields.length >= AI_COLLECT_FIELD_MAX_COUNT}
              onClick={() => addField()}
              type="button"
              variant="link"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.8} />
              添加字段
            </Button>
            <FieldTemplateMenu
              disabled={fields.length >= AI_COLLECT_FIELD_MAX_COUNT}
              onAdd={addField}
            />
          </div>
        </div>
      </WorkflowSettingsSection>

      <WorkflowSettingsSection
        actions={(
          <Select
            onValueChange={value => updateConfig({ maxFollowUpCount: Number(value) })}
            value={String(maxFollowUpCount)}
          >
            <SelectTrigger
              aria-label="智能体辅助"
              className="h-8 w-24 px-2.5 text-[13px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">关闭</SelectItem>
              {followUpCountOptions.map(count => (
                <SelectItem key={count} value={String(count)}>
                  {count} 轮
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        title="智能体辅助"
        titleAccessory={(
          <SectionInfoTooltip
            label="智能体辅助"
            text="开启后，会引导 Agent 根据资料收集目标和当前对话语境，自行判断是否需要追问以及如何沟通，并不保证每轮都会追问。如果对应席位未绑定 Agent，则不会发起追问。达到追问轮次或最长等待限制后仍未收集完成，将从“未完成”出口继续。关闭后，仅从输入消息中提取一次，不会引导 Agent 追问"
          />
        )}
      >
        {null}
      </WorkflowSettingsSection>

      {maxFollowUpCount > 0 ? (
        <WorkflowSettingsSection
          actions={(
            <div className="flex items-center gap-1.5">
              <BoundedTimeoutInput
                max={AI_COLLECT_TIMEOUT_MAX_BY_UNIT[timeout.unit]}
                onValueChange={duration => updateConfig({ timeout: { ...timeout, duration } })}
                value={timeout.duration}
              />
              <Select
                onValueChange={(unit: WorkflowAiCollectTimeout["unit"]) => updateConfig({
                  timeout: {
                    duration: Math.min(timeout.duration, AI_COLLECT_TIMEOUT_MAX_BY_UNIT[unit]),
                    unit,
                  },
                })}
                value={timeout.unit}
              >
                <SelectTrigger
                  aria-label="最长等待时间单位"
                  className="h-8 w-20 px-2.5 text-[13px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minute">分钟</SelectItem>
                  <SelectItem value="hour">小时</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          title="最长等待"
        >
          {null}
        </WorkflowSettingsSection>
      ) : null}
    </>
  );
}

function SectionInfoTooltip({ label, text }: { label: string; text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={`查看${label}说明`}
            className="size-5 shrink-0 rounded-full p-0 text-muted-foreground"
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={InformationCircleIcon} size={15} strokeWidth={1.8} />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72" side="top" sideOffset={6}>
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function FieldTemplateMenu({ disabled, onAdd }: {
  disabled: boolean;
  onAdd: (template: (typeof aiCollectFieldTemplates)[number]) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-auto justify-start rounded-none p-0 text-xs text-primary hover:no-underline"
          disabled={disabled}
          type="button"
          variant="link"
        >
          从模板选择
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuLabel>常用模板</DropdownMenuLabel>
        {aiCollectFieldTemplates.map(template => (
          <DropdownMenuItem key={template.name} onSelect={() => onAdd(template)}>
            {template.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AiCollectFieldEditor({ field, fields, index, onChange, onDelete }: {
  field: WorkflowAiCollectField;
  fields: WorkflowAiCollectField[];
  index: number;
  onChange: (patch: Partial<WorkflowAiCollectField>) => void;
  onDelete: () => void;
}) {
  const duplicateName = Boolean(field.name.trim()) && fields.some(item =>
    item.id !== field.id && item.name.trim() === field.name.trim());
  return (
    <section className="space-y-2.5 rounded-[8px] bg-secondary/50 p-2.5">
      <div className="grid grid-cols-[28px_minmax(0,1fr)_5rem_32px] items-start gap-2">
        <SortableItemHandle
          aria-label={`拖动字段 ${index + 1}`}
          className="mt-1 flex size-7 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} size={16} strokeWidth={1.8} />
        </SortableItemHandle>
        <Input
          aria-label={`字段 ${index + 1} 名称`}
          aria-invalid={!field.name.trim() || duplicateName}
          className={cn(
            "h-9 text-[13px] md:text-[13px]",
            duplicateName && "border-destructive",
          )}
          maxLength={AI_COLLECT_FIELD_NAME_MAX_LENGTH}
          onChange={event => onChange({ name: event.target.value })}
          placeholder="字段名称"
          value={field.name}
        />
        <Select
          onValueChange={(type: WorkflowAiCollectFieldType) => onChange({ type })}
          value={field.type}
        >
          <SelectTrigger
            aria-label={`字段 ${index + 1} 类型`}
            className="h-9 px-2.5 text-[13px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fieldTypes.map(type => (
              <SelectItem key={type} value={type}>{aiCollectFieldTypeLabels[type]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          aria-label={`删除字段 ${index + 1}`}
          className="size-8 p-0 text-destructive hover:text-destructive"
          disabled={fields.length <= AI_COLLECT_FIELD_MIN_COUNT}
          onClick={onDelete}
          size="sm"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={Delete01Icon} size={15} strokeWidth={1.8} />
        </Button>
      </div>
      <div className="relative ml-9">
        <Textarea
          aria-label={`字段 ${index + 1} 提取指引`}
          aria-invalid={!field.instruction.trim()}
          className="min-h-24 resize-y bg-background pb-7 text-[13px]"
          maxLength={AI_COLLECT_INSTRUCTION_MAX_LENGTH}
          onChange={event => onChange({ instruction: event.target.value })}
          placeholder="填写提取标准、有效格式和需要排除的情况"
          value={field.instruction}
        />
        <span className="pointer-events-none absolute bottom-2.5 right-3 text-[13px] text-muted-foreground">
          {field.instruction.length}/{AI_COLLECT_INSTRUCTION_MAX_LENGTH}
        </span>
      </div>
    </section>
  );
}

function BoundedTimeoutInput({ max, onValueChange, value }: {
  max: number;
  onValueChange: (value: number) => void;
  value: number;
}) {
  const [draftValue, setDraftValue] = useState(String(value));
  useEffect(() => setDraftValue(String(value)), [value]);

  const commitValue = (rawValue: string) => {
    const parsed = Math.trunc(Number(rawValue));
    const nextValue = Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : 1;
    setDraftValue(String(nextValue));
    if (nextValue !== value) onValueChange(nextValue);
  };

  return (
    <Input
      aria-label="最长等待时间"
      className="h-8 w-20 px-2.5 text-[13px] md:text-[13px]"
      max={max}
      min={1}
      onBlur={() => commitValue(draftValue)}
      onChange={(event) => {
        const nextDraftValue = event.target.value;
        setDraftValue(nextDraftValue);
        if (/^\d+$/.test(nextDraftValue)) {
          const parsed = Number(nextDraftValue);
          if (parsed >= 1 && parsed <= max) onValueChange(parsed);
        }
      }}
      placeholder="请输入"
      step={1}
      type="number"
      value={draftValue}
    />
  );
}
