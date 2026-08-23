import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  WorkflowAiIntentTestAttemptCreateRequest,
  WorkflowInferenceTestAttempt,
  WorkflowJsonValue,
  WorkflowMessagesV1,
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  SettingWorkspaceEditorContent,
  useSettingWorkspace,
} from "../../panels/setting-workspace";
import type { WorkflowNodeTestContext } from "../../panels/types";
import type { WorkflowNode } from "../../types";
import {
  getAvailableIntentInputOutputsForNode,
  resolveWorkflowVariable,
} from "../../workflow-variables";
import { getWorkflowOutputTypeLabel } from "../../workflow-node-outputs";
import { getAiIntentStatus, normalizeAiIntentInputSelector } from "./config";
import {
  cancelWorkflowAiIntentTestAttempt,
  createWorkflowAiIntentTestAttempt,
  getWorkflowAiIntentTestAttempt,
} from "./test-service";
import {
  getWorkflowTestWorkspaceId,
  useWorkflowTestAttemptController,
  WorkflowTestAttemptCloseDialog,
  WorkflowTestWorkspaceTrigger,
} from "../test-attempt-controller";

export function AiIntentTestWorkspaceTrigger({ nodeId }: { nodeId: string }) {
  return <WorkflowTestWorkspaceTrigger ariaLabel="试运行意图识别节点" nodeId={nodeId} />;
}

export function AiIntentTestWorkspace({
  edges,
  node,
  nodes,
  testContext,
}: {
  edges: Parameters<typeof getAvailableIntentInputOutputsForNode>[2];
  node: WorkflowNode<"ai-intent">;
  nodes: WorkflowNode[];
  testContext: WorkflowNodeTestContext;
}) {
  const { activeEditor } = useSettingWorkspace();
  const workspaceId = getWorkflowTestWorkspaceId(node.id);
  if (activeEditor?.id !== workspaceId) return null;
  return (
    <SettingWorkspaceEditorContent id={workspaceId}>
      <AiIntentTestWorkspaceContent
        edges={edges}
        node={node}
        nodes={nodes}
        testContext={testContext}
      />
    </SettingWorkspaceEditorContent>
  );
}

