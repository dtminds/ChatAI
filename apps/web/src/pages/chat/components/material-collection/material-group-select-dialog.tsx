import { useEffect, useState } from "react";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type WorkbenchMaterialCollectionGroupCreateRequest,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { MaterialGroupFormDialog } from "@/pages/chat/components/material-collection/material-group-form-dialog";
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedGroupId("");
      setIsCreateDialogOpen(false);
      setIsCreatingGroup(false);
    }
  }, [open]);

  const canSubmit = Boolean(selectedGroupId) && !isSaving && !isCreatingGroup;

  async function handleCreateGroup(title: string) {
    setIsCreatingGroup(true);

    try {
      const group = await onCreateGroup(title);

      if (group) {
        setSelectedGroupId(group.id);
        setIsCreateDialogOpen(false);
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
          <DialogDescription className="sr-only">
            选择收录内容所属分组
          </DialogDescription>
        </DialogHeader>

        <Select
          disabled={isSaving || isCreatingGroup}
          onValueChange={(value) => {
            if (value === CREATE_GROUP_VALUE) {
              setIsCreateDialogOpen(true);
              return;
            }

            setSelectedGroupId(value);
          }}
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
      <MaterialGroupFormDialog
        isSubmitting={isCreatingGroup}
        mode="create"
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={(title) => {
          void handleCreateGroup(title);
        }}
        open={isCreateDialogOpen}
      />
    </Dialog>
  );
}

function getCollectTitle(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    return "收录文件";
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
    return "收录小程序";
  }

  return "收录链接";
}
