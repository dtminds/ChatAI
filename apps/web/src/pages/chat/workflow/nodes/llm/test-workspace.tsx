import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  WorkflowJsonObject,
  WorkflowJsonValue,
  WorkflowLlmTestAttempt,
  WorkflowOutputValueType,
} from "@chatai/contracts";
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  PlayIcon,
  StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  SettingWorkspaceEditorContent,
  useSettingWorkspace,
} from "../../panels/setting-workspace";
import type { WorkflowNodeTestContext } from "../../panels/types";
import type {
  WorkflowLlmInputParameter,
  WorkflowLlmOutputConfig,
  WorkflowNode,
} from "../../types";
import {
  getLlmStatus,
  normalizeLlmInputs,
  normalizeLlmModelId,
  normalizeLlmOutput,
  normalizeLlmPrompt,
} from "./config";
import {
  cancelWorkflowLlmTestAttempt,
  createWorkflowLlmTestAttempt,
  getWorkflowLlmTestAttempt,
} from "./test-service";
import {
  useWorkflowTestAttemptController,
  getWorkflowTestWorkspaceId,
  WorkflowTestWorkspaceTrigger,
  WorkflowTestAttemptCloseDialog,
} from "../test-attempt-controller";

type RawInputValues = Record<string, string | undefined>;
type InputErrors = Record<string, string | undefined>;

export function LlmTestWorkspaceTrigger({ nodeId }: { nodeId: string }) {
  return <WorkflowTestWorkspaceTrigger ariaLabel="试运行大模型节点" nodeId={nodeId} />;
}

export function LlmTestWorkspace({
  node,
  testContext,
}: {
  node: WorkflowNode<"llm">;
  testContext: WorkflowNodeTestContext;
}) {
  const { activeEditor } = useSettingWorkspace();
  const workspaceId = getWorkflowTestWorkspaceId(node.id);
  if (activeEditor?.id !== workspaceId) return null;

  return (
    <SettingWorkspaceEditorContent id={workspaceId}>
      <LlmTestWorkspaceContent node={node} testContext={testContext} />
    </SettingWorkspaceEditorContent>
  );
}

function LlmTestWorkspaceContent({
  node,
  testContext,
}: {
  node: WorkflowNode<"llm">;
  testContext: WorkflowNodeTestContext;
}) {
  const inputs = useMemo(() => normalizeLlmInputs(node.data.inputs), [node.data.inputs]);
  const output = useMemo(() => normalizeLlmOutput(node.data.output), [node.data.output]);
  const [rawValues, setRawValues] = useState<RawInputValues>(() => createInitialRawValues(inputs));
  const [inputErrors, setInputErrors] = useState<InputErrors>({});
  const [outputSnapshot, setOutputSnapshot] = useState<WorkflowLlmOutputConfig>(output);
  const getAttempt = useCallback((attemptId: string) => getWorkflowLlmTestAttempt(
    testContext.workflowId,
    node.id,
    attemptId,
  ), [node.id, testContext.workflowId]);
  const cancelAttempt = useCallback((attemptId: string) => cancelWorkflowLlmTestAttempt(
    testContext.workflowId,
    node.id,
    attemptId,
  ), [node.id, testContext.workflowId]);
  const controller = useWorkflowTestAttemptController({ cancelAttempt, getAttempt });
  const { attempt, requestError, running, starting, stopping } = controller;
  const configReady = getLlmStatus({
    inputs,
    modelId: normalizeLlmModelId(node.data.modelId),
    output,
    systemPrompt: normalizeLlmPrompt(node.data.systemPrompt),
    userPrompt: normalizeLlmPrompt(node.data.userPrompt),
  }) === "ready";
  const draftSaved = testContext.saveState === "saved";

  useEffect(() => {
    setRawValues(current => reconcileRawValues(current, inputs));
    setInputErrors(current => Object.fromEntries(
      Object.entries(current).filter(([inputId]) => inputs.some(input => input.id === inputId)),
    ));
  }, [inputs]);

  const startAttempt = async () => {
    if (running || stopping || !draftSaved || !configReady) return;
    const parsed = parseInputValues(inputs, rawValues);
    setInputErrors(parsed.errors);
    if (!parsed.values) return;
    const inputValues = parsed.values;

    setOutputSnapshot(output);
    await controller.startAttempt(() => createWorkflowLlmTestAttempt(
        testContext.workflowId,
        node.id,
        {
          expectedDraftVersion: testContext.draftVersion,
          inputValues,
        },
      ));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">试运行输入</h3>
          <Badge variant="outline">模拟运行</Badge>
        </div>

        <div className="space-y-4">
          {inputs.map(input => (
            <TestInputField
              error={inputErrors[input.id]}
              input={input}
              key={input.id}
              onChange={(value) => {
                setRawValues(current => ({ ...current, [input.id]: value }));
                setInputErrors(current => ({ ...current, [input.id]: undefined }));
              }}
              rawValue={rawValues[input.id]}
            />
          ))}
          {inputs.length === 0 ? (
            <p className="text-sm text-muted-foreground">当前节点没有输入参数</p>
          ) : null}
        </div>

        <section className="mt-8" aria-label="试运行结果">
          <h3 className="mb-4 text-sm font-semibold">运行结果</h3>
          <AttemptResult
            attempt={attempt}
            error={requestError}
            output={outputSnapshot}
            starting={starting}
          />
        </section>
      </div>

      <footer className="shrink-0 border-t bg-background px-5 py-4">
        {!draftSaved ? (
          <p className="mb-2 text-xs text-muted-foreground" role="status">
            {testContext.saveState === "error" ? "当前配置保存失败，请重试" : "正在保存当前配置"}
          </p>
        ) : !configReady ? (
          <p className="mb-2 text-xs text-warning" role="status">请先完成节点配置</p>
        ) : null}
        {attempt?.status === "running" || stopping ? (
          <Button
            className="w-full"
            disabled={stopping}
            onClick={controller.stopAttempt}
            type="button"
            variant="outline"
          >
            {stopping
              ? <Spinner size={15} />
              : <HugeiconsIcon icon={StopCircleIcon} size={15} strokeWidth={1.8} />}
            {stopping ? "正在停止" : "停止运行"}
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={running || stopping || !draftSaved || !configReady}
            onClick={() => void startAttempt()}
            type="button"
          >
            {running ? <Spinner size={15} /> : <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />}
            {running ? "运行中" : attempt || requestError ? "重新运行" : "运行"}
          </Button>
        )}
      </footer>
      <WorkflowTestAttemptCloseDialog controller={controller} />
    </div>
  );
}

