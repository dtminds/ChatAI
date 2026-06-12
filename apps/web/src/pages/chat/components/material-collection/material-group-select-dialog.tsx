import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { MaterialCollectionGroup } from "@/pages/chat/components/material-collection/material-types";

type MaterialGroupSelectDialogProps = {
  groups: MaterialCollectionGroup[];
  isSaving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (groupId: string | 0) => void;
  open: boolean;
};

export function MaterialGroupSelectDialog({
  groups,
  isSaving = false,
  onOpenChange,
  onSubmit,
  open,
}: MaterialGroupSelectDialogProps) {
  const [selectedGroupId, setSelectedGroupId] = useState("0");

  useEffect(() => {
    if (open) {
      setSelectedGroupId("0");
    }
  }, [open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>选择分组</DialogTitle>
          <DialogDescription>默认分组不会新建分组记录</DialogDescription>
        </DialogHeader>

        <RadioGroup
          className="gap-2"
          onValueChange={setSelectedGroupId}
          value={selectedGroupId}
        >
          <GroupRadioItem label="默认分组" value="0" />
          {groups.map((group) => (
            <GroupRadioItem
              key={group.id}
              label={group.title}
              value={group.id}
            />
          ))}
        </RadioGroup>

        <DialogFooter>
          <Button
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={isSaving}
            onClick={() => onSubmit(selectedGroupId === "0" ? 0 : selectedGroupId)}
            type="button"
          >
            收录
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupRadioItem({ label, value }: { label: string; value: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-border px-3 py-2.5 text-sm transition-colors hover:bg-surface-muted">
      <RadioGroupItem value={value} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}
