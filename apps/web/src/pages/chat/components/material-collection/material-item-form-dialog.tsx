import { useEffect, useRef, useState } from "react";
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
  MaterialContentFormFields,
  getMaterialContentFormValidationError,
  type MaterialContentFormValues,
} from "@/pages/chat/components/material-collection/material-content-form-fields";
import { hasMaterialFileNameBase } from "@/pages/chat/components/material-collection/material-file-name";

type MaterialItemFormDialogProps = {
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"];
  initialValues: MaterialContentFormValues;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: MaterialContentFormValues) => void;
  open: boolean;
};

export function MaterialItemFormDialog({
  bizType,
  initialValues,
  isSubmitting = false,
  onOpenChange,
  onSubmit,
  open,
}: MaterialItemFormDialogProps) {
  const [values, setValues] = useState<MaterialContentFormValues>(initialValues);
  const [formError, setFormError] = useState<string | null>(null);
  const initialValuesRef = useRef(initialValues);
  initialValuesRef.current = initialValues;

  useEffect(() => {
    if (open) {
      setFormError(null);
      setValues(initialValuesRef.current);
    }
  }, [open]);

  const validationError = getMaterialContentFormValidationError(bizType, values);
  const canSubmit =
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE
      ? hasMaterialFileNameBase(values.fileName, values.fileExtension)
      : bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5
        ? values.title.trim().length > 0
        : bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM
          ? values.title.trim().length > 0
          : bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{getEditTitle(bizType)}</DialogTitle>
          <DialogDescription className="sr-only">
            编辑收录素材展示信息
          </DialogDescription>
        </DialogHeader>

        <MaterialContentFormFields
          bizType={bizType}
          disabled={isSubmitting}
          onChange={(nextValues) => {
            setFormError(null);
            setValues(nextValues);
          }}
          values={values}
        />

        {formError || validationError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError ?? validationError}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={isSubmitting || !canSubmit || Boolean(validationError)}
            onClick={() => {
              if (validationError) {
                setFormError(validationError);
                return;
              }

              setFormError(null);
              onSubmit(values);
            }}
            type="button"
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getEditTitle(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    return "编辑文件";
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
    return "编辑小程序";
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
    return "编辑视频";
  }

  return "编辑链接";
}
