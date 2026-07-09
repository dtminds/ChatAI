import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type HostingAgentOption = {
  id: string;
  isPublished: boolean;
  name: string;
};

export function PermissionSettingRow({
  checked,
  description,
  disabled = false,
  id,
  onCheckedChange,
  title,
  tooltip,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  id: string;
  onCheckedChange: (checked: boolean) => void;
  title: string;
  tooltip?: string;
}) {
  const switchControl = (
    <Switch
      checked={checked}
      disabled={disabled}
      id={id}
      onCheckedChange={onCheckedChange}
    />
  );

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3.5 last:border-b-0">
      <div className="min-w-0 space-y-1">
        <Label className="font-medium text-foreground" htmlFor={id}>
          {title}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {tooltip ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex" tabIndex={0}>
                {switchControl}
              </span>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        switchControl
      )}
    </div>
  );
}

export function AgentAssociationField({
  agentId,
  agents,
  id = "hosting-settings-agent",
  onAgentIdChange,
  onGoToAddAgent,
  placeholder = "请选择 Agent",
}: {
  agentId: string | undefined;
  agents: HostingAgentOption[];
  id?: string;
  onAgentIdChange: (agentId: string) => void;
  onGoToAddAgent: () => void;
  placeholder?: string;
}) {
  if (agents.length === 0) {
    return (
      <div className="flex h-10 items-center justify-center rounded-[8px] border border-border bg-background px-3 text-sm text-muted-foreground">
        暂无 Agent，
        <Button
          className="h-auto p-0 text-primary"
          onClick={onGoToAddAgent}
          type="button"
          variant="link"
        >
          请去添加
        </Button>
      </div>
    );
  }

  return (
    <Select onValueChange={onAgentIdChange} value={agentId}>
      <SelectTrigger className="w-full" id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {agents.map((agent) => (
          <SelectItem disabled={!agent.isPublished} key={agent.id} value={agent.id}>
            {agent.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FeatureStatus({ enabled }: { enabled: boolean }) {
  return (
    <span className={cn("text-sm", enabled ? "text-emerald-600" : "text-foreground")}>
      {enabled ? "启用" : "关闭"}
    </span>
  );
}

export function HostingCapabilityBadge({
  enabled,
  label,
}: {
  enabled: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-xs leading-5",
        enabled ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground",
      )}
    >
      <span>{label}</span>
      <span aria-hidden="true">|</span>
      <span>{enabled ? "启用" : "关闭"}</span>
    </span>
  );
}

export function HostingAgentCapabilityCell({
  agentName,
  fullAutoAuth,
  semiAutoAuth,
}: {
  agentName: string | null;
  fullAutoAuth: boolean;
  semiAutoAuth: boolean;
}) {
  if (!agentName) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{agentName}</p>
      <div className="flex flex-wrap gap-2">
        <HostingCapabilityBadge enabled={fullAutoAuth} label="AI自动回复" />
        <HostingCapabilityBadge enabled={semiAutoAuth} label="话术推荐" />
      </div>
    </div>
  );
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

export function getInitial(name: string) {
  return name.trim().slice(0, 1) || "?";
}
