import type { ComponentType, ReactNode } from "react";
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  MoreHorizontalIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  actionOptions,
  agentOptions,
  getNodeVariables,
  nodeVisuals,
} from "../node-definitions";
import type {
  InspectorTab,
  MarketingNodeData,
  MarketingNodeKind,
  MarketingWorkflowNode,
  NodeRunRecord,
} from "../types";

type NodeSettingsProps = {
  node: MarketingWorkflowNode;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
};

const panelComponentMap: Record<MarketingNodeKind, ComponentType<NodeSettingsProps>> = {
  action: ActionConfig,
  ai: AiReceptionConfig,
  branch: BranchConfig,
  goal: GoalConfig,
  trigger: TriggerConfig,
  wait: WaitConfig,
};

export function NodeConfigPanel({
  activeTab,
  lastRun,
  node,
  onClose,
  onNodeChange,
  onRunNode,
  onTabChange,
}: {
  activeTab: InspectorTab;
  lastRun?: NodeRunRecord;
  node?: MarketingWorkflowNode;
  onClose: () => void;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
  onRunNode: () => void;
  onTabChange: (tab: InspectorTab) => void;
}) {
  if (!node) {
    return (
      <aside aria-label="节点配置" className="bg-background p-5" role="complementary">
        <p className="text-sm text-muted-foreground">请选择一个节点</p>
      </aside>
    );
  }

  const visual = nodeVisuals[node.data.kind];

  return (
    <aside
      aria-label="节点配置"
      className="workflow-config-panel absolute bottom-1 right-1 top-2 z-20 flex w-[26.25rem] min-h-0 flex-col rounded-2xl border border-[var(--workflow-border)] bg-[var(--workflow-panel-bg-blur)] shadow-xl backdrop-blur-[10px] max-xl:w-[23.5rem] max-lg:relative max-lg:inset-auto max-lg:w-full max-lg:rounded-none max-lg:border-x-0"
      role="complementary"
    >
      <div className="border-b border-[var(--workflow-border)] p-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1",
              visual.accentClassName,
            )}
          >
            <HugeiconsIcon icon={visual.icon} size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold">{node.data.title}</h2>
              <Badge className="h-5 rounded-md px-1.5 text-[11px]" variant="secondary">
                {visual.label}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{node.data.summary}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              aria-label="运行当前节点"
              className="size-8 rounded-lg p-0"
              onClick={onRunNode}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />
            </Button>
            <Button aria-label="更多节点操作" className="size-8 rounded-lg p-0" type="button" variant="ghost">
              <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.8} />
            </Button>
            <Button
              aria-label="关闭节点配置"
              className="size-8 rounded-lg p-0"
              onClick={onClose}
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.8} />
            </Button>
          </div>
        </div>
        <Tabs
          className="mt-4 gap-0"
          onValueChange={(value) => {
            if (value) {
              onTabChange(value as InspectorTab);
            }
          }}
          value={activeTab}
        >
          <TabsList aria-label="节点配置视图" className="h-9 w-full rounded-[10px]">
            <TabsTrigger className="h-7 flex-1 rounded-[8px] px-3 py-0 text-xs" value="settings">
              设置
            </TabsTrigger>
            <TabsTrigger className="h-7 flex-1 rounded-[8px] px-3 py-0 text-xs" value="run">
              上次运行
            </TabsTrigger>
            <TabsTrigger className="h-7 flex-1 rounded-[8px] px-3 py-0 text-xs" value="variables">
              变量
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {activeTab === "settings" ? (
          <NodeSettingsForm node={node} onNodeChange={onNodeChange} />
        ) : null}
        {activeTab === "run" ? (
          <LastRunPanel lastRun={lastRun} node={node} onRunNode={onRunNode} />
        ) : null}
        {activeTab === "variables" ? <NodeVariablesPanel node={node} /> : null}
      </div>
    </aside>
  );
}

function NodeSettingsForm({ node, onNodeChange }: NodeSettingsProps) {
  const SettingsPanel = panelComponentMap[node.data.kind];

  return (
    <>
      <FieldGroup title="基础信息">
        <div className="space-y-2">
          <Label htmlFor="workflow-node-title">节点名称</Label>
          <Input
            id="workflow-node-title"
            onChange={(event) =>
              onNodeChange({
                title: event.target.value,
              })
            }
            value={node.data.title}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workflow-node-summary">节点说明</Label>
          <Textarea
            className="min-h-20 resize-none"
            id="workflow-node-summary"
            onChange={(event) =>
              onNodeChange({
                summary: event.target.value,
              })
            }
            value={node.data.summary}
          />
        </div>
      </FieldGroup>

      <SettingsPanel node={node} onNodeChange={onNodeChange} />
    </>
  );
}

