import { useState } from "react";
import { HelpCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SmartReplyAutoGenerateConfirmDialog } from "./smart-reply-auto-generate-confirm-dialog";

export function SmartReplyAutoGenerateControl() {
  const [enabled, setEnabled] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  function handleCheckedChange(checked: boolean) {
    if (checked) {
      setConfirmDialogOpen(true);
      return;
    }

    setEnabled(false);
  }

  function handleConfirmEnable() {
    setEnabled(true);
    setConfirmDialogOpen(false);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <label
          className="cursor-pointer text-sm whitespace-nowrap text-foreground"
          htmlFor="smart-reply-auto-generate-switch"
        >
          话术自动生成
        </label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="话术自动生成说明"
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                type="button"
              >
                <HugeiconsIcon icon={HelpCircleIcon} size={14} strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              开启后，活跃会话会自动生成推荐话术；AI全自动托管状态下不会自动生成
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Switch
          aria-label="话术自动生成"
          checked={enabled}
          id="smart-reply-auto-generate-switch"
          onCheckedChange={handleCheckedChange}
        />
      </div>

      <SmartReplyAutoGenerateConfirmDialog
        onConfirm={handleConfirmEnable}
        onOpenChange={setConfirmDialogOpen}
        open={confirmDialogOpen}
      />
    </>
  );
}
