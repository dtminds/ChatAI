import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  MATERIAL_COLLECTION_DESCRIPTION_MAX_LENGTH,
  MATERIAL_COLLECTION_TITLE_MAX_LENGTH,
  validateMaterialCollectionSubmitFields,
  type WorkbenchMaterialCollectionGroupCreateRequest,
} from "@chatai/contracts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getMaterialFileNameBaseMaxLength,
  joinMaterialFileName,
  normalizeMaterialFileExtension,
  splitMaterialFileName,
} from "@/pages/chat/components/material-collection/material-file-name";

export type MaterialContentFormValues = {
  description: string;
  fileExtension: string;
  fileName: string;
  title: string;
};

type MaterialContentFormFieldsProps = {
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"];
  disabled?: boolean;
  onChange: (values: MaterialContentFormValues) => void;
  values: MaterialContentFormValues;
};

export function MaterialContentFormFields({
  bizType,
  disabled = false,
  onChange,
  values,
}: MaterialContentFormFieldsProps) {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    const lockedExtension = normalizeMaterialFileExtension(values.fileExtension);
    const { baseName } = lockedExtension
      ? splitMaterialFileName(values.fileName, lockedExtension)
      : { baseName: values.fileName };
    const baseMaxLength = getMaterialFileNameBaseMaxLength(lockedExtension);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="material-file-name">文件名称</Label>
          <span
            className={cn(
              "text-xs",
              values.fileName.length > MATERIAL_COLLECTION_TITLE_MAX_LENGTH
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {values.fileName.length}/{MATERIAL_COLLECTION_TITLE_MAX_LENGTH}
          </span>
        </div>
        {lockedExtension ? (
          <div
            className={cn(
              "flex h-10 w-full overflow-hidden rounded-[10px] border border-input bg-background shadow-xs transition-colors focus-within:border-ring/60 focus-within:ring-4 focus-within:ring-ring/15",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <Input
              aria-describedby="material-file-extension-hint"
              aria-label="文件名称"
              className="h-full rounded-none border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0"
              disabled={disabled}
              id="material-file-name"
              maxLength={baseMaxLength}
              onChange={(event) =>
                onChange({
                  ...values,
                  fileName: joinMaterialFileName(
                    event.target.value,
                    lockedExtension,
                  ),
                })
              }
              placeholder="请输入文件名称"
              value={baseName}
            />
            <span
              aria-label={`文件后缀 .${lockedExtension}`}
              className="inline-flex h-full shrink-0 items-center border-l border-input bg-muted/40 px-3 text-sm text-muted-foreground"
              id="material-file-extension-hint"
            >
              .{lockedExtension}
            </span>
          </div>
        ) : (
          <Input
            aria-label="文件名称"
            disabled={disabled}
            id="material-file-name"
            maxLength={MATERIAL_COLLECTION_TITLE_MAX_LENGTH}
            onChange={(event) =>
              onChange({
                ...values,
                fileName: event.target.value,
              })
            }
            placeholder="请输入文件名称"
            value={values.fileName}
          />
        )}
      </div>
    );
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="material-link-title">链接标题</Label>
            <span
              className={cn(
                "text-xs",
                values.title.length > MATERIAL_COLLECTION_TITLE_MAX_LENGTH
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {values.title.length}/{MATERIAL_COLLECTION_TITLE_MAX_LENGTH}
            </span>
          </div>
          <Input
            aria-label="链接标题"
            disabled={disabled}
            id="material-link-title"
            maxLength={MATERIAL_COLLECTION_TITLE_MAX_LENGTH}
            onChange={(event) =>
              onChange({
                ...values,
                title: event.target.value,
              })
            }
            placeholder="请输入链接标题"
            value={values.title}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="material-link-description">链接描述</Label>
            <span
              className={cn(
                "text-xs",
                values.description.length > MATERIAL_COLLECTION_DESCRIPTION_MAX_LENGTH
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {values.description.length}/{MATERIAL_COLLECTION_DESCRIPTION_MAX_LENGTH}
            </span>
          </div>
          <Textarea
            aria-label="链接描述"
            disabled={disabled}
            id="material-link-description"
            maxLength={MATERIAL_COLLECTION_DESCRIPTION_MAX_LENGTH}
            onChange={(event) =>
              onChange({
                ...values,
                description: event.target.value,
              })
            }
            placeholder="请输入链接描述"
            rows={3}
            value={values.description}
          />
        </div>
      </div>
    );
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
    return renderTitleField({
      disabled,
      id: "material-mini-program-title",
      label: "小程序标题",
      onChange,
      placeholder: "请输入小程序标题",
      values,
    });
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
    return renderTitleField({
      disabled,
      id: "material-video-title",
      label: "视频标题",
      onChange,
      placeholder: "请输入视频标题",
      values,
    });
  }

  return null;
}

export function hasMaterialContentFormFields(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
) {
  return (
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5 ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO
  );
}

export function getMaterialContentFormValidationError(
  bizType: WorkbenchMaterialCollectionGroupCreateRequest["bizType"],
  values: MaterialContentFormValues,
) {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    const validated = validateMaterialCollectionSubmitFields({
      fileName: values.fileName,
    });

    return "errorMsg" in validated ? validated.errorMsg : null;
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5) {
    const validated = validateMaterialCollectionSubmitFields({
      description: values.description,
      title: values.title,
    });

    return "errorMsg" in validated ? validated.errorMsg : null;
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
    const title = values.title.trim();

    if (!title) {
      return "小程序标题不能为空";
    }

    if (title.length > MATERIAL_COLLECTION_TITLE_MAX_LENGTH) {
      return `小程序标题不能超过 ${MATERIAL_COLLECTION_TITLE_MAX_LENGTH} 个字符`;
    }

    return null;
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
    return values.title.trim().length > MATERIAL_COLLECTION_TITLE_MAX_LENGTH
      ? `视频标题不能超过 ${MATERIAL_COLLECTION_TITLE_MAX_LENGTH} 个字符`
      : null;
  }

  return null;
}

function renderTitleField({
  disabled,
  id,
  label,
  onChange,
  placeholder,
  values,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (values: MaterialContentFormValues) => void;
  placeholder: string;
  values: MaterialContentFormValues;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span
          className={cn(
            "text-xs",
            values.title.length > MATERIAL_COLLECTION_TITLE_MAX_LENGTH
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {values.title.length}/{MATERIAL_COLLECTION_TITLE_MAX_LENGTH}
        </span>
      </div>
      <Input
        aria-label={label}
        disabled={disabled}
        id={id}
        maxLength={MATERIAL_COLLECTION_TITLE_MAX_LENGTH}
        onChange={(event) =>
          onChange({
            ...values,
            title: event.target.value,
          })
        }
        placeholder={placeholder}
        value={values.title}
      />
    </div>
  );
}