function LastRunPanel({
  lastRun,
  node,
  onRunNode,
}: {
  lastRun?: NodeRunRecord;
  node: MarketingWorkflowNode;
  onRunNode: () => void;
}) {
  if (!lastRun) {
    return (
      <section className="workflow-field-group rounded-xl border border-[var(--workflow-border)] bg-[var(--workflow-panel-section)] p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--workflow-soft)] text-muted-foreground">
            <HugeiconsIcon icon={PlayIcon} size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">尚未运行</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              运行当前节点后，这里会显示输入、输出、耗时和执行日志
            </p>
          </div>
        </div>
        <Button className="mt-4 h-8 w-full gap-1.5 text-xs" onClick={onRunNode} type="button">
          <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />
          运行 {node.data.title}
        </Button>
      </section>
    );
  }

  return (
    <>
      <section className="workflow-field-group rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={17} strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-emerald-900">运行成功</h3>
              <p className="text-xs text-emerald-700">{lastRun.finishedAt}</p>
            </div>
          </div>
          <Badge className="rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            {lastRun.durationMs}ms
          </Badge>
        </div>
      </section>

      <FieldGroup title="输入">
        <RuntimeBlock>{lastRun.input}</RuntimeBlock>
      </FieldGroup>

      <FieldGroup title="输出">
        <RuntimeBlock>{lastRun.output}</RuntimeBlock>
      </FieldGroup>

      <FieldGroup title="日志">
        <div className="space-y-2">
          {lastRun.logs.map((log) => (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" key={log}>
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>{log}</span>
            </div>
          ))}
        </div>
      </FieldGroup>
    </>
  );
}

function RuntimeBlock({ children }: { children: string }) {
  return (
    <pre className="max-h-36 overflow-auto rounded-lg bg-background p-3 text-xs leading-5 text-foreground shadow-xs">
      {children}
    </pre>
  );
}

function NodeVariablesPanel({ node }: { node: MarketingWorkflowNode }) {
  const variables = getNodeVariables(node);

  return (
    <>
      <FieldGroup title="输入变量">
        <VariableList variables={variables.inputs} />
      </FieldGroup>
      <FieldGroup title="输出变量">
        <VariableList variables={variables.outputs} />
      </FieldGroup>
    </>
  );
}

function VariableList({
  variables,
}: {
  variables: Array<{ name: string; type: string; value: string }>;
}) {
  return (
    <div className="space-y-2">
      {variables.map((variable) => (
        <div
          className="rounded-lg border border-[var(--workflow-border)] bg-background px-3 py-2 shadow-xs"
          key={variable.name}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-xs font-medium text-foreground">{variable.name}</span>
            <span className="shrink-0 rounded-md bg-[var(--workflow-soft)] px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {variable.type}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{variable.value}</p>
        </div>
      ))}
    </div>
  );
}

