import {
  ShoppingBasket01Icon,
  ToolCaseIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useEffect,
  useState,
  type ComponentType,
  type FormEvent,
} from "react";
import type { AgentTurnMockApproval } from "@/pages/chat/components/use-agent-turn-mock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAppearanceStore } from "@/store/appearance-store";

type ToolApprovalContentProps = {
  input: unknown;
};

type ToolApprovalDefinition = {
  Content: ComponentType<ToolApprovalContentProps>;
  title: string;
};

const TOOL_APPROVAL_RENDERERS: Record<string, ToolApprovalDefinition> = {
  "after_sales.apply": {
    Content: AfterSalesApprovalContent,
    title: "申请退款",
  },
  "order.bind": {
    Content: OrderBindApprovalContent,
    title: "绑定订单",
  },
};

export function ChatAgentToolApprovalPrompt({
  approval,
  disabled = false,
  onApprove,
  onRedirect,
  onReject,
}: {
  approval: AgentTurnMockApproval;
  disabled?: boolean;
  onApprove: () => void;
  onRedirect: (instruction: string) => void;
  onReject: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [isRedirectOpen, setIsRedirectOpen] = useState(false);
  const beamTheme = useAppearanceStore((state) =>
    state.themePreference === "dark" ||
    (state.themePreference === "system" && state.isSystemDarkMode)
      ? "dark"
      : "light",
  );
  const definition = TOOL_APPROVAL_RENDERERS[approval.toolCall.name];
  const Content = definition?.Content ?? GenericToolApprovalContent;
  const icon =
    approval.toolCall.name === "order.bind"
      ? ShoppingBasket01Icon
      : ToolCaseIcon;
  const title = definition?.title ?? approval.toolCall.name;

  useEffect(() => {
    setInstruction("");
    setIsRedirectOpen(false);
  }, [approval.decisionId]);

  const handleRedirect = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const resolvedInstruction = instruction.trim();
    if (!resolvedInstruction || disabled) return;

    onRedirect(resolvedInstruction);
    setIsRedirectOpen(false);
  };

  return (
    <section
      aria-label={`${title}工具审批`}
      className="chat-agent-tool-approval-surface chat-composer-surface relative z-20 rounded-[18px] border p-3 text-foreground"
      data-composer-mode="suggestion"
      data-testid="chat-agent-tool-approval-prompt"
    >
      <div className="relative z-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon
            aria-hidden="true"
            icon={icon}
            size={16}
            strokeWidth={1.8}
          />
          <span>{title}</span>
        </div>

        {approval.toolCall.summary && approval.toolCall.summary !== title ? (
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
            {approval.toolCall.summary}
          </p>
        ) : null}

        <div className="mt-3">
          <Content input={approval.toolCall.input} />
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <Popover onOpenChange={setIsRedirectOpen} open={isRedirectOpen}>
            <PopoverTrigger asChild>
              <Button
                className="mr-auto h-8 rounded-[8px] px-3 text-xs shadow-none"
                disabled={disabled}
                size="sm"
                type="button"
                variant="ghost"
              >
                拒绝并告知其他方式
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[340px] p-2.5"
              side="top"
              sideOffset={8}
            >
              <form
                className="flex items-center gap-2"
                onSubmit={handleRedirect}
              >
                <Input
                  aria-label="告诉 AI 其他处理方式"
                  autoFocus
                  className="h-8 min-w-0 flex-1 rounded-[8px] px-2.5 text-[13px] shadow-none"
                  disabled={disabled}
                  onChange={(event) => setInstruction(event.target.value)}
                  placeholder="告诉 AI 其他处理方式"
                  value={instruction}
                />
                <Button
                  className={cn(
                    "h-8 shrink-0 rounded-[8px] px-3 text-xs shadow-none",
                    beamTheme === "dark"
                      ? "bg-white text-neutral-900 hover:bg-white/90 hover:text-neutral-900"
                      : "bg-neutral-strong text-neutral-strong-foreground hover:bg-neutral-strong/90 hover:text-neutral-strong-foreground",
                  )}
                  disabled={disabled || !instruction.trim()}
                  size="sm"
                  type="submit"
                  variant="ghost"
                >
                  确定
                </Button>
              </form>
            </PopoverContent>
          </Popover>

          <Button
            className="h-8 rounded-[8px] px-3 text-xs shadow-none"
            disabled={disabled}
            onClick={onReject}
            size="sm"
            type="button"
            variant="ghost"
          >
            拒绝
          </Button>
          <Button
            className={cn(
              "h-8 rounded-[8px] px-3 text-xs shadow-none",
              beamTheme === "dark"
                ? "bg-white text-neutral-900 hover:bg-white/90 hover:text-neutral-900"
                : "bg-neutral-strong text-neutral-strong-foreground hover:bg-neutral-strong/90 hover:text-neutral-strong-foreground",
            )}
            disabled={disabled}
            onClick={onApprove}
            size="sm"
            type="button"
            variant="ghost"
          >
            继续
          </Button>
        </div>
      </div>
    </section>
  );
}

function OrderBindApprovalContent({ input }: ToolApprovalContentProps) {
  const values = asRecord(input);

  return <ReadOnlyField label="订单号" value={values?.orderId} />;
}

function AfterSalesApprovalContent({ input }: ToolApprovalContentProps) {
  const values = asRecord(input);

  return (
    <div className="grid gap-2">
      <ReadOnlyField label="订单号" value={values?.orderNumber} />
      <ReadOnlyField label="退款金额" value={formatAmount(values?.amount)} />
      <ReadOnlyField label="退款原因" value={values?.reason} />
    </div>
  );
}

function GenericToolApprovalContent({ input }: ToolApprovalContentProps) {
  const values = asRecord(input);

  if (!values) {
    return <ReadOnlyField label="调用参数" value={input} />;
  }

  return (
    <div className="grid gap-2">
      {Object.entries(values).map(([key, value]) => (
        <ReadOnlyField key={key} label={key} value={value} />
      ))}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex min-h-9 min-w-0 items-center break-words rounded-[8px] border border-divider bg-background/55 px-3 py-2 text-[13px] leading-5 text-foreground">
        {formatValue(value)}
      </div>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function formatAmount(value: unknown) {
  return typeof value === "number" ? `¥${value.toFixed(2)}` : value;
}

function formatValue(value: unknown) {
  if (value == null || value === "") return "未提供";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  return JSON.stringify(value);
}
