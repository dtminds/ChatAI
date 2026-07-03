import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AgentGenerateGradientButtonProps = {
  children: ReactNode;
  className?: string;
} & ComponentProps<typeof Button>;

const agentGenerateGradient =
  "linear-gradient(90deg, var(--primary) 0%, color-mix(in oklch, var(--primary) 76%, var(--foreground)) 55%, color-mix(in oklch, var(--primary) 64%, var(--destructive)) 100%)";

const agentGenerateButtonBackground =
  `linear-gradient(var(--background), var(--background)) padding-box, ${agentGenerateGradient} border-box`;

export function AgentGenerateGradientButton({
  children,
  className,
  type = "button",
  variant = "outline",
  ...props
}: AgentGenerateGradientButtonProps) {
  return (
    <Button
      className={cn(
        "border-transparent font-medium text-foreground hover:bg-background hover:text-primary",
        className,
      )}
      data-agent-generate-gradient-button="true"
      style={{
        background: agentGenerateButtonBackground,
        ["--agent-generate-gradient" as string]: agentGenerateGradient,
      }}
      type={type}
      variant={variant}
      {...props}
    >
      <HugeiconsIcon
        className="shrink-0 text-primary"
        icon={AiMagicIcon}
        size={16}
        strokeWidth={1.8}
      />
      <span
        className="bg-clip-text text-transparent"
        style={{ backgroundImage: "var(--agent-generate-gradient)" }}
      >
        {children}
      </span>
    </Button>
  );
}
