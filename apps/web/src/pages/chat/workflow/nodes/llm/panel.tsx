import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AiHostingModel } from "@chatai/contracts";
import {
  Add01Icon,
  Cancel01Icon,
  Delete01Icon,
  ExpandIcon,
  MinusSignIcon,
  Settings03Icon,
  SquareArrowExpand01Icon,
  SquareArrowShrink01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AgentModelBadge } from "@/pages/chat/ai-hosting/agent-model-badge";
import { listAiHostingModels } from "@/pages/chat/ai-hosting/agent-service";
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WorkflowExpandedEditorPortal } from "../../panels/expanded-editor-portal";
import type { NodeSettingsProps } from "../../panels/types";
import type {
  LlmNodeData,
  WorkflowLlmInputParameter,
  WorkflowLlmOutputConfig,
  WorkflowLlmOutputField,
  WorkflowLlmOutputFieldType,
  WorkflowVariableContentSegment,
  WorkflowVariableDefinition,
} from "../../types";
import { WorkflowVariablePicker } from "../../workflow-variable-picker";
import {
  getAvailableLlmInputVariablesForNode,
  getWorkflowVariableDisplayLabel,
  resolveWorkflowVariable,
} from "../../workflow-variables";
import {
  downgradeVariableContentSelector,
  variableContentEqual,
} from "../variable-content/content";
import { VariableContentEditor } from "../variable-content/editor";
import {
  LLM_IDENTIFIER_PATTERN,
  LLM_INPUT_MAX_COUNT,
  LLM_INPUT_NAME_MAX_LENGTH,
  LLM_OUTPUT_DESCRIPTION_MAX_LENGTH,
  LLM_OUTPUT_FIELD_MAX_COUNT,
  LLM_OUTPUT_NAME_MAX_LENGTH,
  LLM_PROMPT_MAX_LENGTH,
  createLlmInputParameter,
  createLlmOutputField,
  getLlmInputSelector,
  getLlmInputVariables,
  getLlmMetric,
  getLlmStatus,
  normalizeLlmInputs,
  normalizeLlmModelId,
  normalizeLlmModelSnapshot,
  normalizeLlmOutput,
  normalizeLlmPrompt,
} from "./config";

const outputFormatLabels: Record<WorkflowLlmOutputConfig["format"], string> = {
  text: "Text",
  markdown: "Markdown",
  json: "JSON",
};

const outputFormatOrder: WorkflowLlmOutputConfig["format"][] = ["text", "markdown", "json"];

const outputTypeLabels: Record<WorkflowLlmOutputFieldType, string> = {
  boolean: "Boolean",
  number: "Number",
  string: "String",
};

