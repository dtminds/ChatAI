import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { actionOptions, agentOptions } from "../node-definitions";
import { FieldGroup } from "./field-group";
import type { NodeSettingsProps } from "./types";

export function TriggerConfig({ node, onNodeChange }: NodeSettingsProps) {
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

export function WaitConfig({ node, onNodeChange }: NodeSettingsProps) {
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

export function BranchConfig({ node, onNodeChange }: NodeSettingsProps) {
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

export function ActionConfig({ node, onNodeChange }: NodeSettingsProps) {
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

export function AiReceptionConfig({ node, onNodeChange }: NodeSettingsProps) {
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

export function GoalConfig({ node, onNodeChange }: NodeSettingsProps) {
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
