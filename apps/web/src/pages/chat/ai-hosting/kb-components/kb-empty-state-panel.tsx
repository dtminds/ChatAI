import type { ReactNode } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { IconStack } from "@/components/ui/icon-stack";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type KbEmptyStatePanelProps = {
  description: string;
  icon: IconSvgElement;
  primaryAction: ReactNode;
  suggestionContent: string;
  suggestionLabel: string;
  title: string;
};

export function KbEmptyStatePanel({
  description,
  icon,
  primaryAction,
  suggestionContent,
  suggestionLabel,
  title,
}: KbEmptyStatePanelProps) {
  return (
    <TooltipProvider>
      <section
        aria-label={title}
        className="flex min-h-[420px] flex-col items-center justify-center px-6 py-10 text-center"
      >
        <IconStack aria-hidden="true" className="mb-6 h-20 w-18">
          <HugeiconsIcon
            aria-hidden="true"
            className="text-muted-foreground"
            icon={icon}
            size={16}
            strokeWidth={1.8}
          />
        </IconStack>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {primaryAction}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline">
                {suggestionLabel}
              </Button>
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
        </div>
      </section>
    </TooltipProvider>
  );
}
