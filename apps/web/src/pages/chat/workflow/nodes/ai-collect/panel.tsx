import { useEffect, useState } from "react";
import {
  Add01Icon,
  Cancel01Icon,
  Delete01Icon,
  DragDropVerticalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
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
  AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH,
  AI_COLLECT_TIMEOUT_MAX_BY_UNIT,
  aiCollectFieldTemplates,
  aiCollectFieldTypeLabels,
  createAiCollectField,
  getAiCollectMetric,
  getAiCollectStatus,
  normalizeAiCollectFields,
  normalizeAiCollectInputSelector,
  normalizeAiCollectMode,
  normalizeAiCollectOpeningMessage,
  normalizeAiCollectTimeout,
} from "./config";

const fieldTypes = Object.keys(aiCollectFieldTypeLabels) as WorkflowAiCollectFieldType[];

export function AiCollectConfig({ edges, node, nodes, onNodeChange }: NodeSettingsProps<"ai-collect">) {
  const fields = normalizeAiCollectFields(node.data.fields);
  const inputSelector = normalizeAiCollectInputSelector(node.data.inputSelector);
  const mode = normalizeAiCollectMode(node.data.mode);
  const openingMessage = normalizeAiCollectOpeningMessage(node.data.openingMessage);
  const timeout = normalizeAiCollectTimeout(node.data.timeout);
  const inputOptions = getAvailableIntentInputOutputsForNode(node.id, nodes, edges);

  const updateConfig = ({
    fields: nextFields = fields,
    inputSelector: nextInputSelector = inputSelector,
    mode: nextMode = mode,
    openingMessage: nextOpeningMessage = openingMessage,
    timeout: nextTimeout = timeout,
  }: Partial<Pick<
    AiCollectNodeData,
    "fields" | "inputSelector" | "mode" | "openingMessage" | "timeout"
  >>) => {
    const nextData = {
      fields: nextFields,
      inputSelector: nextInputSelector,
      mode: nextMode,
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
      <WorkflowSettingsSection title="收集模式">
        <SegmentedControl
          aria-label="收集模式"
          className="grid h-9 w-full grid-cols-2 rounded-[8px]"
          onValueChange={(value) => {
            if (value === "extract-once" || value === "agent-assisted") {
              updateConfig({ mode: value });
            }
          }}
          type="single"
          value={mode}
        >
          <SegmentedControlItem className="rounded-[6px]" value="extract-once">
            单次提取
          </SegmentedControlItem>
          <SegmentedControlItem className="rounded-[6px]" value="agent-assisted">
            智能收集
          </SegmentedControlItem>
        </SegmentedControl>
      </WorkflowSettingsSection>

      <WorkflowSettingsSection
        title={mode === "extract-once" ? (
          <>输入<span aria-hidden="true" className="ml-0.5 text-destructive">*</span></>
        ) : "输入（可选）"}
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
          {mode === "agent-assisted" && inputSelector ? (
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
        actions={(
          <AddFieldMenu
            disabled={fields.length >= AI_COLLECT_FIELD_MAX_COUNT}
            onAdd={addField}
          />
        )}
        title="收集字段"
      >
        <Sortable
          flatCursor
          getItemValue={field => field.id}
          onValueChange={nextFields => updateConfig({ fields: nextFields })}
          value={fields}
        >
          <SortableContent className="space-y-3">
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
      </WorkflowSettingsSection>

      {mode === "agent-assisted" ? (
        <>
          <WorkflowSettingsSection title="开场白（可选）">
            <div className="relative">
              <Textarea
                aria-label="开场白"
                className="min-h-24 resize-y pb-7"
                maxLength={AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH}
                onChange={event => updateConfig({ openingMessage: event.target.value })}
                placeholder="需要 Agent 主动开始收集时填写"
                value={openingMessage}
              />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-xs text-muted-foreground">
                {openingMessage.length}/{AI_COLLECT_OPENING_MESSAGE_MAX_LENGTH}
              </span>
            </div>
          </WorkflowSettingsSection>

          <WorkflowSettingsSection title="最长等待">
            <div className="flex items-center gap-2">
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
                <SelectTrigger aria-label="最长等待时间单位" className="h-9 w-24 px-2.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minute">分钟</SelectItem>
                  <SelectItem value="hour">小时</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </WorkflowSettingsSection>
        </>
      ) : null}
    </>
  );
}

function AddFieldMenu({ disabled, onAdd }: {
  disabled: boolean;
  onAdd: (template?: (typeof aiCollectFieldTemplates)[number]) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="添加字段"
          className="h-8 gap-1 px-2 text-xs"
          disabled={disabled}
          size="sm"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.8} />
          添加
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onSelect={() => onAdd()}>自定义字段</DropdownMenuItem>
        <DropdownMenuSeparator />
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
    <section className="space-y-2.5 rounded-[8px] border p-3">
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
          className={cn("h-9 text-xs", duplicateName && "border-destructive")}
          maxLength={AI_COLLECT_FIELD_NAME_MAX_LENGTH}
          onChange={event => onChange({ name: event.target.value })}
          placeholder="字段名称"
          value={field.name}
        />
        <Select
          onValueChange={(type: WorkflowAiCollectFieldType) => onChange({ type })}
          value={field.type}
        >
          <SelectTrigger aria-label={`字段 ${index + 1} 类型`} className="h-9 px-2.5 text-xs">
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
          className="min-h-24 resize-y pb-7 text-xs"
          maxLength={AI_COLLECT_INSTRUCTION_MAX_LENGTH}
          onChange={event => onChange({ instruction: event.target.value })}
          placeholder="填写提取标准、有效格式和需要排除的情况"
          value={field.instruction}
        />
        <span className="pointer-events-none absolute bottom-2.5 right-3 text-xs text-muted-foreground">
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
      className="h-9 w-24 px-2.5"
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
