import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getNodeConfigSections } from "../node-config-schema";
import { actionOptions, agentOptions } from "../node-options";
import { FieldGroup } from "./field-group";
import { NodeConfigSchemaSections } from "./schema-fields";
import type { NodeSettingsProps } from "./types";

export function TriggerConfig({ node, onNodeChange }: NodeSettingsProps) {
  return (
    <>
      <NodeConfigSchemaSections
        data={node.data}
        onNodeChange={onNodeChange}
        sections={getNodeConfigSections("trigger")}
      />
      <div className="flex items-center justify-between rounded-[10px] border bg-card p-3">
        <div>
          <div className="text-sm font-medium">允许重复进入</div>
          <p className="mt-1 text-xs text-muted-foreground">同一客户 7 天内最多进入一次</p>
        </div>
        <Switch aria-label="允许重复进入" defaultChecked />
      </div>
    </>
  );
}

export function WaitConfig({ node, onNodeChange }: NodeSettingsProps) {
  return (
    <>
      <NodeConfigSchemaSections
        data={node.data}
        onNodeChange={onNodeChange}
        sections={getNodeConfigSections("wait")}
      />
      <div className="rounded-[10px] border bg-card p-3 text-xs leading-5 text-muted-foreground">
        客户进入等待后，将在设定时间结束时继续执行下一步
      </div>
    </>
  );
}

export function BranchConfig({ node, onNodeChange }: NodeSettingsProps) {
  return (
    <>
      <NodeConfigSchemaSections
        data={node.data}
        onNodeChange={onNodeChange}
        sections={getNodeConfigSections("branch")}
      />
      <FieldGroup title="分支路径">
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
      </FieldGroup>
    </>
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
    <>
      <NodeConfigSchemaSections
        data={node.data}
        onNodeChange={onNodeChange}
        sections={getNodeConfigSections("goal")}
      />
      <Progress aria-label="目标达成进度" className="h-2" value={conversion * 4} />
    </>
  );
}
