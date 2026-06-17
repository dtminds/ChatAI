import { StarsIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const agentGenerateGradient =
  "linear-gradient(90deg, #267FF0 0%, #8E33FA 55%, #C840D4 100%)";

type AgentGenerateGradientButtonProps = {
  children: ReactNode;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function AgentGenerateGradientButton({
  children,
  className,
  disabled,
  type = "button",
  ...props
}: AgentGenerateGradientButtonProps) {
  const gradientId = `agent-generate-gradient-${useId().replace(/:/g, "")}`;

  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-transparent px-4 text-sm font-normal transition-opacity disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      disabled={disabled}
      style={{
        background: `linear-gradient(#fff, #fff) padding-box, ${agentGenerateGradient} border-box`,
      }}
      type={type}
      {...props}
    >
      <svg aria-hidden className="pointer-events-none absolute h-0 w-0">
        <defs>
          <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#267FF0" />
            <stop offset="55%" stopColor="#8E33FA" />
            <stop offset="100%" stopColor="#C840D4" />
          </linearGradient>
        </defs>
      </svg>
      <HugeiconsIcon
        className={`shrink-0 [&_path]:stroke-[url(#${gradientId})] [&_svg]:stroke-[url(#${gradientId})]`}
        icon={StarsIcon}
        size={16}
        stroke={`url(#${gradientId})`}
        strokeWidth={1.8}
      />
      <span
        className="bg-clip-text text-transparent"
        style={{ backgroundImage: agentGenerateGradient }}
      >
        {children}
      </span>
    </button>
  );
}