export function LlmConfig({ edges, node, nodes, onNodeChange }: NodeSettingsProps<"llm">) {
  const [models, setModels] = useState<AiHostingModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState(false);
  const [expandedPrompt, setExpandedPrompt] = useState<"system" | "user" | null>(null);
  const inputs = normalizeLlmInputs(node.data.inputs);
  const systemPrompt = normalizeLlmPrompt(node.data.systemPrompt);
  const userPrompt = normalizeLlmPrompt(node.data.userPrompt);
  const output = normalizeLlmOutput(node.data.output);
  const modelId = normalizeLlmModelId(node.data.modelId);
  const selectedModel = models.find((model) => model.id === modelId);
  const inputVariables = useMemo(() => getLlmInputVariables(inputs), [inputs]);
  const availableInputValues = useMemo(() =>
    getAvailableLlmInputVariablesForNode(node.id, nodes, edges),
  [edges, node.id, nodes]);

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      setModelsLoading(true);
      setModelsError(false);
      try {
        const response = await listAiHostingModels();
        if (!cancelled) setModels(response.models);
      }
      catch {
        if (!cancelled) setModelsError(true);
      }
      finally {
        if (!cancelled) setModelsLoading(false);
      }
    }

    void loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateConfig = (patch: Partial<Pick<
    LlmNodeData,
    "inputs" | "modelId" | "modelLabel" | "modelName" | "output" | "systemPrompt" | "userPrompt"
  >>) => {
    const nextData = {
      inputs: patch.inputs ?? inputs,
      modelId: patch.modelId ?? modelId,
      modelLabel: patch.modelLabel !== undefined
        ? patch.modelLabel
        : normalizeLlmModelSnapshot(node.data.modelLabel),
      modelName: patch.modelName !== undefined
        ? patch.modelName
        : normalizeLlmModelSnapshot(node.data.modelName),
      output: patch.output ?? output,
      systemPrompt: patch.systemPrompt ?? systemPrompt,
      userPrompt: patch.userPrompt ?? userPrompt,
    };
    onNodeChange({
      ...patch,
      metric: getLlmMetric(nextData),
      status: getLlmStatus(nextData),
    });
  };

  const updateSystemPrompt = (nextPrompt: WorkflowVariableContentSegment[]) => {
    if (!variableContentEqual(systemPrompt, nextPrompt)) {
      updateConfig({ systemPrompt: nextPrompt });
    }
  };

  const updateUserPrompt = (nextPrompt: WorkflowVariableContentSegment[]) => {
    if (!variableContentEqual(userPrompt, nextPrompt)) {
      updateConfig({ userPrompt: nextPrompt });
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex h-5 items-center justify-between gap-3">
          <SectionTitle required>模型</SectionTitle>
          {modelsLoading ? (
            <span className="flex h-5 items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <Spinner size={14} />
              正在加载
            </span>
          ) : null}
        </div>
        <Select
          disabled={modelsLoading || modelsError}
          onValueChange={(nextModelId) => {
            const model = models.find((item) => item.id === nextModelId);
            if (!model) return;
            updateConfig({
              modelId: model.id,
              modelLabel: model.label,
              modelName: model.model,
            });
          }}
          value={modelId}
        >
          <SelectTrigger aria-label="模型" className="w-full">
            {selectedModel ? (
              <div className="min-w-0">
                <AgentModelBadge label={selectedModel.label} model={selectedModel.model} />
              </div>
            ) : modelId ? (
              <div className="min-w-0">
                <AgentModelBadge
                  label={normalizeLlmModelSnapshot(node.data.modelLabel) ?? "原模型不可用"}
                  model={normalizeLlmModelSnapshot(node.data.modelName) ?? modelId}
                />
              </div>
            ) : (
              <SelectValue placeholder="请选择模型" />
            )}
          </SelectTrigger>
          <SelectContent>
            {modelId && !selectedModel && !modelsLoading ? (
              <SelectItem disabled value={modelId}>原模型不可用</SelectItem>
            ) : null}
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <AgentModelBadge label={model.label} model={model.model} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {modelsError ? (
          <p className="text-xs text-destructive" role="alert">模型加载失败</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle>输入</SectionTitle>
          <IconButton
            ariaLabel="添加输入参数"
            disabled={inputs.length >= LLM_INPUT_MAX_COUNT}
            icon={Add01Icon}
            onClick={() => updateConfig({ inputs: [...inputs, createLlmInputParameter(inputs)] })}
            tooltip="添加参数"
          />
        </div>
        {inputs.length ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_2rem] gap-2 px-0.5 text-xs text-muted-foreground">
              <span>参数名</span>
              <span>参数值</span>
            </div>
            {inputs.map((input) => (
              <LlmInputRow
                availableVariables={availableInputValues}
                input={input}
                inputs={inputs}
                key={input.id}
                onChange={(nextInput) => updateConfig({
                  inputs: inputs.map((item) => item.id === input.id ? nextInput : item),
                })}
                onDelete={() => {
                  const fallbackText = `{{${input.name.trim() || "参数"}}}`;
                  const selector = getLlmInputSelector(input.id);
                  updateConfig({
                    inputs: inputs.filter((item) => item.id !== input.id),
                    systemPrompt: downgradeVariableContentSelector(
                      systemPrompt,
                      selector,
                      fallbackText,
                    ),
                    userPrompt: downgradeVariableContentSelector(
                      userPrompt,
                      selector,
                      fallbackText,
                    ),
                  });
                }}
              />
            ))}
          </div>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">暂无输入参数</p>
        )}
      </section>

      <PromptSection
        ariaLabel="系统提示词"
        inputVariables={inputVariables}
        onChange={updateSystemPrompt}
        onExpand={() => setExpandedPrompt("system")}
        placeholder="请输入系统提示词"
        required
        segments={systemPrompt}
        title="系统提示词"
      />
      <PromptSection
        ariaLabel="用户提示词"
        inputVariables={inputVariables}
        onChange={updateUserPrompt}
        onExpand={() => setExpandedPrompt("user")}
        placeholder="请输入用户提示词"
        segments={userPrompt}
        title="用户提示词"
      />

      <OutputSection
        onChange={(nextOutput) => updateConfig({ output: nextOutput })}
        output={output}
      />

      {expandedPrompt ? (
        <ExpandedPromptEditor
          ariaLabel={expandedPrompt === "system" ? "系统提示词" : "用户提示词"}
          inputVariables={inputVariables}
          onChange={expandedPrompt === "system" ? updateSystemPrompt : updateUserPrompt}
          onClose={() => setExpandedPrompt(null)}
          placeholder={expandedPrompt === "system" ? "请输入系统提示词" : "请输入用户提示词"}
          segments={expandedPrompt === "system" ? systemPrompt : userPrompt}
          title={expandedPrompt === "system" ? "系统提示词" : "用户提示词"}
        />
      ) : null}
    </div>
  );
}

