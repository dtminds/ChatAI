import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  WorkflowAiIntentTestAttemptCreateRequest,
  WorkflowInferenceTestAttempt,
  WorkflowJsonValue,
  WorkflowMessagesV1,
  WorkflowOutputValueType,
} from "@chatai/contracts";
import {
  Add01Icon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Delete01Icon,
  PlayIcon,
  StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { WorkflowNode } from "../../types";
import {
  getAvailableIntentInputOutputsForNode,
  resolveWorkflowVariable,
} from "../../workflow-variables";
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

const AI_INTENT_TEST_MESSAGE_MAX_COUNT = 10;
const AI_INTENT_TEST_MESSAGE_TEXT_MAX_LENGTH = 100;

type AiIntentTestMessageRole = "agent" | "customer";
type AiIntentTestMessageRow = {
  key: number;
  role: AiIntentTestMessageRole;
  text: string;
};

function createInitialMessageRows(): AiIntentTestMessageRow[] {
  return [{ key: 1, role: "customer", text: "" }];
}

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
  const [rawValue, setRawValue] = useState("");
  const [messageRows, setMessageRows] = useState(createInitialMessageRows);
  const nextMessageRowKey = useRef(2);
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
    setRawValue("");
    setMessageRows(createInitialMessageRows());
    nextMessageRowKey.current = 2;
    setInputError(null);
  }, [inputKey]);

  const startAttempt = async () => {
    if (controller.running || controller.stopping || !draftSaved || !configReady || !inputType) {
      return;
    }
    const inputValue = getAiIntentTestInputValue(rawValue, messageRows, inputType);
    if (inputValue === undefined) {
      setInputError("当前输入类型不支持试运行");
      return;
    }
    setInputError(null);
    await controller.startAttempt(() => createWorkflowAiIntentTestAttempt(
      testContext.workflowId,
      node.id,
      { expectedDraftVersion: testContext.draftVersion, inputValue },
    ));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">输入</span>
            {isMessagesType(inputType) ? (
              <Button
                disabled={messageRows.length >= AI_INTENT_TEST_MESSAGE_MAX_COUNT}
                onClick={() => {
                  setMessageRows((current) => current.length >= AI_INTENT_TEST_MESSAGE_MAX_COUNT
                    ? current
                    : [
                      ...current,
                      { key: nextMessageRowKey.current++, role: "customer", text: "" },
                    ]);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.8} />
                添加消息
              </Button>
            ) : null}
          </div>
          {isMessagesType(inputType) ? (
            <AiIntentTestMessageEditor
              messages={messageRows}
              onChange={setMessageRows}
            />
          ) : (
            <Textarea
              aria-invalid={Boolean(inputError)}
              aria-label="意图识别的试运行输入"
              className="min-h-28"
              onChange={event => {
                setRawValue(event.target.value);
                setInputError(null);
              }}
              placeholder="请输入内容"
              value={rawValue}
            />
          )}
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

function AiIntentTestMessageEditor({
  messages,
  onChange,
}: {
  messages: AiIntentTestMessageRow[];
  onChange: (messages: AiIntentTestMessageRow[]) => void;
}) {
  const updateMessage = (key: number, patch: Partial<Pick<AiIntentTestMessageRow, "role" | "text">>) => {
    onChange(messages.map((message) => message.key === key ? { ...message, ...patch } : message));
  };

  return (
    <div className="space-y-2">
      {messages.map((message, index) => (
        <div
          aria-label={`消息 ${index + 1}`}
          className="flex items-center gap-2"
          key={message.key}
          role="group"
        >
          <Select
            onValueChange={(role) => {
              if (role === "customer" || role === "agent") updateMessage(message.key, { role });
            }}
            value={message.role}
          >
            <SelectTrigger
              aria-label={`消息 ${index + 1} 角色`}
              className="h-9 w-[5.5rem] shrink-0 px-3 text-[13px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="customer">客户</SelectItem>
              <SelectItem value="agent">客服</SelectItem>
            </SelectContent>
          </Select>
          <Input
            aria-label={`消息 ${index + 1} 内容`}
            className="h-9 min-w-0 flex-1 text-[13px]"
            maxLength={AI_INTENT_TEST_MESSAGE_TEXT_MAX_LENGTH}
            onChange={(event) => updateMessage(message.key, { text: event.target.value })}
            placeholder="请输入消息内容"
            value={message.text}
          />
          <Button
            aria-label={`删除消息 ${index + 1}`}
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onChange(messages.filter((item) => item.key !== message.key))}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Delete01Icon} size={15} strokeWidth={1.8} />
          </Button>
        </div>
      ))}
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

function getAiIntentTestInputValue(
  rawValue: string,
  messageRows: AiIntentTestMessageRow[],
  valueType: WorkflowOutputValueType,
): WorkflowAiIntentTestAttemptCreateRequest["inputValue"] | undefined {
  if (valueType.kind === "string") return rawValue;
  if (!isMessagesType(valueType)) return undefined;
  return messageRows
    .filter((message) => message.text.trim().length > 0)
    .map((message, index) => ({
      id: index + 1,
      parts: [{ text: message.text, type: "text" as const }],
      role: message.role,
    })) satisfies WorkflowMessagesV1;
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