function TestInputField({
  error,
  input,
  onChange,
  rawValue,
}: {
  error?: string;
  input: WorkflowLlmInputParameter;
  onChange: (value: string) => void;
  rawValue?: string;
}) {
  const inputId = `llm-test-input-${input.id}`;
  const valueType = getInputValueType(input);
  const label = getValueTypeLabel(valueType);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={inputId}>{input.name || "未命名参数"}</Label>
        <Badge className="rounded-md px-1.5 py-0.5" variant="secondary">{label}</Badge>
      </div>
      {valueType.kind === "boolean" ? (
        <Select onValueChange={onChange} value={rawValue}>
          <SelectTrigger aria-label={`${input.name || "输入参数"}的试运行值`} id={inputId}>
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">是</SelectItem>
            <SelectItem value="false">否</SelectItem>
          </SelectContent>
        </Select>
      ) : valueType.kind === "datetime" ? (
        <DateTimePicker
          aria-label={`${input.name || "输入参数"}的试运行值`}
          onValueChange={onChange}
          value={rawValue ?? ""}
        />
      ) : valueType.kind === "array" || valueType.kind === "object" ? (
        <Textarea
          aria-invalid={Boolean(error)}
          aria-label={`${input.name || "输入参数"}的试运行值`}
          className="min-h-24 font-mono text-xs"
          id={inputId}
          onChange={event => onChange(event.target.value)}
          placeholder={valueType.kind === "array" ? "[]" : "{}"}
          value={rawValue ?? ""}
        />
      ) : (
        <Input
          aria-invalid={Boolean(error)}
          aria-label={`${input.name || "输入参数"}的试运行值`}
          id={inputId}
          onChange={event => onChange(event.target.value)}
          type={valueType.kind === "number" ? "number" : "text"}
          value={rawValue ?? ""}
        />
      )}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}

function AttemptResult({
  attempt,
  error,
  output,
  starting,
}: {
  attempt: WorkflowLlmTestAttempt | null;
  error: string | null;
  output: WorkflowLlmOutputConfig;
  starting: boolean;
}) {
  if (error) {
    return <ResultState icon={AlertCircleIcon} tone="error" title={error} />;
  }
  if (starting || attempt?.status === "running") {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border bg-muted/15 text-sm text-muted-foreground" role="status">
        <Spinner size={24} />
        <span>正在运行</span>
      </div>
    );
  }
  if (!attempt) {
    return <ResultState icon={PlayIcon} tone="muted" title="运行后查看" />;
  }
  if (attempt.status === "timed_out") {
    return <ResultState icon={Clock01Icon} tone="warning" title={attempt.errorMessage ?? "试运行超时"} />;
  }
  if (attempt.status === "failed" || attempt.status === "cancelled") {
    return (
      <ResultState
        icon={AlertCircleIcon}
        tone="error"
        title={attempt.errorMessage ?? (attempt.status === "cancelled" ? "试运行已停止" : "试运行失败")}
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-success" role="status">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={17} strokeWidth={1.8} />
        运行成功
      </div>
      <OutputValues output={output} values={attempt.output ?? {}} />
    </div>
  );
}