function LlmInputRow({
  availableVariables,
  input,
  inputs,
  onChange,
  onDelete,
}: {
  availableVariables: WorkflowVariableDefinition[];
  input: WorkflowLlmInputParameter;
  inputs: WorkflowLlmInputParameter[];
  onChange: (input: WorkflowLlmInputParameter) => void;
  onDelete: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedVariable = input.value.kind === "variable"
    ? resolveWorkflowVariable(availableVariables, input.value.selector)
    : undefined;
  const nameDuplicate = Boolean(input.name.trim()) && inputs.some((item) =>
    item.id !== input.id && item.name.trim() === input.name.trim());
  const nameInvalid = Boolean(input.name) && (!LLM_IDENTIFIER_PATTERN.test(input.name)
    || input.name.length > LLM_INPUT_NAME_MAX_LENGTH
    || nameDuplicate);

  return (
    <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_2rem] items-start gap-2">
      <Input
        aria-label="输入参数名"
        aria-invalid={nameInvalid}
        className={cn("h-9 min-w-0 px-3 text-xs", nameInvalid && "border-destructive")}
        maxLength={LLM_INPUT_NAME_MAX_LENGTH}
        onChange={(event) => onChange({ ...input, name: event.target.value })}
        placeholder="参数名"
        value={input.name}
      />
      <div className="relative min-w-0">
        <Input
          aria-label={`${input.name || "输入参数"}的值`}
          className="h-9 min-w-0 pl-3 pr-16 text-xs"
          onChange={(event) => onChange({
            ...input,
            value: { kind: "literal", value: event.target.value },
          })}
          placeholder="输入或引用变量"
          readOnly={input.value.kind === "variable"}
          value={input.value.kind === "variable"
            ? selectedVariable ? getWorkflowVariableDisplayLabel(selectedVariable) : "原变量不可用"
            : input.value.value}
        />
        {input.value.kind === "variable" ? (
          <Button
            aria-label="改为固定文本"
            className="absolute right-8 top-1/2 size-7 -translate-y-1/2 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => onChange({ ...input, value: { kind: "literal", value: "" } })}
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.8} />
          </Button>
        ) : null}
        <WorkflowVariablePicker
          onOpenChange={setPickerOpen}
          onSelect={(variable) => {
            onChange({
              ...input,
              value: {
                kind: "variable",
                selector: variable.selector,
                valueType: variable.valueType,
              },
            });
            setPickerOpen(false);
          }}
          open={pickerOpen}
          variables={availableVariables}
        >
          <Button
            aria-label="引用变量"
            className="absolute right-1 top-1/2 size-7 -translate-y-1/2 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Settings03Icon} size={14} strokeWidth={1.8} />
          </Button>
        </WorkflowVariablePicker>
      </div>
      <Button
        aria-label="删除输入参数"
        className="size-8 p-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        size="sm"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.8} />
      </Button>
    </div>
  );
}

function PromptSection({
  ariaLabel,
  inputVariables,
  onChange,
  onExpand,
  placeholder,
  required = false,
  segments,
  title,
}: {
  ariaLabel: string;
  inputVariables: WorkflowVariableDefinition[];
  onChange: (segments: WorkflowVariableContentSegment[]) => void;
  onExpand: () => void;
  placeholder: string;
  required?: boolean;
  segments: WorkflowVariableContentSegment[];
  title: string;
}) {
  return (
    <section className="space-y-0.5">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle required={required}>{title}</SectionTitle>
        <IconButton
          ariaLabel={`全屏编辑${title}`}
          icon={SquareArrowExpand01Icon}
          onClick={onExpand}
          tooltip="全屏编辑"
        />
      </div>
      <VariableContentEditor
        ariaLabel={ariaLabel}
        maxLength={LLM_PROMPT_MAX_LENGTH}
        onChange={onChange}
        placeholder={placeholder}
        segments={segments}
        variables={inputVariables}
      />
    </section>
  );
}

