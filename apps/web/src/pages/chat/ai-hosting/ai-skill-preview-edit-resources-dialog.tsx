import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Spinner } from "@/components/ui/spinner";
import { listCdpTagGroups } from "./api/cdp-tag-service";
import { listCustomFields } from "./api/custom-field-service";
import { listKbs, toKbListViewItem } from "./api/kb-service";
import { listSystemVariables } from "./api/system-variable-service";
import { listWorkTagGroups, listWorkTags } from "./api/work-tag-service";
import {
  buildKnowledgeBasePlaceholder,
  buildSkillVariableResourceItem,
  buildToolPlaceholder,
  replaceSkillContentResource,
  type SkillContentResourceSegment,
  type SkillResourceItem,
  type SkillVariableConfig,
  type SkillVariableType,
} from "./ai-skill-resource";

const WECOM_CUSTOMER_TAG_TYPE = 0 as const;
const MALL_TAG_TYPE = 12 as const;
const KB_PAGE_SIZE = 100;

export type SkillPreviewEditableResource = {
  fieldLabel: string;
  segment: SkillContentResourceSegment;
  variableType: SkillVariableType | null;
};

type OptionItem = {
  label: string;
  meta?: Record<string, string>;
  value: string;
};

type FieldDraft = {
  fieldLabel: string;
  options: OptionItem[];
  segment: SkillContentResourceSegment;
  selectedValue: string;
  variableType: SkillVariableType | null;
};

const previewToolCatalog: ReadonlyArray<{
  description: string;
  id: string;
  title: string;
}> = [
  {
    id: "search_mall_order_logistics",
    title: "小店订单物流查询",
    description: "根据客户提供的小店订单号，查询订单的物流状态与轨迹信息",
  },
  {
    id: "transfer_mall_point",
    title: "代客转积分",
    description: "代客户将提供的订单号转换为积分",
  },
  {
    id: "remark_mall_order",
    title: "小店订单备注",
    description: "为客户的小店订单添加或更新备注",
  },
  {
    id: "search_order",
    title: "订单查询",
    description: "根据客户提供的订单号查询订单信息",
  },
  {
    id: "bind_order",
    title: "绑定订单",
    description: "根据客户提供的订单号，为客户关联绑定订单至客户画像",
  },
];

