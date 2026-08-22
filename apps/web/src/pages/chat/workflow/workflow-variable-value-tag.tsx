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
  const tagRef = useRef<HTMLSpanElement>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const fullLabel = sourceLabel ? `${sourceLabel} - ${label}` : label;

  return (
    <TooltipProvider>
      <Tooltip
        onOpenChange={(open) => {
          const tag = tagRef.current;
          setTooltipOpen(Boolean(open && tag && tag.scrollWidth > tag.clientWidth));
        }}
        open={tooltipOpen}
      >
        <TooltipTrigger asChild>
          <span
            className="pointer-events-auto block min-w-0 max-w-full truncate rounded-[6px] bg-secondary px-1.5 text-xs leading-6"
            data-workflow-variable-value-tag="true"
            ref={tagRef}
          >
            {sourceLabel ? (
              <>
                <span className="text-muted-foreground">{sourceLabel}</span>
                <span className="text-muted-foreground"> - </span>
              </>
            ) : null}
            <span className="text-foreground">{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm break-words" side="top" sideOffset={4}>
          {fullLabel}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