function ExpandedPromptEditor({
  ariaLabel,
  inputVariables,
  onChange,
  onClose,
  placeholder,
  segments,
  title,
}: {
  ariaLabel: string;
  inputVariables: WorkflowVariableDefinition[];
  onChange: (segments: WorkflowVariableContentSegment[]) => void;
  onClose: () => void;
  placeholder: string;
  segments: WorkflowVariableContentSegment[];
  title: string;
}) {
  return (
    <WorkflowExpandedEditorPortal>
      <section
        aria-label={`${title}展开编辑`}
        className="pointer-events-auto flex h-full min-h-0 flex-col overflow-hidden border-r border-[var(--workflow-border)] bg-background"
      >
        <header className="flex h-12 shrink-0 items-center justify-between px-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <IconButton
            ariaLabel={`收起${title}`}
            icon={SquareArrowShrink01Icon}
            onClick={onClose}
            tooltip="收起"
          />
        </header>
        <div className="flex min-h-0 flex-1 px-4 pb-4">
          <VariableContentEditor
            ariaLabel={`${ariaLabel}展开编辑`}
            className="flex min-h-0 flex-1 flex-col"
            contentEditableClassName="h-full min-h-full overflow-y-auto"
            editorClassName="min-h-0 flex-1 overflow-y-auto"
            maxLength={LLM_PROMPT_MAX_LENGTH}
            onChange={onChange}
            placeholder={placeholder}
            segments={segments}
            variables={inputVariables}
          />
        </div>
      </section>
    </WorkflowExpandedEditorPortal>
  );
}

