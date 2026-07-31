import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  AbsoluteIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
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
import { listSystemVariables } from "./api/system-variable-service";
import { listWorkTagGroups, listWorkTags } from "./api/work-tag-service";
import {
  buildSkillTagVariableStoredName,
  buildSkillVariableResourceItem,
  parseSkillTagVariableStoredName,
  type SkillResourceItem,
  type SkillVariableConfig,
} from "./ai-skill-resource";

type TagKind = "work_tag" | "mall_tag" | "auto_tag";
type VariableKind = "custom_field" | TagKind | "system_variable";
type WecomTagMode = "normal" | "exclusive";

function isTagKind(kind: VariableKind | null): kind is TagKind {
  return kind === "work_tag" || kind === "mall_tag" || kind === "auto_tag";
}

function getVariableKindTitle(kind: VariableKind): string {
  switch (kind) {
    case "custom_field":
      return "客户自定义属性";
    case "work_tag":
      return "企微标签";
    case "mall_tag":
      return "小店标签";
    case "auto_tag":
      return "自动化标签";
    case "system_variable":
      return "系统变量";
  }
}

function FlatOptionList({
  ariaLabel,
  items,
  onSelect,
  searchAriaLabel,
  searchable = false,
  selectedValue,
}: {
  ariaLabel: string;
  items: ReadonlyArray<{ label: string; value: string }>;
  onSelect: (value: string) => void;
  searchAriaLabel?: string;
  searchable?: boolean;
  selectedValue: string;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!searchable || !normalizedQuery) {
      return items;
    }

    return items.filter((item) => item.label.toLowerCase().includes(normalizedQuery));
  }, [items, normalizedQuery, searchable]);

  return (
    <div className="overflow-hidden rounded-[10px] border border-border">
      {searchable ? (
        <div className="border-b border-border p-3">
          <div className="relative">
            <HugeiconsIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              icon={Search01Icon}
              size={15}
              strokeWidth={1.8}
            />
            <Input
              aria-label={searchAriaLabel ?? `搜索${ariaLabel}`}
              className="h-9 pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索"
              value={query}
            />
          </div>
        </div>
      ) : null}
      <ul
        aria-label={ariaLabel}
        className="max-h-72 space-y-0.5 overflow-y-auto p-2"
      >
        {filteredItems.length === 0 ? (
          <li className="px-2 py-8 text-center text-sm text-muted-foreground">
            暂无数据
          </li>
        ) : (
          filteredItems.map((item) => {
            const selected = item.value === selectedValue;

            return (
              <li key={item.value}>
                <button
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full rounded-[8px] px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "bg-accent text-foreground"
                      : "text-foreground hover:bg-muted/60",
                  )}
                  onClick={() => onSelect(item.value)}
                  type="button"
                >
                  {item.label}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

/** 企微客户标签对应 Java type=0 外部联系人 */
const WECOM_CUSTOMER_TAG_TYPE = 0 as const;
/** 小店标签对应 Java type=12 星云客户标签 */
const MALL_TAG_TYPE = 12 as const;
/** 企微 / 小店标签搜索防抖，与知识库等列表搜索对齐 */
const TAG_SEARCH_DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

export type InsertVariableInitialConfigure = {
  kind: VariableKind;
  /** 编辑已有变量：锁定大类，直接进入配置且不回选类列表 */
  lockKind?: boolean;
  initialVariable?: SkillVariableConfig;
};

type TagItem = {
  id: number;
  name: string;
};

type TagGroup = {
  id: number;
  name: string;
  tags: readonly TagItem[];
};

type CustomInfoFieldOption = {
  id: number;
  name: string;
};

type WorkTagGroupOption = {
  attr: 1 | 2;
  id: number;
  name: string;
  sort?: number;
};

type AutoTagItemOption = {
  name: string;
  tag: string;
};

type AutoTagGroupOption = {
  groupName: string;
  groupTag: string;
  tags: readonly AutoTagItemOption[];
};

const variableOptions: ReadonlyArray<{
  description: string;
  kind: VariableKind;
  title: string;
}> = [
  {
    description: "查询聊天客户的自定义属性后，插入到指定位置",
    kind: "custom_field",
    title: "客户自定义属性",
  },
  {
    description: "查询您指定的企微客户标签，然后插入到指定位置",
    kind: "work_tag",
    title: "企微标签",
  },
  {
    description: "查询您指定的小店标签，然后插入到指定位置",
    kind: "mall_tag",
    title: "小店标签",
  },
  {
    description: "查询您指定的自动化标签，然后插入到指定位置",
    kind: "auto_tag",
    title: "自动化标签",
  },
  {
    description: "查询系统运行时变量，然后插入到指定位置",
    kind: "system_variable",
    title: "系统变量",
  },
];

type SystemVariableOption = {
  key: string;
  name: string;
};

function usesComponentTagApi(kind: TagKind | null) {
  return kind === "work_tag" || kind === "mall_tag";
}

type InsertVariableDialogProps = {
  initialConfigure?: InsertVariableInitialConfigure | null;
  onConfirm: (item: SkillResourceItem) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function InsertVariableDialog({
  initialConfigure = null,
  onConfirm,
  onOpenChange,
  open,
}: InsertVariableDialogProps) {
  const [step, setStep] = useState<"pick" | "configure">("pick");
  const [variableKind, setVariableKind] = useState<VariableKind | null>(null);
  const [customFieldId, setCustomFieldId] = useState("");
  const [customInfoFields, setCustomInfoFields] = useState<CustomInfoFieldOption[]>(
    [],
  );
  const [customInfoFieldsLoading, setCustomInfoFieldsLoading] = useState(false);
  const [customInfoFieldsError, setCustomInfoFieldsError] = useState(false);
  const [systemVariableKey, setSystemVariableKey] = useState("");
  const [systemVariables, setSystemVariables] = useState<SystemVariableOption[]>(
    [],
  );
  const [systemVariablesLoading, setSystemVariablesLoading] = useState(false);
  const [systemVariablesError, setSystemVariablesError] = useState(false);
  const [wecomMode, setWecomMode] = useState<WecomTagMode>("normal");
  const [workTagGroups, setWorkTagGroups] = useState<WorkTagGroupOption[]>([]);
  const [workTagGroupsLoading, setWorkTagGroupsLoading] = useState(false);
  const [workTagGroupsError, setWorkTagGroupsError] = useState(false);
  const [workTagLimit, setWorkTagLimit] = useState<number | null>(null);
  const [workTags, setWorkTags] = useState<TagItem[]>([]);
  /** 小店标签一次拉全量后本地按分组过滤（上游常无可用 groupId） */
  const [mallAllTags, setMallAllTags] = useState<
    Array<TagItem & { groupId: number }>
  >([]);
  const [workTagsLoading, setWorkTagsLoading] = useState(false);
  const [workTagsError, setWorkTagsError] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  /** 跨分组保留已选标签名称（企微按组加载时当前页可能没有其他组的标签） */
  const [selectedTagNameById, setSelectedTagNameById] = useState<
    Record<number, string>
  >({});
  const [autoTagGroups, setAutoTagGroups] = useState<AutoTagGroupOption[]>([]);
  const [autoTagGroupsLoading, setAutoTagGroupsLoading] = useState(false);
  const [autoTagGroupsError, setAutoTagGroupsError] = useState(false);
  const [selectedAutoGroupTag, setSelectedAutoGroupTag] = useState("");
  const [selectedAutoTagKey, setSelectedAutoTagKey] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [groupQuery, setGroupQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const debouncedGroupQuery = useDebouncedValue(
    groupQuery.trim().toLowerCase(),
    TAG_SEARCH_DEBOUNCE_MS,
  );
  const normalizedTagQuery = tagQuery.trim();
  const debouncedTagQuery = useDebouncedValue(
    normalizedTagQuery,
    TAG_SEARCH_DEBOUNCE_MS,
  );
  const isTagQueryDebouncing = normalizedTagQuery !== debouncedTagQuery;
  const tagKind = isTagKind(variableKind) ? variableKind : null;

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    if (initialConfigure) {
      startConfigure(initialConfigure.kind, initialConfigure.initialVariable);
      return;
    }

    resetToPick();
  }, [initialConfigure, open]);

  useEffect(() => {
    if (!open || step !== "configure" || variableKind !== "custom_field") {
      return;
    }

    let cancelled = false;

    async function loadCustomFields() {
      setCustomInfoFieldsLoading(true);
      setCustomInfoFieldsError(false);

      try {
        const response = await listCustomFields({ status: 1 });
        if (cancelled) {
          return;
        }

        setCustomInfoFields(
          response.fields.map((field) => ({
            id: field.id,
            name: field.title,
          })),
        );
      } catch {
        if (!cancelled) {
          setCustomInfoFields([]);
          setCustomInfoFieldsError(true);
          toast.error("自定义属性加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setCustomInfoFieldsLoading(false);
        }
      }
    }

    void loadCustomFields();

    return () => {
      cancelled = true;
    };
  }, [open, step, variableKind]);

  useEffect(() => {
    if (!open || step !== "configure" || variableKind !== "system_variable") {
      return;
    }

    let cancelled = false;

    async function loadSystemVariables() {
      setSystemVariablesLoading(true);
      setSystemVariablesError(false);

      try {
        const response = await listSystemVariables();
        if (cancelled) {
          return;
        }

        const variables = response.variables.map((item) => ({
          key: item.key,
          name: item.name,
        }));
        setSystemVariables(variables);
        setSystemVariableKey((current) => {
          if (current && variables.some((item) => item.key === current)) {
            return current;
          }

          return "";
        });
      } catch {
        if (!cancelled) {
          setSystemVariables([]);
          setSystemVariableKey("");
          setSystemVariablesError(true);
          toast.error("系统变量加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setSystemVariablesLoading(false);
        }
      }
    }

    void loadSystemVariables();

    return () => {
      cancelled = true;
    };
  }, [open, step, variableKind]);

  useEffect(() => {
    if (!open || step !== "configure" || variableKind !== "auto_tag") {
      return;
    }

    let cancelled = false;

    async function loadAutoTagGroups() {
      setAutoTagGroupsLoading(true);
      setAutoTagGroupsError(false);

      try {
        const response = await listCdpTagGroups();
        if (cancelled) {
          return;
        }

        const groups = response.groups.map((group) => ({
          groupName: group.groupName,
          groupTag: group.groupTag,
          tags: group.tags.map((tag) => ({
            name: tag.name,
            tag: tag.tag,
          })),
        }));
        setAutoTagGroups(groups);
        setSelectedAutoGroupTag((current) => {
          if (current && groups.some((group) => group.groupTag === current)) {
            return current;
          }

          return groups[0]?.groupTag ?? "";
        });
      } catch {
        if (!cancelled) {
          setAutoTagGroups([]);
          setSelectedAutoGroupTag("");
          setSelectedAutoTagKey("");
          setAutoTagGroupsError(true);
          toast.error("自动化标签加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setAutoTagGroupsLoading(false);
        }
      }
    }

    void loadAutoTagGroups();

    return () => {
      cancelled = true;
    };
  }, [open, step, variableKind]);

  useEffect(() => {
    if (
      !open ||
      step !== "configure" ||
      variableKind !== "auto_tag" ||
      autoTagGroups.length === 0 ||
      !selectedAutoTagKey
    ) {
      return;
    }

    const owner = autoTagGroups.find((group) =>
      group.tags.some((tag) => tag.tag === selectedAutoTagKey),
    );
    if (!owner) {
      return;
    }

    setSelectedAutoGroupTag((current) =>
      current === owner.groupTag ? current : owner.groupTag,
    );
  }, [autoTagGroups, open, selectedAutoTagKey, step, variableKind]);

  const wecomAttr = wecomMode === "normal" ? 1 : 2;

  useEffect(() => {
    if (
      !open ||
      step !== "configure" ||
      !isTagKind(variableKind) ||
      !usesComponentTagApi(variableKind)
    ) {
      return;
    }

    let cancelled = false;

    async function loadTagGroups() {
      setWorkTagGroupsLoading(true);
      setWorkTagGroupsError(false);

      try {
        if (variableKind === "mall_tag") {
          // 小店标签：type=12 一次拉全量；上游常无 groupId，且不支持按合成 groupId 回查
          const response = await listWorkTags({
            page: 1,
            pageSize: 100,
            type: MALL_TAG_TYPE,
          });
          if (cancelled) {
            return;
          }

          const groupMap = new Map<number, WorkTagGroupOption>();
          const allTags: Array<TagItem & { groupId: number }> = [];
          for (const tag of response.tags) {
            allTags.push({
              groupId: tag.groupId,
              id: tag.id,
              name: tag.name,
            });

            if (groupMap.has(tag.groupId)) {
              continue;
            }

            groupMap.set(tag.groupId, {
              attr: tag.groupAttr,
              id: tag.groupId,
              name: tag.groupName,
              sort: tag.groupSort,
            });
          }

          setMallAllTags(allTags);
          setWorkTagGroups(
            [...groupMap.values()].sort(
              (left, right) =>
                (right.sort ?? 0) - (left.sort ?? 0) || left.id - right.id,
            ),
          );
          setWorkTagLimit(null);
          setWorkTags([]);
        } else {
          setMallAllTags([]);
          // 企微标签组：attr 随普通/互斥切换，type 固定 0
          const response = await listWorkTagGroups({
            attr: wecomAttr,
            type: WECOM_CUSTOMER_TAG_TYPE,
          });
          if (cancelled) {
            return;
          }

          setWorkTagGroups(
            response.groups.map((group) => ({
              attr: group.attr,
              id: group.id,
              name: group.name,
            })),
          );
          setWorkTagLimit(
            typeof response.tagLimit === "number" && response.tagLimit > 0
              ? response.tagLimit
              : null,
          );
        }
      } catch {
        if (!cancelled) {
          setWorkTagGroups([]);
          setWorkTagLimit(null);
          setWorkTagGroupsError(true);
          toast.error(
            variableKind === "mall_tag"
              ? "小店标签加载失败，请稍后重试"
              : "企微标签组加载失败，请稍后重试",
          );
        }
      } finally {
        if (!cancelled) {
          setWorkTagGroupsLoading(false);
        }
      }
    }

    void loadTagGroups();

    return () => {
      cancelled = true;
    };
  }, [open, step, variableKind, wecomAttr]);

  useEffect(() => {
    if (
      !open ||
      step !== "configure" ||
      variableKind !== "work_tag" ||
      workTagGroupsLoading ||
      workTagGroupsError ||
      activeGroupId == null ||
      wecomMode !== "normal"
    ) {
      return;
    }

    if (workTagGroups.some((group) => group.id === activeGroupId)) {
      return;
    }

    setWecomMode("exclusive");
  }, [
    activeGroupId,
    open,
    step,
    variableKind,
    wecomMode,
    workTagGroups,
    workTagGroupsError,
    workTagGroupsLoading,
  ]);

  const tagGroups = useMemo((): readonly TagGroup[] => {
    if (tagKind === "work_tag" || tagKind === "mall_tag") {
      return workTagGroups.map((group) => ({
        id: group.id,
        name: group.name,
        tags: [],
      }));
    }

    return [];
  }, [tagKind, workTagGroups]);

  const filteredGroups = useMemo(() => {
    if (!debouncedGroupQuery) {
      return tagGroups;
    }

    return tagGroups.filter((group) =>
      group.name.toLowerCase().includes(debouncedGroupQuery),
    );
  }, [debouncedGroupQuery, tagGroups]);

  const resolvedActiveGroupId =
    activeGroupId && filteredGroups.some((group) => group.id === activeGroupId)
      ? activeGroupId
      : (filteredGroups[0]?.id ?? null);

  const activeGroup = useMemo(
    () => filteredGroups.find((group) => group.id === resolvedActiveGroupId) ?? null,
    [filteredGroups, resolvedActiveGroupId],
  );

  useEffect(() => {
    // 小店标签已在分组加载时拉全量，这里只处理企微等需按组回查的场景
    if (
      !open ||
      step !== "configure" ||
      variableKind !== "work_tag" ||
      resolvedActiveGroupId == null
    ) {
      return;
    }

    const componentType = WECOM_CUSTOMER_TAG_TYPE;

    // 输入中跳过请求；清空搜索（切组 / 清关键字）立即拉取
    if (isTagQueryDebouncing && normalizedTagQuery !== "") {
      return;
    }

    const keyword =
      normalizedTagQuery === "" ? "" : debouncedTagQuery;

    let cancelled = false;

    async function loadComponentTags() {
      setWorkTagsLoading(true);
      setWorkTagsError(false);

      try {
        const response = await listWorkTags({
          groupId: resolvedActiveGroupId ?? undefined,
          keyword: keyword || undefined,
          page: 1,
          pageSize: 100,
          type: componentType,
        });
        if (cancelled) {
          return;
        }

        setWorkTags(
          response.tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
          })),
        );
      } catch {
        if (!cancelled) {
          setWorkTags([]);
          setWorkTagsError(true);
          toast.error("企微标签加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setWorkTagsLoading(false);
        }
      }
    }

    void loadComponentTags();

    return () => {
      cancelled = true;
    };
  }, [
    debouncedTagQuery,
    isTagQueryDebouncing,
    normalizedTagQuery,
    open,
    resolvedActiveGroupId,
    step,
    variableKind,
  ]);

  const filteredTags = useMemo(() => {
    if (tagKind === "mall_tag") {
      const query = debouncedTagQuery.toLowerCase();
      return mallAllTags
        .filter((tag) =>
          resolvedActiveGroupId == null
            ? true
            : tag.groupId === resolvedActiveGroupId,
        )
        .filter((tag) => (query ? tag.name.toLowerCase().includes(query) : true))
        .map((tag) => ({ id: tag.id, name: tag.name }));
    }

    if (usesComponentTagApi(tagKind)) {
      return workTags;
    }

    const tags = activeGroup?.tags ?? [];
    const query = debouncedTagQuery.toLowerCase();
    if (!query) {
      return tags;
    }

    return tags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [
    activeGroup,
    debouncedTagQuery,
    mallAllTags,
    resolvedActiveGroupId,
    tagKind,
    workTags,
  ]);

  const selectedTagNames = useMemo(() => {
    const sourceTags =
      tagKind === "mall_tag"
        ? mallAllTags
        : usesComponentTagApi(tagKind)
          ? workTags
          : (activeGroup?.tags ?? []);

    return selectedTagIds
      .map(
        (id) =>
          sourceTags.find((tag) => tag.id === id)?.name ?? selectedTagNameById[id],
      )
      .filter((name): name is string => Boolean(name));
  }, [
    activeGroup,
    mallAllTags,
    selectedTagIds,
    selectedTagNameById,
    tagKind,
    workTags,
  ]);

  const filteredAutoGroups = useMemo(() => {
    if (!debouncedGroupQuery) {
      return autoTagGroups;
    }

    return autoTagGroups.filter((group) =>
      group.groupName.toLowerCase().includes(debouncedGroupQuery),
    );
  }, [autoTagGroups, debouncedGroupQuery]);

  const resolvedAutoGroupTag =
    selectedAutoGroupTag &&
    filteredAutoGroups.some((group) => group.groupTag === selectedAutoGroupTag)
      ? selectedAutoGroupTag
      : (filteredAutoGroups[0]?.groupTag ?? "");

  const selectedAutoGroup = useMemo(
    () =>
      filteredAutoGroups.find((group) => group.groupTag === resolvedAutoGroupTag) ??
      null,
    [filteredAutoGroups, resolvedAutoGroupTag],
  );

  const filteredAutoTags = useMemo(() => {
    const tags = selectedAutoGroup?.tags ?? [];
    const query = debouncedTagQuery.toLowerCase();
    if (!query) {
      return tags;
    }

    return tags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [debouncedTagQuery, selectedAutoGroup]);

  const selectedAutoTag = useMemo(
    () =>
      selectedAutoGroup?.tags.find((tag) => tag.tag === selectedAutoTagKey) ?? null,
    [selectedAutoGroup, selectedAutoTagKey],
  );

  const workTagSelectionLimit =
    workTagLimit != null && workTagLimit > 0
      ? workTagLimit
      : wecomMode === "exclusive"
        ? 1
        : Number.POSITIVE_INFINITY;

  const canConfirm =
    variableKind === "custom_field"
      ? customFieldId.length > 0
      : variableKind === "system_variable"
        ? systemVariableKey.length > 0
        : variableKind === "auto_tag"
          ? selectedAutoTag != null
          : isTagKind(variableKind)
            ? selectedTagIds.length > 0 && resolvedActiveGroupId !== null
            : false;

  const isEditingVariable = Boolean(initialConfigure?.lockKind);

  function resetToPick() {
    setStep("pick");
    setVariableKind(null);
    setCustomFieldId("");
    setSystemVariableKey("");
    setSystemVariables([]);
    setSystemVariablesError(false);
    setWecomMode("normal");
    setSelectedTagIds([]);
    setSelectedTagNameById({});
    setSelectedAutoGroupTag("");
    setSelectedAutoTagKey("");
    setAutoTagGroups([]);
    setActiveGroupId(null);
    setMallAllTags([]);
    setGroupQuery("");
    setTagQuery("");
  }

  function startConfigure(
    kind: VariableKind,
    initialVariable?: SkillVariableConfig,
  ) {
    setVariableKind(kind);
    setCustomFieldId("");
    setSystemVariableKey("");
    setSystemVariables([]);
    setSystemVariablesError(false);
    setWecomMode("normal");
    setSelectedTagIds([]);
    setSelectedTagNameById({});
    setSelectedAutoGroupTag("");
    setSelectedAutoTagKey("");
    setAutoTagGroups([]);
    setWorkTags([]);
    setWorkTagGroups([]);
    setMallAllTags([]);
    setActiveGroupId(null);
    setGroupQuery("");
    setTagQuery("");
    setStep("configure");

    if (!initialVariable || initialVariable.type !== kind) {
      return;
    }

    if (initialVariable.type === "custom_field") {
      setCustomFieldId(String(initialVariable.select_id));
      return;
    }

    if (initialVariable.type === "system_variable") {
      setSystemVariableKey(initialVariable.select_key);
      return;
    }

    if (initialVariable.type === "auto_tag") {
      setSelectedAutoTagKey(initialVariable.select_key);
      return;
    }

    if (
      initialVariable.type === "work_tag" ||
      initialVariable.type === "mall_tag"
    ) {
      const { tagNames } = parseSkillTagVariableStoredName(initialVariable.name);
      const nameById: Record<number, string> = {};
      initialVariable.select_sub_ids.forEach((tagId, index) => {
        const tagName = tagNames[index];
        if (tagName) {
          nameById[tagId] = tagName;
        }
      });
      setActiveGroupId(initialVariable.select_id);
      setSelectedTagIds([...initialVariable.select_sub_ids]);
      setSelectedTagNameById(nameById);
    }
  }

  function handleBack() {
    if (initialConfigure?.lockKind) {
      onOpenChange(false);
      return;
    }

    resetToPick();
    setStep("pick");
  }

  function emitVariable(variable: SkillVariableConfig, displayName?: string) {
    onConfirm(buildSkillVariableResourceItem(variable, displayName));
    onOpenChange(false);
  }

  function handleConfirm() {
    if (!variableKind || !canConfirm) {
      return;
    }

    if (variableKind === "custom_field") {
      const field = customInfoFields.find((item) => String(item.id) === customFieldId);
      if (!field) {
        return;
      }

      emitVariable({
        name: field.name,
        select_id: field.id,
        type: "custom_field",
      });
      return;
    }

    if (variableKind === "system_variable") {
      const systemVariable = systemVariables.find((item) => item.key === systemVariableKey);
      if (!systemVariable) {
        return;
      }

      emitVariable({
        name: systemVariable.name,
        select_key: systemVariable.key,
        type: "system_variable",
      });
      return;
    }

    if (variableKind === "auto_tag") {
      if (!selectedAutoGroup || !selectedAutoTag) {
        return;
      }

      emitVariable(
        {
          name: selectedAutoTag.name,
          select_key: selectedAutoTag.tag,
          type: "auto_tag",
        },
        `${selectedAutoGroup.groupName} · ${selectedAutoTag.name}`,
      );
      return;
    }

    if (
      (variableKind !== "work_tag" && variableKind !== "mall_tag") ||
      !activeGroup ||
      selectedTagIds.length === 0
    ) {
      return;
    }

    emitVariable({
      name: buildSkillTagVariableStoredName(activeGroup.name, selectedTagNames),
      select_id: activeGroup.id,
      select_sub_ids: [...selectedTagIds],
      type: variableKind,
    });
  }

  function toggleTag(tagId: number, tagName?: string) {
    setSelectedTagIds((current) => {
      if (current.includes(tagId)) {
        setSelectedTagNameById((names) => {
          const next = { ...names };
          delete next[tagId];
          return next;
        });
        return current.filter((id) => id !== tagId);
      }

      if (tagKind === "work_tag" && workTagSelectionLimit <= 1) {
        setSelectedTagNameById(tagName ? { [tagId]: tagName } : {});
        return [tagId];
      }

      if (
        tagKind === "work_tag" &&
        Number.isFinite(workTagSelectionLimit) &&
        current.length >= workTagSelectionLimit
      ) {
        toast.error(`最多选择 ${workTagSelectionLimit} 个标签`);
        return current;
      }

      if (tagName) {
        setSelectedTagNameById((names) => ({ ...names, [tagId]: tagName }));
      }

      return [...current, tagId];
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[639px] max-h-[calc(100vh-2rem)] w-[min(792px,calc(100vw-2rem))] max-w-[792px] flex-col gap-0 overflow-hidden p-0 sm:rounded-[14px]">
        <div className="flex shrink-0 items-center px-6 pb-2 pt-6 pr-14">
          <DialogTitle className="text-lg font-semibold text-foreground">
            {initialConfigure?.lockKind ? "编辑变量" : "插入变量"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {initialConfigure?.lockKind
              ? "编辑已添加的变量"
              : "选择并配置要插入的变量"}
          </DialogDescription>
        </div>

        {step === "pick" && !initialConfigure?.lockKind ? (
          <ul aria-label="插入变量" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6 pt-3">
            {variableOptions.map((option) => (
              <li className="flex items-start gap-3" key={option.kind}>
                <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={AbsoluteIcon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-foreground">{option.title}</p>
                  <p className="text-sm leading-5 text-muted-foreground">
                    {option.description}
                  </p>
                </div>
                <Button
                  aria-label={`添加${option.title}`}
                  className="mt-0.5 h-8 shrink-0 px-3 text-primary"
                  onClick={() => startConfigure(option.kind)}
                  type="button"
                  variant="outline"
                >
                  添加
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-4 pt-2">
              <div className="flex h-11 items-center gap-2 rounded-[10px] border border-border bg-muted/30 px-3 text-sm text-foreground">
                <HugeiconsIcon
                  aria-hidden="true"
                  className="text-muted-foreground"
                  icon={AbsoluteIcon}
                  size={16}
                  strokeWidth={1.8}
                />
                <span>{variableKind ? getVariableKindTitle(variableKind) : ""}</span>
              </div>

              {variableKind === "custom_field" ? (
                <div className="space-y-2">
                  <Label>
                    <span className="text-destructive">*</span> 字段
                  </Label>
                  {customInfoFieldsLoading ? (
                    <div
                      className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border text-sm text-muted-foreground"
                      role="status"
                    >
                      <Spinner size={14} />
                      <span>正在加载</span>
                    </div>
                  ) : customInfoFieldsError ? (
                    <div
                      className="flex h-10 items-center justify-center rounded-[10px] border border-border text-sm text-destructive"
                      role="alert"
                    >
                      加载失败
                    </div>
                  ) : customInfoFields.length === 0 ? (
                    <div
                      className="flex h-10 items-center justify-center rounded-[10px] border border-border text-sm text-muted-foreground"
                      role="status"
                    >
                      暂无数据
                    </div>
                  ) : (
                    <FlatOptionList
                      ariaLabel="字段"
                      items={customInfoFields.map((field) => ({
                        label: field.name,
                        value: String(field.id),
                      }))}
                      onSelect={setCustomFieldId}
                      searchAriaLabel="搜索字段"
                      searchable
                      selectedValue={customFieldId}
                    />
                  )}
                  <p className="text-sm leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground">温馨提示：</span>
                    工具会查询指定的自定义属性字段，然后告诉智能体该自定义属性字段的内容。
                  </p>
                </div>
              ) : null}

              {variableKind === "system_variable" ? (
                <div className="space-y-2">
                  <Label>
                    <span className="text-destructive">*</span> 变量
                  </Label>
                  {systemVariablesLoading ? (
                    <div
                      className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border text-sm text-muted-foreground"
                      role="status"
                    >
                      <Spinner size={14} />
                      <span>正在加载</span>
                    </div>
                  ) : systemVariablesError ? (
                    <div
                      className="flex h-10 items-center justify-center rounded-[10px] border border-border text-sm text-destructive"
                      role="alert"
                    >
                      加载失败
                    </div>
                  ) : systemVariables.length === 0 ? (
                    <div
                      className="flex h-10 items-center justify-center rounded-[10px] border border-border text-sm text-muted-foreground"
                      role="status"
                    >
                      暂无数据
                    </div>
                  ) : (
                    <FlatOptionList
                      ariaLabel="变量"
                      items={systemVariables.map((item) => ({
                        label: item.name,
                        value: item.key,
                      }))}
                      onSelect={setSystemVariableKey}
                      searchAriaLabel="搜索变量"
                      searchable
                      selectedValue={systemVariableKey}
                    />
                  )}
                  <p className="text-sm leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground">温馨提示：</span>
                    工具会读取指定的系统变量，然后告诉智能体该变量当前的值。
                  </p>
                </div>
              ) : null}

              {isTagKind(variableKind) ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label>
                      <span className="text-destructive">*</span> 标签
                    </Label>

                    {tagKind === "auto_tag" ? (
                      autoTagGroupsLoading ? (
                        <div
                          className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border text-sm text-muted-foreground"
                          role="status"
                        >
                          <Spinner size={14} />
                          <span>正在加载</span>
                        </div>
                      ) : autoTagGroupsError ? (
                        <div
                          className="flex h-10 items-center justify-center rounded-[10px] border border-border text-sm text-destructive"
                          role="alert"
                        >
                          加载失败
                        </div>
                      ) : autoTagGroups.length === 0 ? (
                        <div
                          className="flex h-10 items-center justify-center rounded-[10px] border border-border text-sm text-muted-foreground"
                          role="status"
                        >
                          暂无数据
                        </div>
                      ) : (
                        <div
                          aria-label="选择自动化标签"
                          className="overflow-hidden rounded-[10px] border border-border"
                        >
                          {selectedAutoTag && selectedAutoGroup ? (
                            <div className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
                              已选 {selectedAutoGroup.groupName} · {selectedAutoTag.name}
                            </div>
                          ) : selectedAutoGroup && isEditingVariable ? (
                            <div className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
                              {selectedAutoGroup.groupName}
                            </div>
                          ) : null}

                          <div
                            className={cn(
                              "grid h-72",
                              isEditingVariable ? "grid-cols-1" : "grid-cols-2",
                            )}
                          >
                            {!isEditingVariable ? (
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
                                  {filteredAutoGroups.length === 0 ? (
                                    <li className="px-2 py-8 text-center text-sm text-muted-foreground">
                                      暂无数据
                                    </li>
                                  ) : (
                                    filteredAutoGroups.map((group) => (
                                      <li key={group.groupTag}>
                                        <button
                                          className={cn(
                                            "flex w-full rounded-[8px] px-3 py-2 text-left text-sm transition-colors",
                                            group.groupTag === resolvedAutoGroupTag
                                              ? "bg-accent text-foreground"
                                              : "text-foreground hover:bg-muted/60",
                                          )}
                                          onClick={() => {
                                            if (group.groupTag !== resolvedAutoGroupTag) {
                                              setSelectedAutoTagKey("");
                                            }
                                            setSelectedAutoGroupTag(group.groupTag);
                                            setTagQuery("");
                                          }}
                                          type="button"
                                        >
                                          {group.groupName}
                                        </button>
                                      </li>
                                    ))
                                  )}
                                </ul>
                              </div>
                            ) : null}

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
                                    onChange={(event) => setTagQuery(event.target.value)}
                                    placeholder="搜索"
                                    value={tagQuery}
                                  />
                                </div>
                              </div>
                              <ul
                                aria-label="标签列表"
                                className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3"
                              >
                                {filteredAutoTags.length === 0 ? (
                                  <li className="px-2 py-8 text-center text-sm text-muted-foreground">
                                    暂无数据
                                  </li>
                                ) : (
                                  filteredAutoTags.map((tag) => {
                                    const selected = tag.tag === selectedAutoTagKey;

                                    return (
                                      <li key={tag.tag}>
                                        <button
                                          aria-pressed={selected}
                                          className={cn(
                                            "flex w-full rounded-[8px] px-3 py-2 text-left text-sm transition-colors",
                                            selected
                                              ? "bg-accent text-foreground"
                                              : "text-foreground hover:bg-muted/60",
                                          )}
                                          onClick={() => setSelectedAutoTagKey(tag.tag)}
                                          type="button"
                                        >
                                          {tag.name}
                                        </button>
                                      </li>
                                    );
                                  })
                                )}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )
                    ) : (
                      <div
                        aria-label="选择标签"
                        className="overflow-hidden rounded-[10px] border border-border"
                      >
                        {selectedTagNames.length > 0 ? (
                          <div className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
                            {activeGroup
                              ? `已选 ${activeGroup.name} · ${
                                  selectedTagNames.length <= 2
                                    ? selectedTagNames.join("、")
                                    : `${selectedTagNames.slice(0, 2).join("、")} 等${selectedTagNames.length}个`
                                }`
                              : selectedTagNames.length <= 3
                                ? `已选 ${selectedTagNames.join("、")}`
                                : `已选 ${selectedTagNames.length} 个标签`}
                          </div>
                        ) : activeGroup && isEditingVariable ? (
                          <div className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
                            {activeGroup.name}
                          </div>
                        ) : null}

                        {tagKind === "work_tag" && !isEditingVariable ? (
                          <div className="border-b border-border px-3 pt-2">
                            <Tabs
                              onValueChange={(value) => {
                                const nextMode = value as WecomTagMode;
                                setWecomMode(nextMode);
                                setGroupQuery("");
                                setTagQuery("");
                                setWorkTags([]);
                                setActiveGroupId(null);
                                setSelectedTagIds([]);
                                setSelectedTagNameById({});
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

                        <div
                          className={cn(
                            "grid h-72",
                            isEditingVariable ? "grid-cols-1" : "grid-cols-2",
                          )}
                        >
                          {!isEditingVariable ? (
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
                                {usesComponentTagApi(tagKind) && workTagGroupsLoading ? (
                                  <li
                                    className="flex items-center justify-center gap-2 px-2 py-8 text-sm text-muted-foreground"
                                    role="status"
                                  >
                                    <Spinner size={14} />
                                    <span>正在加载</span>
                                  </li>
                                ) : usesComponentTagApi(tagKind) && workTagGroupsError ? (
                                  <li
                                    className="px-2 py-8 text-center text-sm text-destructive"
                                    role="alert"
                                  >
                                    加载失败
                                  </li>
                                ) : filteredGroups.length === 0 ? (
                                  <li className="px-2 py-8 text-center text-sm text-muted-foreground">
                                    暂无数据
                                  </li>
                                ) : (
                                  filteredGroups.map((group) => (
                                    <li key={group.id}>
                                      <button
                                        className={cn(
                                          "flex w-full rounded-[8px] px-3 py-2 text-left text-sm transition-colors",
                                          group.id === resolvedActiveGroupId
                                            ? "bg-accent text-foreground"
                                            : "text-foreground hover:bg-muted/60",
                                        )}
                                        onClick={() => {
                                          const currentGroupId =
                                            activeGroupId ?? resolvedActiveGroupId;
                                          if (group.id !== currentGroupId) {
                                            setSelectedTagIds([]);
                                            setSelectedTagNameById({});
                                          }
                                          setActiveGroupId(group.id);
                                          setTagQuery("");
                                          setWorkTags([]);
                                        }}
                                        type="button"
                                      >
                                        {group.name}
                                      </button>
                                    </li>
                                  ))
                                )}
                              </ul>
                            </div>
                          ) : null}

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
                                  onChange={(event) => setTagQuery(event.target.value)}
                                  placeholder="搜索"
                                  value={tagQuery}
                                />
                              </div>
                            </div>
                            <ul
                              aria-label="标签列表"
                              className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3"
                            >
                              {(tagKind === "mall_tag"
                                ? workTagGroupsLoading
                                : workTagsLoading) ? (
                                <li
                                  className="flex items-center justify-center gap-2 px-2 py-8 text-sm text-muted-foreground"
                                  role="status"
                                >
                                  <Spinner size={14} />
                                  <span>正在加载</span>
                                </li>
                              ) : (tagKind === "mall_tag"
                                  ? workTagGroupsError
                                  : workTagsError) ? (
                                <li
                                  className="px-2 py-8 text-center text-sm text-destructive"
                                  role="alert"
                                >
                                  加载失败
                                </li>
                              ) : filteredTags.length === 0 ? (
                                <li className="px-2 py-8 text-center text-sm text-muted-foreground">
                                  暂无数据
                                </li>
                              ) : (
                                filteredTags.map((tag) => {
                                  const checked = selectedTagIds.includes(tag.id);

                                  return (
                                    <li key={tag.id}>
                                      <label className="flex cursor-pointer items-center gap-2 rounded-[8px] px-3 py-2 text-sm hover:bg-muted/60">
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={() =>
                                            toggleTag(tag.id, tag.name)
                                          }
                                        />
                                        <span>{tag.name}</span>
                                      </label>
                                    </li>
                                  );
                                })
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    <p className="text-sm leading-5 text-muted-foreground">
                      <span className="font-medium text-foreground">温馨提示：</span>
                      {tagKind === "auto_tag"
                        ? "工具会查询指定的自动化标签，然后告诉智能体该客户是否命中该标签。"
                        : "工具会查询指定的标签，然后告诉智能体该客户命中了所选标签中的哪些标签。"}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-6 py-4">
              <Button onClick={handleBack} type="button" variant="outline">
                {initialConfigure?.lockKind ? "取消" : "上一步"}
              </Button>
              <Button disabled={!canConfirm} onClick={handleConfirm} type="button">
                {initialConfigure?.lockKind ? "确认" : "确认插入"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