export function SkillPreviewEditResourcesDialog({
  content,
  editableResources,
  onCancel,
  onConfirm,
  open,
}: {
  content: string;
  editableResources: readonly SkillPreviewEditableResource[];
  onCancel: () => void;
  onConfirm: (result: {
    content: string;
    resources: {
      "knowledge-bases": SkillResourceItem[];
      tools: SkillResourceItem[];
      variables: SkillResourceItem[];
    };
  }) => void;
  open: boolean;
}) {
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const variableFields = useMemo(
    () => fields.filter((field) => field.segment.kind === "variable"),
    [fields],
  );
  const toolFields = useMemo(
    () => fields.filter((field) => field.segment.kind === "tool"),
    [fields],
  );
  const knowledgeFields = useMemo(
    () => fields.filter((field) => field.segment.kind === "knowledge_base"),
    [fields],
  );

  const canConfirm =
    fields.length > 0 &&
    fields.every((field) => field.selectedValue.trim().length > 0);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadFields() {
      setLoading(true);
      try {
        const nextFields = await Promise.all(
          editableResources.map(async (item) => ({
            fieldLabel: item.fieldLabel,
            segment: item.segment,
            selectedValue: "",
            variableType: item.variableType,
            options: await loadOptionsForEditable(item),
          })),
        );
        if (!cancelled) {
          setFields(nextFields);
        }
      } catch {
        if (!cancelled) {
          setFields([]);
          toast.error("资源选项加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadFields();

    return () => {
      cancelled = true;
    };
  }, [editableResources, open]);

  function setFieldValue(placeholder: string, value: string) {
    setFields((current) =>
      current.map((field) =>
        field.segment.placeholder === placeholder
          ? { ...field, selectedValue: value }
          : field,
      ),
    );
  }

  async function handleConfirm() {
    if (!canConfirm || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const resources = {
        variables: [] as SkillResourceItem[],
        tools: [] as SkillResourceItem[],
        "knowledge-bases": [] as SkillResourceItem[],
      };
      let nextContent = content;

      for (const field of fields) {
        const built = await buildSelection(field);
        if (!built) {
          toast.error(`请选择${field.fieldLabel}`);
          return;
        }

        nextContent = replaceSkillContentResource(
          nextContent,
          field.segment.placeholder,
          built.placeholder,
        );

        if (field.segment.kind === "variable") {
          resources.variables.push(built.resource);
        } else if (field.segment.kind === "tool") {
          resources.tools.push(built.resource);
        } else {
          resources["knowledge-bases"].push(built.resource);
        }
      }

      onConfirm({ content: nextContent, resources });
    } catch {
      toast.error("资源配置失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
      open={open}
    >
      <DialogContent className="flex max-h-[min(40rem,calc(100vh-3rem))] w-[min(520px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-[12px]">
        <div className="shrink-0 space-y-1 border-b border-border px-6 py-5">
          <DialogTitle className="text-base font-semibold text-foreground">
            编辑资源
          </DialogTitle>
          <DialogDescription className="sr-only">
            为模版中的推荐资源选择具体配置
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div
              className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner size={16} />
              <span>正在加载</span>
            </div>
          ) : fields.length === 0 ? (
            <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
              暂无数据
            </div>
          ) : (
            <div className="space-y-6">
              <ResourceFieldSection
                fields={variableFields}
                onChange={setFieldValue}
                title="推荐变量"
              />
              <ResourceFieldSection
                fields={toolFields}
                onChange={setFieldValue}
                title="推荐工具"
              />
              <ResourceFieldSection
                fields={knowledgeFields}
                onChange={setFieldValue}
                title="推荐知识库"
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-border px-6 py-4">
          <Button onClick={onCancel} type="button" variant="outline">
            取消
          </Button>
          <Button
            disabled={!canConfirm || loading || submitting}
            onClick={() => {
              void handleConfirm();
            }}
            type="button"
          >
            确定
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResourceFieldSection({
  fields,
  onChange,
  title,
}: {
  fields: readonly FieldDraft[];
  onChange: (placeholder: string, value: string) => void;
  title: string;
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <section aria-label={title} className="space-y-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-3.5 w-1 shrink-0 rounded-full bg-primary"
        />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>

      <div className="space-y-4">
        {fields.map((field) => (
          <div className="space-y-2" key={field.segment.placeholder}>
            <Label className="text-sm font-medium text-foreground">
              <span className="text-destructive">*</span> {field.fieldLabel}
            </Label>
            <Select
              onValueChange={(value) => {
                onChange(field.segment.placeholder, value);
              }}
              value={field.selectedValue || undefined}
            >
              <SelectTrigger aria-required="true" className="w-full">
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                {field.options.length === 0 ? (
                  <SelectItem disabled value="__empty__">
                    暂无数据
                  </SelectItem>
                ) : (
                  field.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </section>
  );
}

async function loadOptionsForEditable(
  item: SkillPreviewEditableResource,
): Promise<OptionItem[]> {
  if (item.segment.kind === "tool") {
    return previewToolCatalog.map((tool) => ({
      label: tool.title,
      value: tool.id,
      meta: { description: tool.description, title: tool.title },
    }));
  }

  if (item.segment.kind === "knowledge_base") {
    const response = await listKbs({ page: 1, pageSize: KB_PAGE_SIZE });
    return response.kbs.map((kb) => {
      const view = toKbListViewItem(kb);
      return {
        label: view.name,
        value: String(view.id),
        meta: { title: view.name },
      };
    });
  }

  if (!item.variableType) {
    return [];
  }

  return loadVariableOptions(item.variableType);
}

async function loadVariableOptions(
  variableType: SkillVariableType,
): Promise<OptionItem[]> {
  if (variableType === "custom_field") {
    const response = await listCustomFields({ status: 1 });
    return response.fields.map((field) => ({
      label: field.title,
      value: String(field.id),
      meta: { name: field.title },
    }));
  }

  if (variableType === "system_variable") {
    const response = await listSystemVariables();
    return response.variables.map((item) => ({
      label: item.name,
      value: item.key,
      meta: { name: item.name },
    }));
  }

  if (variableType === "auto_tag") {
    const response = await listCdpTagGroups();
    return response.groups.map((group) => ({
      label: group.groupName,
      value: group.groupTag,
      meta: { name: group.groupName },
    }));
  }

  if (variableType === "work_tag") {
    const response = await listWorkTagGroups({
      attr: 1,
      type: WECOM_CUSTOMER_TAG_TYPE,
    });
    return response.groups.map((group) => ({
      label: group.name,
      value: String(group.id),
      meta: { name: group.name },
    }));
  }

  const response = await listWorkTags({
    page: 1,
    pageSize: 100,
    type: MALL_TAG_TYPE,
  });
  const groupMap = new Map<string, OptionItem>();
  for (const tag of response.tags) {
    const value = String(tag.groupId);
    if (groupMap.has(value)) {
      continue;
    }
    groupMap.set(value, {
      label: tag.groupName,
      value,
      meta: { name: tag.groupName },
    });
  }
  return [...groupMap.values()];
}

async function buildSelection(field: FieldDraft): Promise<{
  placeholder: string;
  resource: SkillResourceItem;
} | null> {
  const option = field.options.find((item) => item.value === field.selectedValue);
  if (!option) {
    return null;
  }

  if (field.segment.kind === "tool") {
    const title = option.meta?.title ?? option.label;
    const description = option.meta?.description ?? "";
    const placeholder = buildToolPlaceholder(option.value, title);
    return {
      placeholder,
      resource: {
        description,
        id: option.value,
        placeholder,
        title,
        toolKey: option.value,
      },
    };
  }

  if (field.segment.kind === "knowledge_base") {
    const kbId = Number(option.value);
    if (!Number.isFinite(kbId)) {
      return null;
    }
    const title = option.meta?.title ?? option.label;
    const placeholder = buildKnowledgeBasePlaceholder(kbId, title);
    return {
      placeholder,
      resource: {
        description: "",
        id: `kb:${kbId}`,
        kbId,
        placeholder,
        title,
      },
    };
  }

  if (!field.variableType) {
    return null;
  }

  const variable = await buildVariableConfig(field.variableType, option);
  if (!variable) {
    return null;
  }

  const resource = buildSkillVariableResourceItem(variable);
  return {
    placeholder: resource.placeholder,
    resource,
  };
}

async function buildVariableConfig(
  variableType: SkillVariableType,
  option: OptionItem,
): Promise<SkillVariableConfig | null> {
  const name = option.meta?.name ?? option.label;

  if (variableType === "custom_field") {
    const selectId = Number(option.value);
    if (!Number.isFinite(selectId)) {
      return null;
    }
    return { name, select_id: selectId, type: "custom_field" };
  }

  if (variableType === "system_variable") {
    return { name, select_key: option.value, type: "system_variable" };
  }

  if (variableType === "auto_tag") {
    return { name, select_key: option.value, type: "auto_tag" };
  }

  const groupId = Number(option.value);
  if (!Number.isFinite(groupId)) {
    return null;
  }

  const tagType =
    variableType === "work_tag" ? WECOM_CUSTOMER_TAG_TYPE : MALL_TAG_TYPE;
  const tagsResponse = await listWorkTags({
    groupId,
    page: 1,
    pageSize: 100,
    type: tagType,
  });
  const selectSubIds = tagsResponse.tags.map((tag) => tag.id);

  return {
    name,
    select_id: groupId,
    select_sub_ids: selectSubIds,
    type: variableType,
  };
}
