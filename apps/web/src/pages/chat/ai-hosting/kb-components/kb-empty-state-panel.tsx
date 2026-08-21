import { Archive04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type KbEmptyStatePanelProps = {
  description: string;
  keepSuggestionOnSameLine?: boolean;
  suggestionContent: string;
  suggestionLabel: string;
};

export function KbEmptyStatePanel({
  description,
  keepSuggestionOnSameLine = false,
  suggestionContent,
  suggestionLabel,
}: KbEmptyStatePanelProps) {
  return (
    <TooltipProvider>
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <HugeiconsIcon
          aria-hidden="true"
          className="text-muted-foreground/60"
          icon={Archive04Icon}
          size={40}
          strokeWidth={1}
        />
        <p
          className={cn(
            "text-sm leading-6 text-muted-foreground",
            keepSuggestionOnSameLine
              ? "inline-flex max-w-none flex-nowrap items-baseline justify-center whitespace-nowrap"
              : "max-w-xl text-center",
          )}
        >
          <span className={keepSuggestionOnSameLine ? "whitespace-nowrap" : undefined}>
            {description}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "ml-[10px] text-primary",
                  keepSuggestionOnSameLine
                    ? "inline w-auto shrink-0 whitespace-nowrap"
                    : "inline shrink-0",
                )}
                type="button"
              >
                {suggestionLabel}
              </button>
            </TooltipTrigger>
            <TooltipContent
              align="start"
              className="w-max max-w-[350px] px-3 py-2 text-left text-wrap leading-5"
              side="bottom"
              sideOffset={8}
            >
              {suggestionContent}
            </TooltipContent>
          </Tooltip>
        </p>
      </div>
    </TooltipProvider>
  );
}