function OutputSection({
  onChange,
  output,
}: {
  onChange: (output: WorkflowLlmOutputConfig) => void;
  output: WorkflowLlmOutputConfig;
}) {
  const fields = output.format === "json" ? output.fields : [output.field];

  const changeFormat = (format: WorkflowLlmOutputConfig["format"]) => {
    const firstField = fields[0] ?? createLlmOutputField([], { name: "output" });
    if (format === "json") {
      onChange({
        fields: fields.length ? fields : [firstField],
        format: "json",
      });
      return;
    }
    onChange({
      field: { ...firstField, type: "string" },
      format,
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>输出</SectionTitle>
        <SegmentedControl
          aria-label="输出格式"
          className="h-9 rounded-full p-1"
          onValueChange={(format) => {
            if (format === "text" || format === "markdown" || format === "json") {
              changeFormat(format);
            }
          }}
          type="single"
          value={output.format}
        >
          {outputFormatOrder.map((format) => (
            <SegmentedControlItem
              className="h-7 w-auto rounded-full px-3 text-xs font-medium data-[state=on]:bg-foreground data-[state=on]:text-background"
              key={format}
              value={format}
            >
              {outputFormatLabels[format]}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_5rem_4.125rem] gap-2 px-0.5 text-xs text-muted-foreground">
        <span>变量名</span>
        <span>参数类型</span>
      </div>

      {output.format === "json" ? (
        <div className="space-y-3">
          {output.fields.map((field) => (
            <JsonOutputFieldRow
              field={field}
              fields={output.fields}
              key={field.id}
              onChange={(nextField) => onChange({
                fields: output.fields.map((item) => item.id === field.id ? nextField : item),
                format: "json",
              })}
              onDelete={() => onChange({
                fields: output.fields.filter((item) => item.id !== field.id),
                format: "json",
              })}
            />
          ))}
          <button
            className="text-sm text-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={output.fields.length >= LLM_OUTPUT_FIELD_MAX_COUNT}
            onClick={() => onChange({
              fields: [...output.fields, createLlmOutputField(output.fields)],
              format: "json",
            })}
            type="button"
          >
            + 添加字段
          </button>
        </div>
      ) : (
        <SingleOutputField
          field={output.field}
          onChange={(field) => onChange({ field: { ...field, type: "string" }, format: output.format })}
        />
      )}
    </section>
  );
}

function SingleOutputField({
  field,
  onChange,
}: {
  field: WorkflowLlmOutputField;
  onChange: (field: WorkflowLlmOutputField) => void;
}) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_4.125rem] items-start gap-2">
        <IdentifierInput
          ariaLabel="输出变量名"
          maxLength={LLM_OUTPUT_NAME_MAX_LENGTH}
          onChange={(name) => onChange({ ...field, name })}
          value={field.name}
        />
        <div className="flex h-9 items-center rounded-[8px] bg-secondary px-3 text-xs text-muted-foreground">
          String
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton
            ariaExpanded={descriptionExpanded}
            ariaLabel={descriptionExpanded ? "收起输出描述" : "展开输出描述"}
            className={descriptionExpanded ? "bg-accent text-foreground" : undefined}
            icon={ExpandIcon}
            onClick={() => setDescriptionExpanded((expanded) => !expanded)}
            tooltip={descriptionExpanded ? "收起描述" : "展开描述"}
          />
          <IconButton
            ariaLabel="删除输出参数"
            className="text-muted-foreground hover:text-destructive"
            disabled
            icon={MinusSignIcon}
            tooltip="删除参数"
          />
        </div>
      </div>
      {descriptionExpanded ? (
        <Input
          aria-label="输出描述"
          className="h-9 text-xs"
          maxLength={LLM_OUTPUT_DESCRIPTION_MAX_LENGTH}
          onChange={(event) => onChange({ ...field, description: event.target.value })}
          placeholder="请输入输出描述"
          value={field.description}
        />
      ) : null}
    </div>
  );
}

function JsonOutputFieldRow({
  field,
  fields,
  onChange,
  onDelete,
}: {
  field: WorkflowLlmOutputField;
  fields: WorkflowLlmOutputField[];
  onChange: (field: WorkflowLlmOutputField) => void;
  onDelete: () => void;
}) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const nameDuplicate = Boolean(field.name.trim()) && fields.some((item) =>
    item.id !== field.id && item.name.trim() === field.name.trim());
  const nameInvalid = Boolean(field.name) && (!LLM_IDENTIFIER_PATTERN.test(field.name)
    || field.name.length > LLM_OUTPUT_NAME_MAX_LENGTH
    || nameDuplicate);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_4.125rem] items-start gap-2">
        <Input
          aria-label="JSON 字段名"
          aria-invalid={nameInvalid}
          className={cn("h-9 text-xs", nameInvalid && "border-destructive")}
          maxLength={LLM_OUTPUT_NAME_MAX_LENGTH}
          onChange={(event) => onChange({ ...field, name: event.target.value })}
          placeholder="字段名"
          value={field.name}
        />
        <Select
          onValueChange={(type) => onChange({ ...field, type: type as WorkflowLlmOutputFieldType })}
          value={field.type}
        >
          <SelectTrigger aria-label={`${field.name || "JSON 字段"}类型`} className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(outputTypeLabels) as WorkflowLlmOutputFieldType[]).map((type) => (
              <SelectItem key={type} value={type}>{outputTypeLabels[type]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-0.5">
          <IconButton
            ariaExpanded={descriptionExpanded}
            ariaLabel={descriptionExpanded ? "收起 JSON 字段描述" : "展开 JSON 字段描述"}
            className={descriptionExpanded ? "bg-accent text-foreground" : undefined}
            icon={ExpandIcon}
            onClick={() => setDescriptionExpanded((expanded) => !expanded)}
            tooltip={descriptionExpanded ? "收起描述" : "展开描述"}
          />
          <IconButton
            ariaLabel="删除 JSON 字段"
            className="text-muted-foreground hover:text-destructive"
            disabled={fields.length <= 1}
            icon={MinusSignIcon}
            onClick={onDelete}
            tooltip="删除参数"
          />
        </div>
      </div>
      {descriptionExpanded ? (
        <Input
          aria-label={`${field.name || "JSON 字段"}描述`}
          className="h-9 text-xs"
          maxLength={LLM_OUTPUT_DESCRIPTION_MAX_LENGTH}
          onChange={(event) => onChange({ ...field, description: event.target.value })}
          placeholder="描述（可选）"
          value={field.description}
        />
      ) : null}
    </div>
  );
}

function IdentifierInput({
  ariaLabel,
  maxLength,
  onChange,
  value,
}: {
  ariaLabel: string;
  maxLength: number;
  onChange: (value: string) => void;
  value: string;
}) {
  const invalid = Boolean(value) && (!LLM_IDENTIFIER_PATTERN.test(value) || value.length > maxLength);
  return (
    <Input
      aria-label={ariaLabel}
      aria-invalid={invalid}
      className={cn("h-9 text-xs", invalid && "border-destructive")}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      placeholder="变量名"
      value={value}
    />
  );
}

function SectionTitle({ children, required = false }: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <h3 className="text-sm font-semibold text-foreground">
      {children}
      {required ? <span aria-hidden="true" className="ml-0.5 text-destructive">*</span> : null}
    </h3>
  );
}

function IconButton({ ariaExpanded, ariaLabel, className, disabled, icon, onClick, tooltip }: {
  ariaExpanded?: boolean;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  icon: typeof Add01Icon;
  onClick?: () => void;
  tooltip: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-expanded={ariaExpanded}
            aria-label={ariaLabel}
            className={cn("size-8 p-0", className)}
            disabled={disabled}
            onClick={onClick}
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={icon} size={15} strokeWidth={1.8} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
