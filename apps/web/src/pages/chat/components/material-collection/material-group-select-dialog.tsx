import { useEffect, useRef, useState } from "react";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  validateMaterialCollectionSubmitFields,
  type WorkbenchMaterialCollectionGroupCreateRequest,
} from "@chatai/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getMaterialContentFormValidationError,
  hasMaterialContentFormFields,
  MaterialContentFormFields,
  type MaterialContentFormValues,
} from "@/pages/chat/components/material-collection/material-content-form-fields";
import { MaterialGroupFormDialog } from "@/pages/chat/components/material-collection/material-group-form-dialog";
import type { MaterialCollectionGroup } from "@/pages/chat/components/material-collection/material-types";
import { isMaterialCollectionGroupLimitReached } from "@/pages/chat/components/material-collection/material-types";
import { hasMaterialFileNameBase } from "@/pages/chat/components/material-collection/material-file-name";

export type MaterialCollectSubmitPayload = {
  description?: string;
  fileName?: string;
  groupId: string;
  title?: string;
};

type MaterialGroupSelectDialogProps = {
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"];
  groups: MaterialCollectionGroup[];
  initialValues?: MaterialContentFormValues;
  isSaving?: boolean;
  onCreateGroup: (title: string) => Promise<MaterialCollectionGroup | undefined>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: MaterialCollectSubmitPayload) => void;
  open: boolean;
};

const CREATE_GROUP_VALUE = "__create__";
const EMPTY_MATERIAL_FORM_VALUES: MaterialContentFormValues = {
  description: "",
  fileExtension: "",
  fileName: "",
  title: "",
};

export function MaterialGroupSelectDialog({
  bizType,
  groups,
  initialValues = EMPTY_MATERIAL_FORM_VALUES,
  isSaving = false,
  onCreateGroup,
  onOpenChange,
  onSubmit,
  open,
}: MaterialGroupSelectDialogProps) {
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [formValues, setFormValues] = useState<MaterialContentFormValues>(initialValues);
  const [formError, setFormError] = useState<string | null>(null);
  const initialValuesRef = useRef(initialValues);
  initialValuesRef.current = initialValues;

  useEffect(() => {
    if (open) {
      setSelectedGroupId("");
      setIsCreateDialogOpen(false);
      setIsCreatingGroup(false);
      setFormError(null);
      setFormValues(initialValuesRef.current);
    }
  }, [open]);

  const hasContentFields = hasMaterialContentFormFields(bizType);
  const formValidationError = hasContentFields
    ? getMaterialContentFormValidationError(bizType, formValues)
    : null;
  const canSubmitContent =
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE
      ? hasMaterialFileNameBase(formValues.fileName, formValues.fileExtension)
      : bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5
        ? formValues.title.trim().length > 0
        : true;
  const canSubmit =
    Boolean(selectedGroupId) &&
    canSubmitContent &&
    !formValidationError &&
    !isSaving &&
    !isCreatingGroup;
  const canCreateGroup = !isMaterialCollectionGroupLimitReached(groups.length);

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

  function handleSubmit() {
    if (!selectedGroupId) {
      return;
    }

    const validated = validateMaterialCollectionSubmitFields({
      description:
        bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5
          ? formValues.description
          : undefined,
      fileName:
        bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE
          ? formValues.fileName
          : undefined,
      title:
        bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5
          ? formValues.title
          : undefined,
    });

    if ("errorMsg" in validated) {
      setFormError(validated.errorMsg);
      return;
    }

    setFormError(null);
    onSubmit({
      groupId: selectedGroupId,
      ...validated,
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{getCollectTitle(bizType)}</DialogTitle>
          <DialogDescription className="sr-only">
            填写收录内容信息并选择分组
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hasContentFields ? (
            <MaterialContentFormFields
              bizType={bizType}
              disabled={isSaving || isCreatingGroup}
              onChange={(nextValues) => {
                setFormError(null);
                setFormValues(nextValues);
              }}
              values={formValues}
            />
          ) : null}

          {formError || formValidationError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError ?? formValidationError}
            </p>
          ) : null}

          {bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO ? (
            <Alert>
              <AlertDescription>
                仅支持收录由该企微账号直接发送的视频，如果是转发了个微的视频，收录后将无法发送。原视频大小需在30MB以内。
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="material-collect-group">分组</Label>
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
                id="material-collect-group"
              >
                <SelectValue placeholder="选择分组" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.title}
                  </SelectItem>
                ))}
                {canCreateGroup ? (
                  <SelectItem value={CREATE_GROUP_VALUE}>新建分组</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>

          {bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO && isSaving ? (
            <p className="text-sm text-muted-foreground" role="status">
              正在收录视频，请耐心等待
            </p>
          ) : null}
        </div>

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
            aria-busy={isSaving ? "true" : undefined}
            disabled={!canSubmit}
            onClick={handleSubmit}
            type="button"
          >
            {isSaving ? <Spinner className="mr-2" size={14} /> : null}
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

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED) {
    return "收录视频号";
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
    return "收录视频";
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.IMAGE) {
    return "收录图片";
  }

  return "收录链接";
}