function AiIntentTestWorkspaceContent({
  edges,
  node,
  nodes,
  testContext,
}: {
  edges: Parameters<typeof getAvailableIntentInputOutputsForNode>[2];
  node: WorkflowNode<"ai-intent">;
  nodes: WorkflowNode[];
  testContext: WorkflowNodeTestContext;
}) {
  const inputSelector = normalizeAiIntentInputSelector(node.data.inputSelector);
  const inputOptions = useMemo(
    () => getAvailableIntentInputOutputsForNode(node.id, nodes, edges),
    [edges, node.id, nodes],
  );
  const inputVariable = inputSelector
    ? resolveWorkflowVariable(inputOptions, inputSelector)
    : undefined;
  const inputType = inputVariable?.valueType;
  const inputKey = inputType ? JSON.stringify(inputType) : "missing";
  const [rawValue, setRawValue] = useState(() => getInitialRawValue(inputType));
  const [inputError, setInputError] = useState<string | null>(null);
  const getAttempt = useCallback((attemptId: string) => getWorkflowAiIntentTestAttempt(
    testContext.workflowId,
    node.id,
    attemptId,
  ), [node.id, testContext.workflowId]);
  const cancelAttempt = useCallback((attemptId: string) => cancelWorkflowAiIntentTestAttempt(
    testContext.workflowId,
    node.id,
    attemptId,
  ), [node.id, testContext.workflowId]);
  const controller = useWorkflowTestAttemptController({ cancelAttempt, getAttempt });
  const configReady = getAiIntentStatus(node.data) === "ready" && Boolean(inputVariable);
  const draftSaved = testContext.saveState === "saved";

  useEffect(() => {
    setRawValue(getInitialRawValue(inputType));
    setInputError(null);
  }, [inputKey]);

  const startAttempt = async () => {
    if (controller.running || controller.stopping || !draftSaved || !configReady || !inputType) {
      return;
    }
    const parsed = parseAiIntentTestInput(rawValue, inputType);
    setInputError(parsed.error);
    if (parsed.value === undefined) return;
    const inputValue = parsed.value;
    await controller.startAttempt(() => createWorkflowAiIntentTestAttempt(
      testContext.workflowId,
      node.id,
      { expectedDraftVersion: testContext.draftVersion, inputValue },
    ));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">试运行输入</h3>
          <Badge variant="outline">模拟运行</Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">输入</span>
            {inputType ? (
              <Badge className="rounded-md px-1.5 py-0.5" variant="secondary">
                {getWorkflowOutputTypeLabel(inputType)}
              </Badge>
            ) : null}
          </div>
          <Textarea
            aria-invalid={Boolean(inputError)}
            aria-label="意图识别的试运行输入"
            className={cn(
              "min-h-28",
              isMessagesType(inputType) && "font-mono text-xs",
            )}
            onChange={event => {
              setRawValue(event.target.value);
              setInputError(null);
            }}
            placeholder={isMessagesType(inputType) ? "[]" : "请输入内容"}
            value={rawValue}
          />
          {inputError ? <p className="text-xs text-destructive" role="alert">{inputError}</p> : null}
        </div>

        <section className="mt-8" aria-label="试运行结果">
          <h3 className="mb-4 text-sm font-semibold">运行结果</h3>
          <AiIntentAttemptResult
            attempt={controller.attempt}
            error={controller.requestError}
            starting={controller.starting}
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
        {controller.attempt?.status === "running" || controller.stopping ? (
          <Button
            className="w-full"
            disabled={controller.stopping}
            onClick={controller.stopAttempt}
            type="button"
            variant="outline"
          >
            {controller.stopping
              ? <Spinner size={15} />
              : <HugeiconsIcon icon={StopCircleIcon} size={15} strokeWidth={1.8} />}
            {controller.stopping ? "正在停止" : "停止运行"}
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={controller.running || !draftSaved || !configReady}
            onClick={() => void startAttempt()}
            type="button"
          >
            {controller.running
              ? <Spinner size={15} />
              : <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />}
            {controller.running
              ? "运行中"
              : controller.attempt || controller.requestError ? "重新运行" : "运行"}
          </Button>
        )}
      </footer>
      <WorkflowTestAttemptCloseDialog controller={controller} />
    </div>
  );
}

function AiIntentAttemptResult({
  attempt,
  error,
  starting,
}: {
  attempt: WorkflowInferenceTestAttempt | null;
  error: string | null;
  starting: boolean;
}) {
  if (error) return <ResultState icon={AlertCircleIcon} tone="error" title={error} />;
  if (starting || attempt?.status === "running") {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border bg-muted/15 text-sm text-muted-foreground" role="status">
        <Spinner size={24} />
        <span>正在运行</span>
      </div>
    );
  }
  if (!attempt) return <ResultState icon={PlayIcon} tone="muted" title="运行后查看" />;
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
      <div className="divide-y rounded-lg border bg-background">
        <ResultValue label="命中意图" value={attempt.output?.matchedIntentDescription} />
        <ResultValue label="判断原因" value={attempt.output?.reason} />
      </div>
    </div>
  );
}

function ResultValue({ label, value }: { label: string; value: WorkflowJsonValue | undefined }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 text-xs font-medium">{label}</div>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">
        {formatOutputValue(value)}
      </pre>
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

function getInitialRawValue(valueType: WorkflowOutputValueType | undefined) {
  return isMessagesType(valueType) ? "[]" : "";
}

function parseAiIntentTestInput(
  rawValue: string,
  valueType: WorkflowOutputValueType,
): {
  error: string | null;
  value: WorkflowAiIntentTestAttemptCreateRequest["inputValue"] | undefined;
} {
  if (valueType.kind === "string") return { error: null, value: rawValue };
  if (!isMessagesType(valueType)) return { error: "当前输入类型不支持试运行", value: undefined };
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return { error: "请输入消息列表 JSON", value: undefined };
    return { error: null, value: parsed as WorkflowMessagesV1 };
  } catch {
    return { error: "请输入有效 JSON", value: undefined };
  }
}

function isMessagesType(
  valueType: WorkflowOutputValueType | undefined,
): valueType is Extract<WorkflowOutputValueType, { kind: "object" }> {
  return valueType?.kind === "object" && valueType.schemaRef === "workflow.messages.v1";
}

function formatOutputValue(value: WorkflowJsonValue | undefined) {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