function OutputValues({ output, values }: { output: WorkflowLlmOutputConfig; values: WorkflowJsonObject }) {
  const fields = output.format === "json" ? output.fields : [output.field];
  return (
    <div className="divide-y rounded-lg border bg-background">
      {fields.map(field => (
        <div className="px-4 py-3" key={field.id}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium">{field.name}</span>
            <Badge className="rounded-md px-1.5 py-0.5" variant="secondary">
              {getOutputTypeLabel(field.type)}
            </Badge>
          </div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">
            {formatOutputValue(values[field.id])}
          </pre>
        </div>
      ))}
    </div>
  );
}

function ResultState({
  icon,
  title,
  tone,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  title: string;
  tone: "error" | "muted" | "warning";
}) {
  return (
    <div className={cn(
      "flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border bg-muted/15 px-6 text-center text-sm",
      tone === "error" && "text-destructive",
      tone === "muted" && "text-muted-foreground",
      tone === "warning" && "text-warning",
    )} role={tone === "muted" ? "status" : "alert"}>
      <HugeiconsIcon icon={icon} size={20} strokeWidth={1.8} />
      <span>{title}</span>
    </div>
  );
}

function createInitialRawValues(inputs: WorkflowLlmInputParameter[]): RawInputValues {
  return Object.fromEntries(inputs.map(input => [
    input.id,
    input.value.kind === "literal" ? input.value.value : undefined,
  ]));
}

function reconcileRawValues(current: RawInputValues, inputs: WorkflowLlmInputParameter[]) {
  return Object.fromEntries(inputs.map(input => [
    input.id,
    Object.prototype.hasOwnProperty.call(current, input.id)
      ? current[input.id]
      : input.value.kind === "literal" ? input.value.value : undefined,
  ]));
}

function parseInputValues(inputs: WorkflowLlmInputParameter[], rawValues: RawInputValues): {
  errors: InputErrors;
  values: WorkflowJsonObject | null;
} {
  const errors: InputErrors = {};
  const values: WorkflowJsonObject = {};
  for (const input of inputs) {
    const parsed = parseInputValue(input, rawValues[input.id]);
    if (parsed.error) errors[input.id] = parsed.error;
    else values[input.id] = parsed.value;
  }
  return Object.keys(errors).length > 0 ? { errors, values: null } : { errors, values };
}

function parseInputValue(input: WorkflowLlmInputParameter, rawValue: string | undefined): {
  error?: string;
  value: WorkflowJsonValue;
} {
  if (rawValue === undefined) return { error: "请填写试运行值", value: null };
  const valueType = getInputValueType(input);
  if (valueType.kind === "string" || valueType.kind === "datetime") return { value: rawValue };
  if (valueType.kind === "reference") {
    const trimmed = rawValue.trim();
    if (!trimmed) return { error: "请填写试运行值", value: null };
    return { value: trimmed };
  }
  if (valueType.kind === "number") {
    const numeric = Number(rawValue);
    return rawValue.trim() && Number.isFinite(numeric)
      ? { value: numeric }
      : { error: "请输入有效数字", value: null };
  }
  if (valueType.kind === "boolean") {
    if (rawValue === "true") return { value: true };
    if (rawValue === "false") return { value: false };
    return { error: "请选择试运行值", value: null };
  }
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (valueType.kind === "array") {
      if (!Array.isArray(parsed) || !isArrayValueCompatible(parsed, valueType.itemType)) {
        return { error: "请输入符合参数类型的 JSON 数组", value: null };
      }
      return { value: parsed as WorkflowJsonValue };
    }
    if (!isRecord(parsed)) return { error: "请输入 JSON 对象", value: null };
    return { value: parsed as WorkflowJsonValue };
  } catch {
    return { error: "请输入有效 JSON", value: null };
  }
}

function getInputValueType(input: WorkflowLlmInputParameter): WorkflowOutputValueType {
  return input.value.kind === "literal" ? { kind: "string" } : input.value.valueType;
}

function getValueTypeLabel(valueType: WorkflowOutputValueType) {
  if (valueType.kind === "reference") return "ID";
  if (valueType.kind === "array") return "Array";
  if (valueType.kind === "object") return "JSON";
  return ({
    boolean: "Boolean",
    datetime: "DateTime",
    number: "Number",
    string: "String",
  } as const)[valueType.kind];
}

function getOutputTypeLabel(type: "boolean" | "number" | "string") {
  return ({ boolean: "Boolean", number: "Number", string: "String" } as const)[type];
}

function isArrayValueCompatible(value: unknown[], itemType: "bigint" | "number" | "string") {
  return value.every(item => {
    if (itemType === "string") return typeof item === "string";
    if (itemType === "number") return typeof item === "number" && Number.isFinite(item);
    return typeof item === "number" && Number.isSafeInteger(item) && item > 0;
  });
}

function isRecord(value: unknown): value is Record<string, WorkflowJsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatOutputValue(value: WorkflowJsonValue | undefined) {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
