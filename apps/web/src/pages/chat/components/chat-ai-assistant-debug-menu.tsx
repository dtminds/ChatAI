import { Bug01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChatAIAssistantStatus } from "@/pages/chat/components/chat-ai-assistant-status-bar";

export type ChatAIAssistantDebugScenario =
  | "waiting"
  | "thinking"
  | "thinking-order"
  | "thinking-cancellable"
  | "confirmation";

const STATUS_OPTIONS: Array<{
  label: string;
  value: ChatAIAssistantDebugScenario;
}> = [
  { label: "等待", value: "waiting" },
  { label: "思考中", value: "thinking" },
  { label: "思考中 · 查询订单", value: "thinking-order" },
  { label: "思考中 · 可取消", value: "thinking-cancellable" },
  { label: "待确认 · 退款", value: "confirmation" },
];

export function ChatAIAssistantDebugMenu({
  className,
  onValueChange,
  value,
}: {
  className?: string;
  onValueChange: (value: ChatAIAssistantDebugScenario) => void;
  value: ChatAIAssistantDebugScenario;
}) {
  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <DropdownMenu>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="切换 AI 辅助条调试状态"
                className={cn(
                  "size-8 rounded-[8px] border border-divider bg-surface/95 p-0 text-muted-foreground hover:bg-accent hover:text-foreground",
                  className,
                )}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={Bug01Icon}
                  size={16}
                  strokeWidth={1.8}
                />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            调试辅助条状态
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end" side="top" sideOffset={8}>
        <DropdownMenuRadioGroup
          onValueChange={(nextValue) => {
            if (isChatAIAssistantDebugScenario(nextValue)) {
              onValueChange(nextValue);
            }
          }}
          value={value}
        >
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function getChatAIAssistantDebugScenarioView(
  scenario: ChatAIAssistantDebugScenario,
): {
  hasThinkingAction: boolean;
  label?: string;
  status: ChatAIAssistantStatus;
} {
  if (scenario === "thinking-order") {
    return {
      hasThinkingAction: false,
      label: "正在查询订单信息",
      status: "thinking",
    };
  }

  if (scenario === "thinking-cancellable") {
    return {
      hasThinkingAction: true,
      label: "正在执行售后 SOP",
      status: "thinking",
    };
  }

  if (scenario === "confirmation") {
    return {
      hasThinkingAction: false,
      label: "确认退款 100 元",
      status: "confirmation",
    };
  }

  return {
    hasThinkingAction: false,
    status: scenario,
  };
}

function isChatAIAssistantDebugScenario(
  value: string,
): value is ChatAIAssistantDebugScenario {
  return STATUS_OPTIONS.some((option) => option.value === value);
}
