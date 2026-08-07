import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AGENT_SKILL_TAG_MAX_COUNT } from "@chatai/contracts";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

function MultiChoiceList({
  addedValues,
  ariaLabel,
  items,
  onToggle,
  selectedValues,
}: {
  addedValues: ReadonlySet<string>;
  ariaLabel: string;
  items: ReadonlyArray<{ label: string; value: string }>;
  onToggle: (value: string) => void;
  selectedValues: readonly string[];
}) {
  return (
    <div
      aria-label={ariaLabel}
      className="min-h-0 flex-1 content-start gap-0.5 overflow-y-auto rounded-[10px] border border-border p-2"
      role="group"
    >
      {items.map((item) => {
        const added = addedValues.has(item.value);
        const checked = added || selectedValues.includes(item.value);

        return (
          <Label
            className={cn(
              "flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-sm font-normal text-foreground transition-colors has-data-[state=checked]:bg-accent",
              added
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer hover:bg-muted/60",
            )}
            key={item.value}
          >
            <Checkbox
              checked={checked}
              disabled={added}
              onCheckedChange={() => onToggle(item.value)}
            />
            <span className="min-w-0 truncate">{item.label}</span>
          </Label>
        );
      })}
    </div>
  );
}

/** 企微客户标签对应 Java type=0 外部联系人 */
const WECOM_CUSTOMER_TAG_TYPE = 0 as const;
/** 小店标签对应 Java type=12 星云客户标签 */
const MALL_TAG_TYPE = 12 as const;
/** 企微 / 小店标签搜索防抖，与知识库等列表搜索对齐 */
const TAG_SEARCH_DEBOUNCE_MS = 300;
/** 企微标签在弹窗内按页加载，避免一次返回过多标签 */
const WECOM_TAG_PAGE_SIZE = 50;

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
  kind: VariableKind;
  title: string;
}> = [
  {
    kind: "work_tag",
    title: "企微标签",
  },
  {
    kind: "mall_tag",
    title: "小店标签",
  },
  {
    kind: "auto_tag",
    title: "自动化标签",
  },
  {
    kind: "custom_field",
    title: "自定义属性",
  },
  {
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
  addedVariables?: readonly SkillResourceItem[];
  initialConfigure?: InsertVariableInitialConfigure | null;
  onConfirm: (items: readonly SkillResourceItem[]) => boolean | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function InsertVariableDialog({
  addedVariables = [],
  initialConfigure = null,
  onConfirm,
  onOpenChange,
  open,
}: InsertVariableDialogProps) {
  const [variableKind, setVariableKind] = useState<VariableKind | null>(null);
  const [selectedCustomFieldIds, setSelectedCustomFieldIds] = useState<string[]>([]);
  const [customInfoFields, setCustomInfoFields] = useState<CustomInfoFieldOption[]>(
    [],
  );
  const [customInfoFieldsLoading, setCustomInfoFieldsLoading] = useState(false);
  const [customInfoFieldsError, setCustomInfoFieldsError] = useState(false);
  const [selectedSystemVariableKeys, setSelectedSystemVariableKeys] = useState<
    string[]
  >([]);
  const [systemVariables, setSystemVariables] = useState<SystemVariableOption[]>(
    [],
  );
  const [systemVariablesLoading, setSystemVariablesLoading] = useState(false);
  const [systemVariablesError, setSystemVariablesError] = useState(false);
  const [wecomMode, setWecomMode] = useState<WecomTagMode>("normal");
  const [workTagGroups, setWorkTagGroups] = useState<WorkTagGroupOption[]>([]);
  const [workTagGroupsLoading, setWorkTagGroupsLoading] = useState(false);
  const [workTagGroupsError, setWorkTagGroupsError] = useState(false);
  const [workTags, setWorkTags] = useState<TagItem[]>([]);
  /** 小店标签一次拉全量后本地按分组过滤（上游常无可用 groupId） */
  const [mallAllTags, setMallAllTags] = useState<
    Array<TagItem & { groupId: number }>
  >([]);
  const [workTagsLoading, setWorkTagsLoading] = useState(false);
  const [workTagsLoadingMore, setWorkTagsLoadingMore] = useState(false);
  const [workTagsError, setWorkTagsError] = useState(false);
  const [workTagsPage, setWorkTagsPage] = useState(1);
  const [workTagsHasNext, setWorkTagsHasNext] = useState(false);
  const workTagsRequestVersionRef = useRef(0);
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
  const isEditingVariable = Boolean(initialConfigure?.lockKind);
  const addedTagGroupKeys = useMemo(() => {
    const currentVariable = initialConfigure?.initialVariable;
    const currentKey =
      currentVariable &&
      (currentVariable.type === "work_tag" || currentVariable.type === "mall_tag")
        ? `${currentVariable.type}:${currentVariable.select_id}`
        : null;

    return new Set(
      addedVariables.flatMap((item) => {
        const variable = item.variable;
        if (
          !variable ||
          (variable.type !== "work_tag" && variable.type !== "mall_tag")
        ) {
          return [];
        }

        const key = `${variable.type}:${variable.select_id}`;
        return key === currentKey ? [] : [key];
      }),
    );
  }, [addedVariables, initialConfigure?.initialVariable]);
  const addedCustomFieldIds = useMemo(
    () =>
      new Set(
        addedVariables.flatMap((item) =>
          item.variable?.type === "custom_field"
            ? [String(item.variable.select_id)]
            : [],
        ),
      ),
    [addedVariables],
  );
  const addedSystemVariableKeys = useMemo(
    () =>
      new Set(
        addedVariables.flatMap((item) =>
          item.variable?.type === "system_variable"
            ? [item.variable.select_key]
            : [],
        ),
      ),
    [addedVariables],
  );

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    if (initialConfigure) {
      startConfigure(initialConfigure.kind, initialConfigure.initialVariable);
      return;
    }

    startConfigure(variableOptions[0].kind);
  }, [initialConfigure, open]);

  useEffect(() => {
    if (!open || variableKind !== "custom_field") {
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

        const fields = response.fields.map((field) => ({
          id: field.id,
          name: field.title,
        }));
        setCustomInfoFields(fields);
        setSelectedCustomFieldIds((current) =>
          current.filter((fieldId) =>
            fields.some((field) => String(field.id) === fieldId),
          ),
        );
      } catch {
        if (!cancelled) {
          setCustomInfoFields([]);
          setCustomInfoFieldsError(true);
          toast.error("加载失败，请稍后重试");
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
  }, [open, variableKind]);

  useEffect(() => {
    if (!open || variableKind !== "system_variable") {
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
        setSelectedSystemVariableKeys((current) =>
          current.filter((key) => variables.some((item) => item.key === key)),
        );
      } catch {
        if (!cancelled) {
          setSystemVariables([]);
          setSelectedSystemVariableKeys([]);
          setSystemVariablesError(true);
          toast.error("加载失败，请稍后重试");
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
  }, [open, variableKind]);

  useEffect(() => {
    if (!open || variableKind !== "auto_tag") {
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
          toast.error("加载失败，请稍后重试");
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
  }, [open, variableKind]);

  useEffect(() => {
    if (
      !open ||
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
  }, [autoTagGroups, open, selectedAutoTagKey, variableKind]);

  const wecomAttr = wecomMode === "normal" ? 1 : 2;

  useEffect(() => {
    if (
      !open ||
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
        }
      } catch {
        if (!cancelled) {
          setWorkTagGroups([]);
          setWorkTagGroupsError(true);
          toast.error("加载失败，请稍后重试");
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
  }, [open, variableKind, wecomAttr]);

  useEffect(() => {
    if (
      !open ||
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

  const selectableFilteredGroups = useMemo(
    () =>
      filteredGroups.filter(
        (group) => !addedTagGroupKeys.has(`${tagKind}:${group.id}`),
      ),
    [addedTagGroupKeys, filteredGroups, tagKind],
  );

  const resolvedActiveGroupId =
    activeGroupId &&
    selectableFilteredGroups.some((group) => group.id === activeGroupId)
      ? activeGroupId
      : (selectableFilteredGroups[0]?.id ?? null);

  const activeGroup = useMemo(
    () => filteredGroups.find((group) => group.id === resolvedActiveGroupId) ?? null,
    [filteredGroups, resolvedActiveGroupId],
  );

  useEffect(() => {
    const requestVersion = workTagsRequestVersionRef.current + 1;
    workTagsRequestVersionRef.current = requestVersion;
    setWorkTagsLoadingMore(false);

    // 小店标签已在分组加载时拉全量，这里只处理企微等需按组回查的场景
    if (
      !open ||
      variableKind !== "work_tag" ||
      resolvedActiveGroupId == null
    ) {
      if (variableKind === "work_tag") {
        setWorkTagsLoading(false);
        setWorkTags([]);
        setWorkTagsPage(1);
        setWorkTagsHasNext(false);
      }
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
      setWorkTags([]);
      setWorkTagsPage(1);
      setWorkTagsHasNext(false);

      try {
        const response = await listWorkTags({
          groupId: resolvedActiveGroupId ?? undefined,
          keyword: keyword || undefined,
          page: 1,
          pageSize: WECOM_TAG_PAGE_SIZE,
          type: componentType,
        });
        if (cancelled || workTagsRequestVersionRef.current !== requestVersion) {
          return;
        }

        setWorkTags(
          response.tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
          })),
        );
        setWorkTagsPage(response.pagination.page);
        setWorkTagsHasNext(response.pagination.hasNext);
      } catch {
        if (!cancelled && workTagsRequestVersionRef.current === requestVersion) {
          setWorkTags([]);
          setWorkTagsHasNext(false);
          setWorkTagsError(true);
          toast.error("加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled && workTagsRequestVersionRef.current === requestVersion) {
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
    variableKind,
  ]);

  async function handleLoadMoreWorkTags() {
    if (
      variableKind !== "work_tag" ||
      resolvedActiveGroupId == null ||
      workTagsLoading ||
      workTagsLoadingMore ||
      !workTagsHasNext
    ) {
      return;
    }

    const requestVersion = workTagsRequestVersionRef.current;
    const nextPage = workTagsPage + 1;
    const keyword = normalizedTagQuery === "" ? "" : debouncedTagQuery;
    setWorkTagsLoadingMore(true);

    try {
      const response = await listWorkTags({
        groupId: resolvedActiveGroupId,
        keyword: keyword || undefined,
        page: nextPage,
        pageSize: WECOM_TAG_PAGE_SIZE,
        type: WECOM_CUSTOMER_TAG_TYPE,
      });
      if (workTagsRequestVersionRef.current !== requestVersion) {
        return;
      }

      if (response.pagination.page < nextPage) {
        throw new Error("work-tag pagination did not advance");
      }

      const nextTags = response.tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
      }));
      setWorkTags((current) => {
        const existingIds = new Set(current.map((tag) => tag.id));
        return [
          ...current,
          ...nextTags.filter((tag) => !existingIds.has(tag.id)),
        ];
      });
      setWorkTagsPage(response.pagination.page);
      setWorkTagsHasNext(response.pagination.hasNext);
    } catch {
      if (workTagsRequestVersionRef.current === requestVersion) {
        toast.error("加载失败，请稍后重试");
      }
    } finally {
      if (workTagsRequestVersionRef.current === requestVersion) {
        setWorkTagsLoadingMore(false);
      }
    }
  }

  const filteredTags = useMemo(() => {
    if (tagKind === "mall_tag") {
      if (resolvedActiveGroupId == null) {
        return [];
      }

      const query = debouncedTagQuery.toLowerCase();
      return mallAllTags
        .filter((tag) => tag.groupId === resolvedActiveGroupId)
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

  const canConfirm =
    variableKind === "custom_field"
      ? selectedCustomFieldIds.length > 0
      : variableKind === "system_variable"
        ? selectedSystemVariableKeys.length > 0
        : variableKind === "auto_tag"
          ? selectedAutoTag != null
          : isTagKind(variableKind)
            ? selectedTagIds.length > 0 && resolvedActiveGroupId !== null
            : false;

  function startConfigure(
    kind: VariableKind,
    initialVariable?: SkillVariableConfig,
  ) {
    setVariableKind(kind);
    setSelectedCustomFieldIds([]);
    setSelectedSystemVariableKeys([]);
    setSystemVariables([]);
    setSystemVariablesError(false);
    setWecomMode("normal");
    setSelectedTagIds([]);
    setSelectedTagNameById({});
    setSelectedAutoGroupTag("");
    setSelectedAutoTagKey("");
    setAutoTagGroups([]);
    setWorkTags([]);
    setWorkTagsLoadingMore(false);
    setWorkTagsPage(1);
    setWorkTagsHasNext(false);
    workTagsRequestVersionRef.current += 1;
    setWorkTagGroups([]);
    setMallAllTags([]);
    setActiveGroupId(null);
    setGroupQuery("");
    setTagQuery("");
    if (!initialVariable || initialVariable.type !== kind) {
      return;
    }

    if (initialVariable.type === "custom_field") {
      setSelectedCustomFieldIds([String(initialVariable.select_id)]);
      return;
    }

    if (initialVariable.type === "system_variable") {
      setSelectedSystemVariableKeys([initialVariable.select_key]);
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

  function emitVariables(items: readonly SkillResourceItem[]) {
    if (onConfirm(items) === false) {
      return;
    }
    onOpenChange(false);
  }

  function emitVariable(variable: SkillVariableConfig, displayName?: string) {
    emitVariables([buildSkillVariableResourceItem(variable, displayName)]);
  }

  function handleConfirm() {
    if (!variableKind || !canConfirm) {
      return;
    }

    if (variableKind === "custom_field") {
      const fields = selectedCustomFieldIds.flatMap((fieldId) => {
        const field = customInfoFields.find((item) => String(item.id) === fieldId);
        return field ? [field] : [];
      });
      if (fields.length === 0) {
        return;
      }

      emitVariables(
        fields.map((field) =>
          buildSkillVariableResourceItem({
            name: field.name,
            select_id: field.id,
            type: "custom_field",
          }),
        ),
      );
      return;
    }

    if (variableKind === "system_variable") {
      const variables = selectedSystemVariableKeys.flatMap((key) => {
        const variable = systemVariables.find((item) => item.key === key);
        return variable ? [variable] : [];
      });
      if (variables.length === 0) {
        return;
      }

      emitVariables(
        variables.map((variable) =>
          buildSkillVariableResourceItem({
            name: variable.name,
            select_key: variable.key,
            type: "system_variable",
          }),
        ),
      );
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

      if (
        usesComponentTagApi(tagKind) &&
        current.length >= AGENT_SKILL_TAG_MAX_COUNT
      ) {
        toast.error(`最多选择 ${AGENT_SKILL_TAG_MAX_COUNT} 个标签`);
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
            {initialConfigure?.lockKind ? "编辑变量" : "添加变量"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {initialConfigure?.lockKind
              ? "编辑已添加的变量"
              : "选择并配置要插入的变量"}
          </DialogDescription>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-6 pb-3 pt-2">
            <Tabs
              onValueChange={(value) => {
                if (!isEditingVariable) {
                  startConfigure(value as VariableKind);
                }
              }}
              value={variableKind ?? variableOptions[0].kind}
            >
              <TabsList aria-label="变量类型" className="grid w-full grid-cols-5">
                {variableOptions.map((option) => (
                  <TabsTrigger
                    aria-label={option.title}
                    className="min-w-0 px-2"
                    disabled={isEditingVariable && option.kind !== variableKind}
                    key={option.kind}
                    value={option.kind}
                  >
                    <span className="truncate">{option.title}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-6">

              {variableKind === "custom_field" ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <Label>
                    <span className="text-destructive">*</span> 字段
                  </Label>
                  {customInfoFieldsLoading ? (
                    <div
                      className="flex min-h-0 flex-1 items-center justify-center gap-2 rounded-[10px] border border-border text-sm text-muted-foreground"
                      role="status"
                    >
                      <Spinner size={14} />
                      <span>正在加载</span>
                    </div>
                  ) : customInfoFieldsError ? (
                    <div
                      className="flex min-h-0 flex-1 items-center justify-center rounded-[10px] border border-border text-sm text-destructive"
                      role="alert"
                    >
                      加载失败
                    </div>
                  ) : customInfoFields.length === 0 ? (
                    <div
                      className="flex min-h-0 flex-1 items-center justify-center rounded-[10px] border border-border text-sm text-muted-foreground"
                      role="status"
                    >
                      暂无数据
                    </div>
                  ) : (
                    <MultiChoiceList
                      addedValues={addedCustomFieldIds}
                      ariaLabel="字段"
                      items={customInfoFields.map((field) => ({
                        label: field.name,
                        value: String(field.id),
                      }))}
                      onToggle={(fieldId) =>
                        setSelectedCustomFieldIds((current) =>
                          current.includes(fieldId)
                            ? current.filter((item) => item !== fieldId)
                            : [...current, fieldId],
                        )
                      }
                      selectedValues={selectedCustomFieldIds}
                    />
                  )}
                </div>
              ) : null}

              {variableKind === "system_variable" ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <Label>
                    <span className="text-destructive">*</span> 变量
                  </Label>
                  {systemVariablesLoading ? (
                    <div
                      className="flex min-h-0 flex-1 items-center justify-center gap-2 rounded-[10px] border border-border text-sm text-muted-foreground"
                      role="status"
                    >
                      <Spinner size={14} />
                      <span>正在加载</span>
                    </div>
                  ) : systemVariablesError ? (
                    <div
                      className="flex min-h-0 flex-1 items-center justify-center rounded-[10px] border border-border text-sm text-destructive"
                      role="alert"
                    >
                      加载失败
                    </div>
                  ) : systemVariables.length === 0 ? (
                    <div
                      className="flex min-h-0 flex-1 items-center justify-center rounded-[10px] border border-border text-sm text-muted-foreground"
                      role="status"
                    >
                      暂无数据
                    </div>
                  ) : (
                    <MultiChoiceList
                      addedValues={addedSystemVariableKeys}
                      ariaLabel="变量"
                      items={systemVariables.map((item) => ({
                        label: item.name,
                        value: item.key,
                      }))}
                      onToggle={(key) =>
                        setSelectedSystemVariableKeys((current) =>
                          current.includes(key)
                            ? current.filter((item) => item !== key)
                            : [...current, key],
                        )
                      }
                      selectedValues={selectedSystemVariableKeys}
                    />
                  )}
                </div>
              ) : null}

              {isTagKind(variableKind) ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex min-h-0 flex-1 flex-col gap-2">
                    <Label className="shrink-0">
                      <span className="text-destructive">*</span> 标签
                    </Label>

                    {tagKind === "auto_tag" ? (
                      autoTagGroupsLoading ? (
                        <div
                          className="flex min-h-0 flex-1 items-center justify-center gap-2 rounded-[10px] border border-border text-sm text-muted-foreground"
                          role="status"
                        >
                          <Spinner size={14} />
                          <span>正在加载</span>
                        </div>
                      ) : autoTagGroupsError ? (
                        <div
                          className="flex min-h-0 flex-1 items-center justify-center rounded-[10px] border border-border text-sm text-destructive"
                          role="alert"
                        >
                          加载失败
                        </div>
                      ) : autoTagGroups.length === 0 ? (
                        <div
                          className="flex min-h-0 flex-1 items-center justify-center rounded-[10px] border border-border text-sm text-muted-foreground"
                          role="status"
                        >
                          暂无数据
                        </div>
                      ) : (
                        <div
                          aria-label="选择自动化标签"
                          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border"
                        >
                          <div
                            className="grid min-h-0 flex-1 grid-cols-[3fr_7fr]"
                          >
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
                                      disabled={isEditingVariable}
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
                                    <li className="flex h-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
                                      暂无数据
                                    </li>
                                  ) : (
                                    filteredAutoGroups.map((group) => (
                                      <li key={group.groupTag}>
                                        <button
                                          className={cn(
                                            "flex w-full rounded-[8px] px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
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
                                          disabled={isEditingVariable}
                                          type="button"
                                        >
                                          {group.groupName}
                                        </button>
                                      </li>
                                    ))
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
                                    onChange={(event) => setTagQuery(event.target.value)}
                                    placeholder="搜索"
                                    value={tagQuery}
                                  />
                                </div>
                              </div>
                              <RadioGroup
                                aria-label="标签列表"
                                className="min-h-0 flex-1 content-start gap-1 overflow-y-auto px-2 pb-3"
                                onValueChange={setSelectedAutoTagKey}
                                value={selectedAutoTagKey}
                              >
                                {filteredAutoTags.length === 0 ? (
                                  <div className="flex h-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
                                    暂无数据
                                  </div>
                                ) : (
                                  filteredAutoTags.map((tag) => (
                                    <Label
                                      className="flex cursor-pointer items-center gap-2 rounded-[8px] px-3 py-2 text-sm font-normal hover:bg-muted/60"
                                      key={tag.tag}
                                    >
                                      <RadioGroupItem value={tag.tag} />
                                      <span>{tag.name}</span>
                                    </Label>
                                  ))
                                )}
                              </RadioGroup>
                            </div>
                          </div>
                        </div>
                      )
                    ) : (
                      <div
                        aria-label="选择标签"
                        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border"
                      >
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
                          className="grid min-h-0 flex-1 grid-cols-[3fr_7fr]"
                        >
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
                                    disabled={isEditingVariable}
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
                                    className="flex h-full items-center justify-center gap-2 px-2 text-sm text-muted-foreground"
                                    role="status"
                                  >
                                    <Spinner size={14} />
                                    <span>正在加载</span>
                                  </li>
                                ) : usesComponentTagApi(tagKind) && workTagGroupsError ? (
                                  <li
                                    className="flex h-full items-center justify-center px-2 text-center text-sm text-destructive"
                                    role="alert"
                                  >
                                    加载失败
                                  </li>
                                ) : filteredGroups.length === 0 ? (
                                  <li className="flex h-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
                                    暂无数据
                                  </li>
                                ) : (
                                  filteredGroups.map((group) => (
                                    <li key={group.id}>
                                      <button
                                        className={cn(
                                          "flex w-full rounded-[8px] px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
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
                                        disabled={
                                          isEditingVariable ||
                                          addedTagGroupKeys.has(`${tagKind}:${group.id}`)
                                        }
                                        type="button"
                                      >
                                        {group.name}
                                      </button>
                                    </li>
                                  ))
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
                                  className="flex h-full items-center justify-center gap-2 px-2 text-sm text-muted-foreground"
                                  role="status"
                                >
                                  <Spinner size={14} />
                                  <span>正在加载</span>
                                </li>
                              ) : (tagKind === "mall_tag"
                                  ? workTagGroupsError
                                  : workTagsError) ? (
                                <li
                                  className="flex h-full items-center justify-center px-2 text-center text-sm text-destructive"
                                  role="alert"
                                >
                                  加载失败
                                </li>
                              ) : filteredTags.length === 0 ? (
                                <li className="flex h-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
                                  暂无数据
                                </li>
                              ) : (
                                <>
                                  {filteredTags.map((tag) => {
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
                                  })}
                                </>
                              )}
                              {tagKind === "work_tag" && workTagsHasNext ? (
                                <li className="px-2 pt-1">
                                  <Button
                                    className="w-full"
                                    disabled={workTagsLoadingMore}
                                    onClick={() => void handleLoadMoreWorkTags()}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                  >
                                    {workTagsLoadingMore ? (
                                      <>
                                        <Spinner size={14} />
                                        <span>正在加载</span>
                                      </>
                                    ) : (
                                      "加载更多"
                                    )}
                                  </Button>
                                </li>
                              ) : null}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              ) : null}
            </div>

          <div className="flex shrink-0 items-center justify-end gap-3 px-6 py-4">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={!canConfirm} onClick={handleConfirm} type="button">
              确认
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
