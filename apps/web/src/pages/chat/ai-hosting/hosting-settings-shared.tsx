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

export const FULL_AUTO_AUTH_UNAVAILABLE_MESSAGE =
  "该功能内测中，如需开通请联系客服";

export function PermissionSettingRow({
  checked,
  className,
  description,
  disabled = false,
  id,
  onCheckedChange,
  title,
  tooltip,
}: {
  checked: boolean;
  className?: string;
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
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-border px-4 py-3.5 last:border-b-0",
        className,
      )}
    >
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
