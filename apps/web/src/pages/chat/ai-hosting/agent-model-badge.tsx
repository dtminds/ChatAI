import { AiBrain01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { resolveAgentModelIcon } from "./agent-model-icons";

type AgentModelBadgeProps = {
  className?: string;
  label?: string;
  model: string;
};

export function AgentModelBadge({ className, label, model }: AgentModelBadgeProps) {
  const iconConfig = resolveAgentModelIcon(model);
  const displayLabel = label ?? iconConfig.label;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [model]);

  const shouldUseImage = Boolean(iconConfig.iconUrl && !imageFailed);

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
        title={`模型图标：${displayLabel}`}
      >
        {shouldUseImage ? (
          <img
            alt=""
            className="size-4 object-contain"
            onError={() => setImageFailed(true)}
            src={iconConfig.iconUrl}
          />
        ) : (
          <HugeiconsIcon
            color="currentColor"
            icon={AiBrain01Icon}
            size={14}
            strokeWidth={1.8}
          />
        )}
      </span>
      <span className="min-w-0 truncate">{displayLabel}</span>
    </span>
  );
}
