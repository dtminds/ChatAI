import { useEffect, useMemo, useState } from "react";
import {
  AGENT_SKILL_VISIBLE_TOOL_CATALOG,
  type KbListItem,
  type WorkTagItem,
} from "@chatai/contracts";
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
  buildSkillTagVariableStoredName,
  buildSkillVariableResourceItem,
  buildToolPlaceholder,
  collectCompleteSkillResourcesFromContent,
  replaceSkillContentResource,
  type SkillContentResourceSegment,
  type SkillResourceItem,
  type SkillVariableConfig,
  type SkillVariableType,
} from "./ai-skill-resource";

const WECOM_CUSTOMER_TAG_TYPE = 0 as const;
const MALL_TAG_TYPE = 12 as const;
const RESOURCE_PAGE_SIZE = 100;

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
  const existingTagGroupKeys = useMemo(
    () =>
      new Set(
        collectCompleteSkillResourcesFromContent(content).variables.flatMap(
          (item) => {
            const variable = item.variable;
            return variable &&
              (variable.type === "work_tag" || variable.type === "mall_tag")
              ? [`${variable.type}:${variable.select_id}`]
              : [];
          },
        ),
      ),
    [content],
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
        const optionsCache = new Map<string, Promise<OptionItem[]>>();
        const nextFields = await Promise.all(
          editableResources.map(async (item) => ({
            fieldLabel: item.fieldLabel,
            segment: item.segment,
            selectedValue: "",
            variableType: item.variableType,
            options: await loadOptionsForEditable(item, optionsCache),
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
    setFields((current) => {
      const target = current.find(
        (field) => field.segment.placeholder === placeholder,
      );
      const tagGroupKey = target
        ? getTagGroupSelectionKey(target, value)
        : null;
      if (
        tagGroupKey &&
        (existingTagGroupKeys.has(tagGroupKey) ||
          current.some(
            (field) =>
              field.segment.placeholder !== placeholder &&
              getTagGroupSelectionKey(field, field.selectedValue) === tagGroupKey,
          ))
      ) {
        return current;
      }

      return current.map((field) =>
        field.segment.placeholder === placeholder
          ? { ...field, selectedValue: value }
          : field,
      );
    });
  }

  function isOptionDisabled(field: FieldDraft, option: OptionItem) {
    const tagGroupKey = getTagGroupSelectionKey(field, option.value);
    return Boolean(
      tagGroupKey &&
        (existingTagGroupKeys.has(tagGroupKey) ||
          fields.some(
            (other) =>
              other.segment.placeholder !== field.segment.placeholder &&
              getTagGroupSelectionKey(other, other.selectedValue) === tagGroupKey,
          )),
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
      const tagOptionsCache = new Map<string, Promise<SkillVariableConfig | null>>();
      const builtSelections = await Promise.all(
        fields.map((field) => buildSelection(field, tagOptionsCache)),
      );

      for (const [index, field] of fields.entries()) {
        const built = builtSelections[index];
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
                isOptionDisabled={isOptionDisabled}
                onChange={setFieldValue}
                title="推荐变量"
              />
              <ResourceFieldSection
                fields={toolFields}
                isOptionDisabled={isOptionDisabled}
                onChange={setFieldValue}
                title="推荐工具"
              />
              <ResourceFieldSection
                fields={knowledgeFields}
                isOptionDisabled={isOptionDisabled}
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
  isOptionDisabled,
  onChange,
  title,
}: {
  fields: readonly FieldDraft[];
  isOptionDisabled: (field: FieldDraft, option: OptionItem) => boolean;
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
                    <SelectItem
                      disabled={isOptionDisabled(field, option)}
                      key={option.value}
                      value={option.value}
                    >
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

function getTagGroupSelectionKey(field: FieldDraft, value: string) {
  if (
    !value ||
    (field.variableType !== "work_tag" && field.variableType !== "mall_tag")
  ) {
    return null;
  }

  return `${field.variableType}:${value}`;
}

async function loadOptionsForEditable(
  item: SkillPreviewEditableResource,
  cache: Map<string, Promise<OptionItem[]>>,
): Promise<OptionItem[]> {
  const cacheKey = getOptionsCacheKey(item);
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const request = loadOptionsForEditableUncached(item);
  cache.set(cacheKey, request);
  return request;
}

function getOptionsCacheKey(item: SkillPreviewEditableResource) {
  return item.segment.kind === "variable"
    ? `variable:${item.variableType ?? "unknown"}`
    : item.segment.kind;
}

async function loadOptionsForEditableUncached(
  item: SkillPreviewEditableResource,
): Promise<OptionItem[]> {
  if (item.segment.kind === "tool") {
    return AGENT_SKILL_VISIBLE_TOOL_CATALOG.map((tool) => ({
      label: tool.name,
      value: tool.id,
      meta: { description: tool.description, title: tool.name },
    }));
  }

  if (item.segment.kind === "knowledge_base") {
    const knowledgeBases = await listAllKnowledgeBases();
    return knowledgeBases.map((kb) => {
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
    return response.groups.flatMap((group) =>
      group.tags.map((tag) => ({
        label: `${group.groupName} · ${tag.name}`,
        value: tag.tag,
        meta: { name: `${group.groupName} · ${tag.name}` },
      })),
    );
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

  const tags = await listAllWorkTags({ type: MALL_TAG_TYPE });
  const groupMap = new Map<string, OptionItem>();
  for (const tag of tags) {
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

async function buildSelection(
  field: FieldDraft,
  tagOptionsCache: Map<string, Promise<SkillVariableConfig | null>>,
): Promise<{
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
        status: "available",
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
        status: "available",
        title,
      },
    };
  }

  if (!field.variableType) {
    return null;
  }

  const cacheKey = `${field.variableType}:${option.value}`;
  let variableRequest = tagOptionsCache.get(cacheKey);
  if (!variableRequest) {
    variableRequest = buildVariableConfig(field.variableType, option);
    tagOptionsCache.set(cacheKey, variableRequest);
  }
  const variable = await variableRequest;
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
  const tags = await listAllWorkTags({ groupId, type: tagType });
  const selectSubIds = tags.map((tag) => tag.id);

  return {
    name: buildSkillTagVariableStoredName(
      name,
      tags.map((tag) => tag.name),
    ),
    select_id: groupId,
    select_sub_ids: selectSubIds,
    type: variableType,
  };
}

async function listAllKnowledgeBases() {
  const knowledgeBases: KbListItem[] = [];
  let page = 1;

  while (true) {
    const response = await listKbs({ page, pageSize: RESOURCE_PAGE_SIZE });
    knowledgeBases.push(...response.kbs);
    if (
      response.pagination.page * response.pagination.pageSize >=
      response.pagination.total
    ) {
      return knowledgeBases;
    }

    const nextPage = response.pagination.page + 1;
    if (nextPage <= page) {
      throw new Error("knowledge-base pagination did not advance");
    }
    page = nextPage;
  }
}

async function listAllWorkTags({
  groupId,
  type,
}: {
  groupId?: number;
  type: typeof WECOM_CUSTOMER_TAG_TYPE | typeof MALL_TAG_TYPE;
}) {
  const tags: WorkTagItem[] = [];
  let page = 1;

  while (true) {
    const response = await listWorkTags({
      groupId,
      page,
      pageSize: RESOURCE_PAGE_SIZE,
      type,
    });
    tags.push(...response.tags);
    if (!response.pagination.hasNext) {
      return tags;
    }

    const nextPage = response.pagination.page + 1;
    if (nextPage <= page) {
      throw new Error("work-tag pagination did not advance");
    }
    page = nextPage;
  }
}
