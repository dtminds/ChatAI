import { useEffect, useMemo, useRef, useState } from "react";
import type {
  WorkflowOrderQueryTestRunResponse,
  WorkflowVariableSelector,
} from "@chatai/contracts";
import {
  CheckmarkCircle02Icon,
  PlayIcon,
  StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { RequestNormalizedError } from "@/lib/request";
import { toast } from "sonner";
import {
  SettingWorkspaceEditorContent,
  useSettingWorkspace,
} from "../../panels/setting-workspace";
import type { WorkflowNodeTestContext } from "../../panels/types";
import type { WorkflowNode, WorkflowVariableDefinition } from "../../types";
import { createWorkflowVariableReferenceSummarySegments } from "../../workflow-node-summary";
import { getWorkflowVariableSelectorKey, resolveWorkflowVariable } from "../../workflow-variables";
import { useWorkflowSurface } from "../../workflow-surface";
import { NodeSummaryText } from "../node-summary-text";
import {
  getWorkflowTestWorkspaceId,
  WorkflowTestWorkspaceTrigger,
} from "../test-attempt-controller";
import { isOrderQueryReady, normalizeOrderQuerySelector } from "./config";
import { runWorkflowOrderQueryTest } from "./test-service";

type TestInput = {
  label: string;
  selector: WorkflowVariableSelector;
  variable?: WorkflowVariableDefinition;
};

export function OrderQueryTestWorkspaceTrigger({ nodeId }: { nodeId: string }) {
  return <WorkflowTestWorkspaceTrigger ariaLabel="试运行订单查询节点" nodeId={nodeId} />;
}

export function OrderQueryTestWorkspace({
  node,
  testContext,
  timeVariables,
  variables,
}: {
  node: WorkflowNode<"order-query">;
  testContext: WorkflowNodeTestContext;
  timeVariables: WorkflowVariableDefinition[];
  variables: WorkflowVariableDefinition[];
}) {
  const { activeEditor } = useSettingWorkspace();
  const workspaceId = getWorkflowTestWorkspaceId(node.id);
  if (activeEditor?.id !== workspaceId) return null;
  return (
    <SettingWorkspaceEditorContent id={workspaceId}>
      <OrderQueryTestWorkspaceContent
        node={node}
        testContext={testContext}
        timeVariables={timeVariables}
        variables={variables}
      />
    </SettingWorkspaceEditorContent>
  );
}

function OrderQueryTestWorkspaceContent({
  node,
  testContext,
  timeVariables,
  variables,
}: {
  node: WorkflowNode<"order-query">;
  testContext: WorkflowNodeTestContext;
  timeVariables: WorkflowVariableDefinition[];
  variables: WorkflowVariableDefinition[];
}) {
  const surface = useWorkflowSurface();
  const inputs = useMemo(
    () => getTestInputs(node, timeVariables),
    [node, timeVariables],
  );
  const orderNumberVariable = useMemo(() => {
    const selector = normalizeOrderQuerySelector(node.data.orderNumberSelector);
    return selector ? resolveWorkflowVariable(variables, selector) : undefined;
  }, [node.data.orderNumberSelector, variables]);
  const [externalUserId, setExternalUserId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [rawValues, setRawValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [result, setResult] = useState<WorkflowOrderQueryTestRunResponse | null>(null);
  const [running, setRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const draftSaved = testContext.saveState === "saved";
  const configReady = node.data.mode === "order-number" || isOrderQueryReady({
    conditions: node.data.conditions,
    mode: "conditions",
  });

  useEffect(() => {
    const keys = new Set(inputs.map(input => getWorkflowVariableSelectorKey(input.selector)));
    setRawValues(current => Object.fromEntries(
      Object.entries(current).filter(([key]) => keys.has(key)),
    ));
    setErrors(current => Object.fromEntries(
      Object.entries(current).filter(([key]) =>
        key === "externalUserId" || key === "orderNumber" || keys.has(key)),
    ));
  }, [inputs]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const run = async () => {
    if (running || !draftSaved || !configReady) return;
    const parsed = parseTestInput(node, inputs, externalUserId, orderNumber, rawValues);
    setErrors(parsed.errors);
    if (!parsed.request) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setRunning(true);
    setResult(null);
    try {
      const next = await runWorkflowOrderQueryTest(
        testContext.workflowId,
        node.id,
        {
          expectedDraftVersion: testContext.draftVersion,
          ...parsed.request,
        },
        surface.apiBasePath,
        controller.signal,
      );
      if (mountedRef.current && !controller.signal.aborted) setResult(next);
    } catch (error) {
      if (!controller.signal.aborted) toast.error(getRequestErrorMessage(error));
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      if (mountedRef.current) setRunning(false);
    }
  };

  const stop = () => abortControllerRef.current?.abort();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
        <h3 className="mb-5 text-sm font-semibold">试运行输入</h3>
        <div className="space-y-4">
          {node.data.mode === "order-number" ? (
            <div className="space-y-2">
              <div className="flex min-w-0 items-center gap-2">
                <Label className="shrink-0 text-[13px]" htmlFor="order-query-test-order-number">订单号</Label>
                {orderNumberVariable ? (
                  <NodeSummaryText
                    className="text-[13px] font-normal"
                    segments={createWorkflowVariableReferenceSummarySegments(orderNumberVariable)}
                  />
                ) : null}
              </div>
              <Input
                aria-invalid={Boolean(errors.orderNumber)}
                aria-label="订单号试运行值"
                className="text-[13px] md:text-[13px]"
                id="order-query-test-order-number"
                onChange={(event) => {
                  setOrderNumber(event.target.value);
                  setErrors(current => ({ ...current, orderNumber: undefined }));
                }}
                placeholder="请输入订单号"
                value={orderNumber}
              />
              {errors.orderNumber ? (
                <p className="text-xs text-destructive" role="alert">{errors.orderNumber}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-[13px]" htmlFor="order-query-test-external-user-id">企微客户 ID</Label>
              <Input
                aria-invalid={Boolean(errors.externalUserId)}
                className="text-[13px] md:text-[13px]"
                id="order-query-test-external-user-id"
                inputMode="numeric"
                onChange={(event) => {
                  setExternalUserId(event.target.value);
                  setErrors(current => ({ ...current, externalUserId: undefined }));
                }}
                placeholder="请输入 externalUserId"
                value={externalUserId}
              />
              {errors.externalUserId ? (
                <p className="text-xs text-destructive" role="alert">{errors.externalUserId}</p>
              ) : null}
            </div>
          )}
          {inputs.length > 0 ? (
            <div className={inputs.length === 1 ? "grid grid-cols-1 gap-4" : "grid grid-cols-2 gap-4"}>
              {inputs.map((input) => {
                const key = getWorkflowVariableSelectorKey(input.selector);
                return (
                  <div className="min-w-0 space-y-2" key={key}>
                    <div className="flex min-w-0 items-center gap-2">
                      <Label className="shrink-0 text-[13px]" htmlFor={`order-query-test-${key}`}>{input.label}</Label>
                      {input.variable ? (
                        <NodeSummaryText
                          className="text-[13px] font-normal"
                          segments={createWorkflowVariableReferenceSummarySegments(input.variable)}
                        />
                      ) : null}
                    </div>
                    <DateTimePicker
                      aria-invalid={Boolean(errors[key])}
                      aria-label={`${input.label}试运行值`}
                      className="text-[13px]"
                      onValueChange={(value) => {
                        setRawValues(current => ({ ...current, [key]: value }));
                        setErrors(current => ({ ...current, [key]: undefined }));
                      }}
                      value={rawValues[key] ?? ""}
                    />
                    {errors[key] ? <p className="text-xs text-destructive" role="alert">{errors[key]}</p> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <section aria-label="试运行结果" className="mt-8">
          <h3 className="mb-4 text-sm font-semibold">运行结果</h3>
          <OrderQueryTestResult result={result} running={running} />
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
        {running ? (
          <Button className="w-full" onClick={stop} type="button" variant="outline">
            <HugeiconsIcon icon={StopCircleIcon} size={15} strokeWidth={1.8} />
            停止运行
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={!draftSaved || !configReady}
            onClick={() => void run()}
            type="button"
          >
            <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />
            {result ? "重新运行" : "运行"}
          </Button>
        )}
      </footer>
    </div>
  );
}

function OrderQueryTestResult({
  result,
  running,
}: {
  result: WorkflowOrderQueryTestRunResponse | null;
  running: boolean;
}) {
  if (running) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border bg-muted/15 text-sm text-muted-foreground" role="status">
        <Spinner size={24} />
        <span>正在运行</span>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border bg-muted/15 text-sm text-muted-foreground" role="status">
        <HugeiconsIcon icon={PlayIcon} size={20} strokeWidth={1.8} />
        <span>运行后查看</span>
      </div>
    );
  }
  const rows = [
    ["累计订单数", String(result.output.orderCount)],
    ["累计订单金额", formatAmount(result.output.totalAmount)],
    ["净成交金额", formatAmount(result.output.netAmount)],
  ] as const;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-success" role="status">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={17} strokeWidth={1.8} />
        运行成功
      </div>
      <dl className="divide-y rounded-lg border bg-background">
        {rows.map(([label, value]) => (
          <div className="px-4 py-3" key={label}>
            <dt className="mb-1 text-xs text-muted-foreground">{label}</dt>
            <dd className="whitespace-pre-wrap break-words text-sm">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function getTestInputs(
  node: WorkflowNode<"order-query">,
  timeVariables: WorkflowVariableDefinition[],
): TestInput[] {
  if (node.data.mode === "order-number") return [];
  if (node.data.conditions?.timeRange.mode !== "dynamic") return [];
  const inputByKey = new Map<string, TestInput>();
  for (const [label, selector] of [
    ["开始时间", node.data.conditions.timeRange.start],
    ["结束时间", node.data.conditions.timeRange.end],
  ] as const) {
    const key = getWorkflowVariableSelectorKey(selector);
    const existing = inputByKey.get(key);
    inputByKey.set(key, {
      label: existing ? "开始/结束时间" : label,
      selector,
      variable: resolveWorkflowVariable(timeVariables, selector),
    });
  }
  return [...inputByKey.values()];
}

function parseTestInput(
  node: WorkflowNode<"order-query">,
  inputs: TestInput[],
  externalUserIdRaw: string,
  orderNumberRaw: string,
  rawValues: Record<string, string>,
) {
  const errors: Record<string, string | undefined> = {};
  if (node.data.mode === "order-number") {
    const orderNumber = orderNumberRaw.trim();
    if (!orderNumber) errors.orderNumber = "请输入订单号";
    else if (orderNumber.length > 64) errors.orderNumber = "订单号不能超过64个字符";
    return Object.keys(errors).length > 0
      ? { errors, request: null }
      : { errors, request: { orderNumber } };
  }
  const externalUserId = Number(externalUserIdRaw);
  if (!externalUserIdRaw.trim() || !Number.isSafeInteger(externalUserId) || externalUserId <= 0) {
    errors.externalUserId = "请输入有效的企微客户 ID";
  }
  const variableValues = inputs.flatMap((input) => {
    const key = getWorkflowVariableSelectorKey(input.selector);
    const raw = rawValues[key] ?? "";
    if (!raw.trim()) {
      errors[key] = "请选择时间";
      return [];
    }
    const value = toUtc8Instant(raw);
    if (!value) {
      errors[key] = "请选择有效时间";
      return [];
    }
    return [{ selector: input.selector, value }];
  });
  return Object.keys(errors).length > 0
    ? { errors, request: null }
    : {
        errors,
        request: {
          externalUserId,
          variableValues,
        },
      };
}

function toUtc8Instant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const timestamp = Date.parse(`${value}:00+08:00`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function formatAmount(value: number) {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function getRequestErrorMessage(error: unknown) {
  if (error instanceof RequestNormalizedError && error.status) return error.message;
  return "操作失败，请稍后重试";
}
