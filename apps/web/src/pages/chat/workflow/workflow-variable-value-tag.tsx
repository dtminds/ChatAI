import { AbsoluteIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function WorkflowVariableValueTag({
  label,
  sourceLabel,
}: {
  label: string;
  sourceLabel?: string;
}) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const fullLabel = sourceLabel ? `${sourceLabel}.${label}` : label;

  return (
    <TooltipProvider>
      <Tooltip
        onOpenChange={(open) => {
          const labelElement = labelRef.current;
          setTooltipOpen(Boolean(
            open
            && labelElement
            && labelElement.scrollWidth > labelElement.clientWidth,
          ));
        }}
        open={tooltipOpen}
      >
        <TooltipTrigger asChild>
          <span
            className="pointer-events-auto inline-flex min-w-0 max-w-full items-center gap-0.5 rounded-[6px] bg-secondary px-1.5 text-xs leading-6"
            data-workflow-variable-value-tag="true"
          >
            <HugeiconsIcon
              aria-hidden="true"
              className="shrink-0 text-purple-500"
              icon={AbsoluteIcon}
              size={12}
              strokeWidth={1.8}
            />
            <span
              className="min-w-0 truncate"
              data-workflow-variable-value-label="true"
              ref={labelRef}
            >
              {sourceLabel ? (
                <>
                  <span className="text-muted-foreground">{sourceLabel}</span>
                  <span className="text-muted-foreground">.</span>
                </>
              ) : null}
              <span className="text-foreground">{label}</span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm break-words" side="top" sideOffset={4}>
          {fullLabel}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
