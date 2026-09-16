import { Bug01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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
import type { AgentTurnMockScenario } from "@chatai/contracts";

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

const MOCK_OPTIONS: Array<{
  label: string;
  value: AgentTurnMockScenario;
}> = [
  { label: "知识库回复", value: "knowledge_reply" },
  { label: "订单查询", value: "order_reply" },
  { label: "订单绑定审批", value: "order_binding_approval" },
  { label: "售后人工审批", value: "after_sales_approval" },
  { label: "客服澄清", value: "operator_clarification" },
  { label: "工具失败后继续", value: "tool_failure" },
  { label: "无需回复", value: "no_reply" },
];

export function ChatAIAssistantDebugMenu({
  className,
  disabled,
  mockScenario,
  onMockScenarioSelect,
  onValueChange,
  value,
}: {
  className?: string;
  disabled?: boolean;
  mockScenario?: AgentTurnMockScenario;
  onMockScenarioSelect?: (scenario: AgentTurnMockScenario) => void;
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
                disabled={disabled}
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
        <DropdownMenuLabel>静态状态</DropdownMenuLabel>
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
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Backend Mock</DropdownMenuLabel>
        {MOCK_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onMockScenarioSelect?.(option.value)}
          >
            <span className="flex-1">{option.label}</span>
            {mockScenario === option.value ? (
              <span className="text-xs text-muted-foreground">运行中</span>
            ) : null}
          </DropdownMenuItem>
        ))}
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
