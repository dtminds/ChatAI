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
import { Input } from "@/components/ui/input";
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
  onCreateGroup: (title: string) => Promise<MaterialCollectionGroup | undefined>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (groupId: string) => void;
  open: boolean;
};

const CREATE_GROUP_VALUE = "__create__";

export function MaterialGroupSelectDialog({
  bizType,
  groups,
  isSaving = false,
  onCreateGroup,
  onOpenChange,
  onSubmit,
  open,
}: MaterialGroupSelectDialogProps) {
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedGroupId("");
      setNewGroupTitle("");
      setIsCreatingGroup(false);
    }
  }, [open]);

  const isCreatingMode = selectedGroupId === CREATE_GROUP_VALUE;
  const canSubmit = Boolean(selectedGroupId) && !isCreatingMode && !isSaving && !isCreatingGroup;

  async function handleCreateGroup() {
    const title = newGroupTitle.trim();

    if (!title) {
      return;
    }

    setIsCreatingGroup(true);

    try {
      const group = await onCreateGroup(title);

      if (group) {
        setSelectedGroupId(group.id);
        setNewGroupTitle("");
      }
    } finally {
      setIsCreatingGroup(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{getCollectTitle(bizType)}</DialogTitle>
        </DialogHeader>

        <Select
          disabled={isSaving || isCreatingGroup}
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
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.title}
              </SelectItem>
            ))}
            <SelectItem value={CREATE_GROUP_VALUE}>新建分组</SelectItem>
          </SelectContent>
        </Select>

        {isCreatingMode ? (
          <div className="flex gap-2">
            <Input
              aria-label="分组名称"
              disabled={isSaving || isCreatingGroup}
              onChange={(event) => setNewGroupTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleCreateGroup();
                }
              }}
              placeholder="分组名称"
              value={newGroupTitle}
            />
            <Button
              disabled={isSaving || isCreatingGroup || !newGroupTitle.trim()}
              onClick={() => {
                void handleCreateGroup();
              }}
              type="button"
              variant="outline"
            >
              新建
            </Button>
          </div>
        ) : null}

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
            disabled={!canSubmit}
            onClick={() => onSubmit(selectedGroupId)}
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