function FieldGroup({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="workflow-field-group space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function TriggerConfig({ node, onNodeChange }: NodeSettingsProps) {
  return (
    <FieldGroup title="进入规则">
      <div className="space-y-2">
        <Label htmlFor="workflow-audience">触发人群</Label>
        <Input
          id="workflow-audience"
          onChange={(event) =>
            onNodeChange({
              audience: event.target.value,
              metric: event.target.value ? "预计进入 124.8万人" : "未配置人群",
              status: event.target.value ? "running" : "warning",
            })
          }
          value={node.data.audience ?? ""}
        />
      </div>
      <div className="flex items-center justify-between rounded-[10px] border bg-card p-3">
        <div>
          <div className="text-sm font-medium">允许重复进入</div>
          <p className="mt-1 text-xs text-muted-foreground">同一客户 7 天内最多进入一次</p>
        </div>
        <Switch aria-label="允许重复进入" defaultChecked />
      </div>
    </FieldGroup>
  );
}

function WaitConfig({ node, onNodeChange }: NodeSettingsProps) {
  const delayDays = node.data.delayDays ?? 2;

  return (
    <FieldGroup title="等待时间">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <Input
          aria-label="等待天数"
          min={0}
          onChange={(event) => {
            const nextDelay = Math.max(Number(event.target.value), 0);
            onNodeChange({
              delayDays: nextDelay,
              metric: `${nextDelay} 天后唤醒`,
              summary: `等待 ${nextDelay} 天后继续触达`,
            });
          }}
          type="number"
          value={delayDays}
        />
        <span className="text-sm text-muted-foreground">天</span>
      </div>
      <div className="rounded-[10px] border bg-card p-3 text-xs leading-5 text-muted-foreground">
        真实执行层会把等待写入持久化 job；本 DEMO 仅展示前端配置体验
      </div>
    </FieldGroup>
  );
}

function BranchConfig({ node, onNodeChange }: NodeSettingsProps) {
  return (
    <FieldGroup title="分支条件">
      <div className="space-y-2">
        <Label htmlFor="workflow-branch-rule">条件表达式</Label>
        <Textarea
          className="min-h-24 resize-none"
          id="workflow-branch-rule"
          onChange={(event) =>
            onNodeChange({
              branchRule: event.target.value,
              metric: event.target.value ? "2 条分支" : "未配置分支",
              status: event.target.value ? "ready" : "warning",
            })
          }
          value={node.data.branchRule ?? ""}
        />
      </div>
      <div className="grid gap-2">
        {["高意向客户", "普通客户", "默认路径"].map((branch) => (
          <div
            className="flex items-center justify-between rounded-[8px] border bg-card px-3 py-2 text-sm"
            key={branch}
          >
            <span>{branch}</span>
            <Badge className="rounded-[6px]" variant="outline">
              已连接
            </Badge>
          </div>
        ))}
      </div>
    </FieldGroup>
  );
}

function ActionConfig({ node, onNodeChange }: NodeSettingsProps) {
  return (
    <FieldGroup title="动作类型">
      <div className="grid grid-cols-2 gap-2">
        {actionOptions.map((option) => {
          const isActive = node.data.actionType === option.type;

          return (
            <button
              className={cn(
                "flex min-h-[78px] flex-col items-start rounded-[10px] border bg-card p-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
                isActive && "border-primary bg-primary/5",
              )}
              key={option.type}
              onClick={() =>
                onNodeChange({
                  actionType: option.type,
                  label: option.label,
                  metric: option.summary,
                  status: "ready",
                  summary: option.summary,
                  title: option.label,
                })
              }
              type="button"
            >
              <HugeiconsIcon icon={option.icon} size={17} strokeWidth={1.8} />
              <span className="mt-2 text-sm font-medium">{option.label}</span>
              <span className="mt-1 text-xs leading-4 text-muted-foreground">{option.summary}</span>
            </button>
          );
        })}
      </div>
    </FieldGroup>
  );
}

function AiReceptionConfig({ node, onNodeChange }: NodeSettingsProps) {
  return (
    <FieldGroup title="AI 接待策略">
      <div className="space-y-2">
        {agentOptions.map((agent) => {
          const isActive = node.data.agentName === agent.name;

          return (
            <button
              aria-label={`选择${agent.name}`}
              className={cn(
                "w-full rounded-[10px] border bg-card p-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
                isActive && "border-primary bg-primary/5",
              )}
              key={agent.name}
              onClick={() =>
                onNodeChange({
                  actionType: "ai",
                  agentName: agent.name,
                  label: "AI 接待",
                  metric: agent.knowledge,
                  status: "ready",
                  summary: agent.name,
                })
              }
              type="button"
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-sm font-semibold">{agent.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {agent.description}
                  </span>
                </span>
                {isActive ? (
                  <HugeiconsIcon
                    className="text-primary"
                    icon={CheckmarkCircle02Icon}
                    size={18}
                    strokeWidth={1.8}
                  />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <Separator />
      <div className="space-y-2">
        <Label htmlFor="workflow-handoff-rule">转人工条件</Label>
        <Textarea
          className="min-h-20 resize-none"
          id="workflow-handoff-rule"
          placeholder="例如：客户投诉、要求人工、连续两轮未解决"
          defaultValue="客户要求人工、投诉升级、识别到价格异议"
        />
      </div>
    </FieldGroup>
  );
}

function GoalConfig({ node, onNodeChange }: NodeSettingsProps) {
  const conversion = node.data.conversion ?? 18.4;

  return (
    <FieldGroup title="目标设置">
      <div className="space-y-2">
        <Label htmlFor="workflow-conversion">目标转化率</Label>
        <Input
          id="workflow-conversion"
          onChange={(event) => {
            const nextConversion = Math.max(Number(event.target.value), 0);
            onNodeChange({
              conversion: nextConversion,
              metric: `目标 ${nextConversion}%`,
            });
          }}
          type="number"
          value={conversion}
        />
      </div>
      <Progress aria-label="目标达成进度" className="h-2" value={conversion * 4} />
    </FieldGroup>
  );
}
