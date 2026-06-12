import { useEffect, useState } from "react";
import type { WorkbenchMaterialCollectionGroupCreateRequest } from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MaterialCollectionGroup } from "@/pages/chat/components/material-collection/material-types";

type MaterialGroupSelectDialogProps = {
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"];
  groups: MaterialCollectionGroup[];
  isSaving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (groupId: string | 0) => void;
  open: boolean;
};

export function MaterialGroupSelectDialog({
  bizType,
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
          <DialogTitle>{getCollectTitle(bizType)}</DialogTitle>
        </DialogHeader>

        <Select
          disabled={isSaving}
          onValueChange={setSelectedGroupId}
          value={selectedGroupId}
        >
          <SelectTrigger
            aria-label="选择分组"
            className="w-full"
          >
            <SelectValue placeholder="选择分组" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">默认分组</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

function getCollectTitle(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  if (bizType === 2) {
    return "收录文件";
  }

  if (bizType === 3) {
    return "收录小程序";
  }

  return "收录链接";
}
