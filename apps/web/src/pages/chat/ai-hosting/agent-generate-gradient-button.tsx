import { StarsIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  aiHostingGenerateButtonBackground,
  aiHostingGenerateColors,
  aiHostingGenerateGradient,
} from "./ai-hosting-palette";

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
        background: aiHostingGenerateButtonBackground,
        ["--gradient-stroke" as string]: `url(#${gradientId})`,
      }}
      type={type}
      {...props}
    >
      <svg aria-hidden className="pointer-events-none absolute h-0 w-0">
        <defs>
          <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor={aiHostingGenerateColors.gradientStart} />
            <stop offset="55%" stopColor={aiHostingGenerateColors.gradientMid} />
            <stop offset="100%" stopColor={aiHostingGenerateColors.gradientEnd} />
          </linearGradient>
        </defs>
      </svg>
      <HugeiconsIcon
        className="shrink-0 [&_path]:stroke-[var(--gradient-stroke)] [&_svg]:stroke-[var(--gradient-stroke)]"
        icon={StarsIcon}
        size={16}
        stroke={`url(#${gradientId})`}
        strokeWidth={1.8}
      />
      <span
        className="bg-clip-text text-transparent"
        style={{ backgroundImage: aiHostingGenerateGradient }}
      >
        {children}
      </span>
    </button>
  );
}
