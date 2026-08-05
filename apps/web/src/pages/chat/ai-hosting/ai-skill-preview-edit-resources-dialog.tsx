import { useEffect, useMemo, useState } from "react";
import {
  AGENT_SKILL_VISIBLE_TOOL_CATALOG,
  type KbListItem,
  type WorkTagItem,
} from "@chatai/contracts";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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

type TagOption = {
  id: string;
  name: string;
};

type FieldDraft = {
  fieldLabel: string;
  mallTagsByGroupId: Record<string, TagOption[]>;
  options: OptionItem[];
  segment: SkillContentResourceSegment;
  selectedTagIds: string[];
  selectedTagNameById: Record<string, string>;
  selectedValue: string;
  tagOptions: TagOption[];
  tagsLoading: boolean;
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
    fields.every((field) => {
      if (isGroupTagVariableType(field.variableType)) {
        return (
          field.selectedValue.trim().length > 0 &&
          field.selectedTagIds.length > 0
        );
      }

      return field.selectedValue.trim().length > 0;
    });

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadFields() {
      setLoading(true);
      try {
        const optionsCache = new Map<string, Promise<LoadedVariableOptions>>();
        const nextFields = await Promise.all(
          editableResources.map(async (item) => {
            const loaded = await loadOptionsForEditable(item, optionsCache);
            return {
              fieldLabel: item.fieldLabel,
              mallTagsByGroupId: loaded.mallTagsByGroupId,
              options: loaded.options,
              segment: item.segment,
              selectedTagIds: [] as string[],
              selectedTagNameById: {} as Record<string, string>,
              selectedValue: "",
              tagOptions: [] as TagOption[],
              tagsLoading: false,
              variableType: item.variableType,
            };
          }),
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
      if (!target) {
        return current;
      }

      const tagGroupKey = getTagGroupSelectionKey(target, value);
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

      return current.map((field) => {
        if (field.segment.placeholder !== placeholder) {
          return field;
        }

        if (!isGroupTagVariableType(field.variableType)) {
          return { ...field, selectedValue: value };
        }

        return {
          ...field,
          selectedValue: value,
          selectedTagIds: [],
          selectedTagNameById: {},
          tagOptions: [],
          tagsLoading: Boolean(value) && field.variableType === "work_tag",
        };
      });
    });

    const target = fields.find(
      (field) => field.segment.placeholder === placeholder,
    );
    if (!target || !isGroupTagVariableType(target.variableType) || !value) {
      return;
    }

    void loadTagsForSelectedGroup(placeholder, value, target);
  }

  async function loadTagsForSelectedGroup(
    placeholder: string,
    groupValue: string,
    field: FieldDraft,
  ) {
    if (!groupValue || !isGroupTagVariableType(field.variableType)) {
      return;
    }

    if (field.variableType === "mall_tag") {
      const tags = field.mallTagsByGroupId[groupValue] ?? [];
      setFields((current) =>
        current.map((item) =>
          item.segment.placeholder === placeholder
            ? {
                ...item,
                tagOptions: tags,
                tagsLoading: false,
              }
            : item,
        ),
      );
      return;
    }

    if (field.variableType === "auto_tag") {
      const group = field.options.find((option) => option.value === groupValue);
      const tags = parseAutoTagOptions(group?.meta?.tagsJson);
      setFields((current) =>
        current.map((item) =>
          item.segment.placeholder === placeholder
            ? {
                ...item,
                tagOptions: tags,
                tagsLoading: false,
              }
            : item,
        ),
      );
      return;
    }

    try {
      const groupId = Number(groupValue);
      if (!Number.isFinite(groupId)) {
        throw new Error("invalid group id");
      }

      const tags = await listAllWorkTags({
        groupId,
        type: WECOM_CUSTOMER_TAG_TYPE,
      });
      setFields((current) =>
        current.map((item) =>
          item.segment.placeholder === placeholder
            ? {
                ...item,
                tagOptions: tags.map((tag) => ({
                  id: String(tag.id),
                  name: tag.name,
                })),
                tagsLoading: false,
              }
            : item,
        ),
      );
    } catch {
      setFields((current) =>
        current.map((item) =>
          item.segment.placeholder === placeholder
            ? { ...item, tagOptions: [], tagsLoading: false }
            : item,
        ),
      );
      toast.error("标签加载失败，请稍后重试");
    }
  }

  function toggleTagSelection(
    placeholder: string,
    tagId: string,
    tagName: string,
    multi: boolean,
  ) {
    setFields((current) =>
      current.map((field) => {
        if (field.segment.placeholder !== placeholder) {
          return field;
        }

        if (!multi) {
          return {
            ...field,
            selectedTagIds: [tagId],
            selectedTagNameById: { [tagId]: tagName },
          };
        }

        const checked = field.selectedTagIds.includes(tagId);
        if (checked) {
          const { [tagId]: _removed, ...restNames } = field.selectedTagNameById;
          return {
            ...field,
            selectedTagIds: field.selectedTagIds.filter((id) => id !== tagId),
            selectedTagNameById: restNames,
          };
        }

        return {
          ...field,
          selectedTagIds: [...field.selectedTagIds, tagId],
          selectedTagNameById: {
            ...field.selectedTagNameById,
            [tagId]: tagName,
          },
        };
      }),
    );
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
      const builtSelections = await Promise.all(
        fields.map((field) => buildSelection(field)),
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
      <DialogContent className="flex max-h-[min(44rem,calc(100vh-3rem))] w-[min(720px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-[12px]">
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
                onToggleTag={toggleTagSelection}
                title="推荐变量"
              />
              <ResourceFieldSection
                fields={toolFields}
                isOptionDisabled={isOptionDisabled}
                onChange={setFieldValue}
                onToggleTag={toggleTagSelection}
                title="推荐工具"
              />
              <ResourceFieldSection
                fields={knowledgeFields}
                isOptionDisabled={isOptionDisabled}
                onChange={setFieldValue}
                onToggleTag={toggleTagSelection}
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
  onToggleTag,
  title,
}: {
  fields: readonly FieldDraft[];
  isOptionDisabled: (field: FieldDraft, option: OptionItem) => boolean;
  onChange: (placeholder: string, value: string) => void;
  onToggleTag: (
    placeholder: string,
    tagId: string,
    tagName: string,
    multi: boolean,
  ) => void;
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
            {isGroupTagVariableType(field.variableType) ? (
              <TagGroupField
                field={field}
                isOptionDisabled={isOptionDisabled}
                onChange={onChange}
                onToggleTag={onToggleTag}
              />
            ) : (
              <SearchableOptionField
                field={field}
                isOptionDisabled={isOptionDisabled}
                onChange={onChange}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SearchableOptionField({
  field,
  isOptionDisabled,
  onChange,
}: {
  field: FieldDraft;
  isOptionDisabled: (field: FieldDraft, option: OptionItem) => boolean;
  onChange: (placeholder: string, value: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return field.options;
    }

    return field.options.filter((option) => {
      const haystack = `${option.label} ${option.meta?.description ?? ""} ${
        option.meta?.title ?? ""
      }`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [field.options, query]);

  const selectedLabel = field.options.find(
    (option) => option.value === field.selectedValue,
  )?.label;

  return (
    <div
      aria-label={`选择${field.fieldLabel}`}
      className="flex h-56 flex-col overflow-hidden rounded-[10px] border border-border"
    >
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <div className="relative">
          <HugeiconsIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            icon={Search01Icon}
            size={15}
            strokeWidth={1.8}
          />
          <Input
            aria-label={`搜索${field.fieldLabel}`}
            className="h-9 pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索"
            value={query}
          />
        </div>
        {selectedLabel ? (
          <p className="truncate text-xs text-muted-foreground">
            已选：{selectedLabel}
          </p>
        ) : null}
      </div>
      <ul
        aria-label={`${field.fieldLabel}选项`}
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2"
        role="listbox"
      >
        {field.options.length === 0 ? (
          <li className="flex h-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
            暂无数据
          </li>
        ) : filteredOptions.length === 0 ? (
          <li className="flex h-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
            暂无数据
          </li>
        ) : (
          filteredOptions.map((option) => {
            const disabled = isOptionDisabled(field, option);
            const active = option.value === field.selectedValue;

            return (
              <li key={option.value}>
                <button
                  aria-selected={active}
                  className={cn(
                    "flex w-full flex-col rounded-[8px] px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    active
                      ? "bg-accent text-foreground"
                      : "text-foreground hover:bg-muted/60",
                  )}
                  disabled={disabled}
                  onClick={() => {
                    onChange(field.segment.placeholder, option.value);
                  }}
                  role="option"
                  type="button"
                >
                  <span className="text-sm">{option.label}</span>
                  {option.meta?.description ? (
                    <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {option.meta.description}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function TagGroupField({
  field,
  isOptionDisabled,
  onChange,
  onToggleTag,
}: {
  field: FieldDraft;
  isOptionDisabled: (field: FieldDraft, option: OptionItem) => boolean;
  onChange: (placeholder: string, value: string) => void;
  onToggleTag: (
    placeholder: string,
    tagId: string,
    tagName: string,
    multi: boolean,
  ) => void;
}) {
  const multi = field.variableType !== "auto_tag";
  const isWecomTag = field.variableType === "work_tag";
  const [groupQuery, setGroupQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [wecomMode, setWecomMode] = useState<"exclusive" | "normal">("normal");

  const visibleGroups = useMemo(() => {
    if (!isWecomTag) {
      return field.options;
    }

    const attr = wecomMode === "normal" ? "1" : "2";
    return field.options.filter((option) => option.meta?.attr === attr);
  }, [field.options, isWecomTag, wecomMode]);

  const filteredGroups = useMemo(() => {
    const keyword = groupQuery.trim().toLowerCase();
    if (!keyword) {
      return visibleGroups;
    }

    return visibleGroups.filter((option) =>
      option.label.toLowerCase().includes(keyword),
    );
  }, [groupQuery, visibleGroups]);

  const filteredTags = useMemo(() => {
    const keyword = tagQuery.trim().toLowerCase();
    if (!keyword) {
      return field.tagOptions;
    }

    return field.tagOptions.filter((tag) =>
      tag.name.toLowerCase().includes(keyword),
    );
  }, [field.tagOptions, tagQuery]);

  function handleWecomModeChange(mode: "exclusive" | "normal") {
    setWecomMode(mode);
    setGroupQuery("");
    setTagQuery("");

    const attr = mode === "normal" ? "1" : "2";
    const stillVisible = field.options.some(
      (option) =>
        option.value === field.selectedValue && option.meta?.attr === attr,
    );
    if (field.selectedValue && !stillVisible) {
      onChange(field.segment.placeholder, "");
    }
  }

  return (
    <div
      aria-label={`选择${field.fieldLabel}`}
      className="flex h-80 flex-col overflow-hidden rounded-[10px] border border-border"
    >
      {isWecomTag ? (
        <div className="shrink-0 border-b border-border px-3 pt-2">
          <Tabs
            onValueChange={(value) => {
              if (value === "normal" || value === "exclusive") {
                handleWecomModeChange(value);
              }
            }}
            value={wecomMode}
          >
            <TabsList aria-label="企微标签分类" variant="underline">
              <TabsTrigger
                className="px-3 py-2.5"
                value="normal"
                variant="underline"
              >
                普通标签
              </TabsTrigger>
              <TabsTrigger
                className="px-3 py-2.5"
                value="exclusive"
                variant="underline"
              >
                互斥标签
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[3fr_7fr]">
        <div className="flex min-h-0 flex-col border-r border-border">
          <div className="shrink-0 p-3">
            <div className="relative">
              <HugeiconsIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                icon={Search01Icon}
                size={15}
                strokeWidth={1.8}
              />
              <Input
                aria-label="搜索标签组"
                className="h-9 pl-9"
                onChange={(event) => setGroupQuery(event.target.value)}
                placeholder="搜索"
                value={groupQuery}
              />
            </div>
          </div>
          <ul
            aria-label="标签组"
            className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3"
          >
            {filteredGroups.length === 0 ? (
              <li className="flex h-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
                暂无数据
              </li>
            ) : (
              filteredGroups.map((option) => {
                const disabled = isOptionDisabled(field, option);
                const active = option.value === field.selectedValue;

                return (
                  <li key={option.value}>
                    <button
                      className={cn(
                        "flex w-full rounded-[8px] px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        active
                          ? "bg-accent text-foreground"
                          : "text-foreground hover:bg-muted/60",
                      )}
                      disabled={disabled}
                      onClick={() => {
                        if (option.value !== field.selectedValue) {
                          setTagQuery("");
                          onChange(field.segment.placeholder, option.value);
                        }
                      }}
                      type="button"
                    >
                      {option.label}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="shrink-0 p-3">
            <div className="relative">
              <HugeiconsIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                icon={Search01Icon}
                size={15}
                strokeWidth={1.8}
              />
              <Input
                aria-label="搜索标签"
                className="h-9 pl-9"
                disabled={!field.selectedValue}
                onChange={(event) => setTagQuery(event.target.value)}
                placeholder="搜索"
                value={tagQuery}
              />
            </div>
          </div>
          <div
            aria-label={`${field.fieldLabel}标签列表`}
            className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3"
            role="group"
          >
            {!field.selectedValue ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                请选择标签组
              </div>
            ) : field.tagsLoading ? (
              <div
                className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
                role="status"
              >
                <Spinner size={14} />
                <span>正在加载</span>
              </div>
            ) : filteredTags.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              filteredTags.map((tag) => {
                const checked = field.selectedTagIds.includes(tag.id);

                return (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-[8px] px-3 py-2 text-sm hover:bg-muted/60"
                    key={tag.id}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() =>
                        onToggleTag(
                          field.segment.placeholder,
                          tag.id,
                          tag.name,
                          multi,
                        )
                      }
                    />
                    <span>{tag.name}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function isGroupTagVariableType(
  variableType: SkillVariableType | null,
): variableType is "work_tag" | "mall_tag" | "auto_tag" {
  return (
    variableType === "work_tag" ||
    variableType === "mall_tag" ||
    variableType === "auto_tag"
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

type LoadedVariableOptions = {
  mallTagsByGroupId: Record<string, TagOption[]>;
  options: OptionItem[];
};

async function loadOptionsForEditable(
  item: SkillPreviewEditableResource,
  cache: Map<string, Promise<LoadedVariableOptions>>,
): Promise<LoadedVariableOptions> {
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
): Promise<LoadedVariableOptions> {
  if (item.segment.kind === "tool") {
    return {
      mallTagsByGroupId: {},
      options: AGENT_SKILL_VISIBLE_TOOL_CATALOG.map((tool) => ({
        label: tool.name,
        value: tool.id,
        meta: { description: tool.description, title: tool.name },
      })),
    };
  }

  if (item.segment.kind === "knowledge_base") {
    const knowledgeBases = await listAllKnowledgeBases();
    return {
      mallTagsByGroupId: {},
      options: knowledgeBases.map((kb) => {
        const view = toKbListViewItem(kb);
        return {
          label: view.name,
          value: String(view.id),
          meta: { title: view.name },
        };
      }),
    };
  }

  if (!item.variableType) {
    return { mallTagsByGroupId: {}, options: [] };
  }

  return loadVariableOptions(item.variableType);
}

async function loadVariableOptions(
  variableType: SkillVariableType,
): Promise<LoadedVariableOptions> {
  if (variableType === "custom_field") {
    const response = await listCustomFields({ status: 1 });
    return {
      mallTagsByGroupId: {},
      options: response.fields.map((field) => ({
        label: field.title,
        value: String(field.id),
        meta: { name: field.title },
      })),
    };
  }

  if (variableType === "system_variable") {
    const response = await listSystemVariables();
    return {
      mallTagsByGroupId: {},
      options: response.variables.map((item) => ({
        label: item.name,
        value: item.key,
        meta: { name: item.name },
      })),
    };
  }

  if (variableType === "auto_tag") {
    const response = await listCdpTagGroups();
    return {
      mallTagsByGroupId: {},
      options: response.groups.map((group) => ({
        label: group.groupName,
        value: group.groupTag || group.groupName,
        meta: {
          name: group.groupName,
          tagsJson: JSON.stringify(
            group.tags.map((tag) => ({ id: tag.tag, name: tag.name })),
          ),
        },
      })),
    };
  }

  if (variableType === "work_tag") {
    const [normalGroups, exclusiveGroups] = await Promise.all([
      listWorkTagGroups({
        attr: 1,
        type: WECOM_CUSTOMER_TAG_TYPE,
      }),
      listWorkTagGroups({
        attr: 2,
        type: WECOM_CUSTOMER_TAG_TYPE,
      }),
    ]);

    return {
      mallTagsByGroupId: {},
      options: [
        ...normalGroups.groups.map((group) => ({
          label: group.name,
          value: String(group.id),
          meta: { attr: "1", name: group.name },
        })),
        ...exclusiveGroups.groups.map((group) => ({
          label: group.name,
          value: String(group.id),
          meta: { attr: "2", name: group.name },
        })),
      ],
    };
  }

  const tags = await listAllWorkTags({ type: MALL_TAG_TYPE });
  const groupMap = new Map<string, OptionItem>();
  const mallTagsByGroupId: Record<string, TagOption[]> = {};

  for (const tag of tags) {
    const value = String(tag.groupId);
    if (!groupMap.has(value)) {
      groupMap.set(value, {
        label: tag.groupName,
        value,
        meta: { name: tag.groupName },
      });
    }

    const groupTags = mallTagsByGroupId[value] ?? [];
    groupTags.push({ id: String(tag.id), name: tag.name });
    mallTagsByGroupId[value] = groupTags;
  }

  return {
    mallTagsByGroupId,
    options: [...groupMap.values()],
  };
}

function parseAutoTagOptions(tagsJson: string | undefined): TagOption[] {
  if (!tagsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        typeof (item as { id?: unknown }).id !== "string" ||
        typeof (item as { name?: unknown }).name !== "string"
      ) {
        return [];
      }

      return [
        {
          id: (item as { id: string }).id,
          name: (item as { name: string }).name,
        },
      ];
    });
  } catch {
    return [];
  }
}

async function buildSelection(field: FieldDraft): Promise<{
  placeholder: string;
  resource: SkillResourceItem;
} | null> {
  if (field.segment.kind === "tool") {
    const option = field.options.find((item) => item.value === field.selectedValue);
    if (!option) {
      return null;
    }
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
    const option = field.options.find((item) => item.value === field.selectedValue);
    if (!option) {
      return null;
    }
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

  const variable = await buildVariableConfig(field);
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
  field: FieldDraft,
): Promise<SkillVariableConfig | null> {
  const variableType = field.variableType;
  if (!variableType) {
    return null;
  }

  if (variableType === "custom_field") {
    const option = field.options.find((item) => item.value === field.selectedValue);
    if (!option) {
      return null;
    }
    const selectId = Number(option.value);
    if (!Number.isFinite(selectId)) {
      return null;
    }
    return {
      name: option.meta?.name ?? option.label,
      select_id: selectId,
      type: "custom_field",
    };
  }

  if (variableType === "system_variable") {
    const option = field.options.find((item) => item.value === field.selectedValue);
    if (!option) {
      return null;
    }
    return {
      name: option.meta?.name ?? option.label,
      select_key: option.value,
      type: "system_variable",
    };
  }

  if (variableType === "auto_tag") {
    const tagId = field.selectedTagIds[0];
    if (!tagId) {
      return null;
    }
    const group = field.options.find((item) => item.value === field.selectedValue);
    const tagName = field.selectedTagNameById[tagId] ?? tagId;
    const groupName = group?.meta?.name ?? group?.label ?? "";
    return {
      name: groupName ? `${groupName} · ${tagName}` : tagName,
      select_key: tagId,
      type: "auto_tag",
    };
  }

  if (variableType !== "work_tag" && variableType !== "mall_tag") {
    return null;
  }

  const groupId = Number(field.selectedValue);
  if (!Number.isFinite(groupId) || field.selectedTagIds.length === 0) {
    return null;
  }

  const group = field.options.find((item) => item.value === field.selectedValue);
  const groupName = group?.meta?.name ?? group?.label ?? "";
  const tagNames = field.selectedTagIds.map(
    (tagId) => field.selectedTagNameById[tagId] ?? tagId,
  );

  return {
    name: buildSkillTagVariableStoredName(groupName, tagNames),
    select_id: groupId,
    select_sub_ids: field.selectedTagIds.map((tagId) => Number(tagId)),
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
