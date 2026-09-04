import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  WorkTagGroupItem,
  WorkTagItem,
  WorkTagLookupItem,
} from "@chatai/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  getWorkTagsByIds,
  listWorkTagGroups,
  listWorkTags,
} from "../ai-hosting/api/work-tag-service";

const WECOM_CUSTOMER_TAG_TYPE = 0 as const;
const TAG_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

type WecomTagMode = "normal" | "exclusive";

export type WecomTagSelectorProps = {
  allowCrossGroup?: boolean;
  maxSelected?: number;
  multiple?: boolean;
  onChange: (value: number[]) => void;
  value: readonly number[];
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function getAttr(mode: WecomTagMode): 1 | 2 {
  return mode === "normal" ? 1 : 2;
}

function getErrorAction(onRetry: () => void) {
  return (
    <Button onClick={onRetry} size="sm" type="button" variant="ghost">
      重试
    </Button>
  );
}

export function WecomTagSelector({
  allowCrossGroup = true,
  maxSelected,
  multiple = true,
  onChange,
  value,
}: WecomTagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WecomTagMode>("normal");
  const [draftSelectedIds, setDraftSelectedIds] = useState<number[]>([]);
  const [groupQuery, setGroupQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const debouncedTagQuery = useDebouncedValue(tagQuery.trim(), SEARCH_DEBOUNCE_MS);
  const [groups, setGroups] = useState<WorkTagGroupItem[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState(false);
  const [groupsRetryKey, setGroupsRetryKey] = useState(0);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [tags, setTags] = useState<WorkTagItem[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsLoadingMore, setTagsLoadingMore] = useState(false);
  const [tagsError, setTagsError] = useState(false);
  const [tagsRetryKey, setTagsRetryKey] = useState(0);
  const [tagsPage, setTagsPage] = useState(1);
  const [tagsHasNext, setTagsHasNext] = useState(false);
  const groupsRequestVersionRef = useRef(0);
  const tagsRequestVersionRef = useRef(0);
  const selectedTagsRequestVersionRef = useRef(0);
  const [selectedTagGroupById, setSelectedTagGroupById] = useState<Record<number, number>>({});
  const [selectedTagById, setSelectedTagById] = useState<Record<number, WorkTagLookupItem>>({});
  const persistedTagIdsKey = value.join(",");

  const filteredGroups = useMemo(() => {
    const query = groupQuery.trim().toLowerCase();
    return query
      ? groups.filter((group) => group.name.toLowerCase().includes(query))
      : groups;
  }, [groupQuery, groups]);

  const resolvedActiveGroupId =
    activeGroupId != null && filteredGroups.some((group) => group.id === activeGroupId)
      ? activeGroupId
      : (filteredGroups[0]?.id ?? null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraftSelectedIds([...value]);
    setGroupQuery("");
    setTagQuery("");
    setMode("normal");
    setActiveGroupId(null);
  }, [open, value]);

  useEffect(() => {
    const requestVersion = selectedTagsRequestVersionRef.current + 1;
    selectedTagsRequestVersionRef.current = requestVersion;
    const persistedTagIds = persistedTagIdsKey
      ? persistedTagIdsKey.split(",").map(Number)
      : [];

    if (!open || persistedTagIds.length === 0) {
      return;
    }

    let cancelled = false;
    async function loadSelectedTags() {
      try {
        const response = await getWorkTagsByIds(persistedTagIds);
        if (cancelled || selectedTagsRequestVersionRef.current !== requestVersion) return;
        setSelectedTagById(current => ({
          ...current,
          ...Object.fromEntries(response.tags.map(tag => [tag.id, tag])),
        }));
      } catch {
        // 名称查询失败时保留 ID 兜底，不阻断标签选择。
      }
    }

    void loadSelectedTags();
    return () => {
      cancelled = true;
    };
  }, [open, persistedTagIdsKey]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const requestVersion = groupsRequestVersionRef.current + 1;
    groupsRequestVersionRef.current = requestVersion;
    let cancelled = false;

    async function loadGroups() {
      setGroupsLoading(true);
      setGroupsError(false);
      try {
        const response = await listWorkTagGroups({
          attr: getAttr(mode),
          type: WECOM_CUSTOMER_TAG_TYPE,
        });
        if (cancelled || groupsRequestVersionRef.current !== requestVersion) {
          return;
        }
        setGroups(response.groups);
        setActiveGroupId((current) =>
          response.groups.some((group) => group.id === current)
            ? current
            : (response.groups[0]?.id ?? null),
        );
      } catch {
        if (!cancelled && groupsRequestVersionRef.current === requestVersion) {
          setGroups([]);
          setActiveGroupId(null);
          setGroupsError(true);
        }
      } finally {
        if (!cancelled && groupsRequestVersionRef.current === requestVersion) {
          setGroupsLoading(false);
        }
      }
    }

    void loadGroups();
    return () => {
      cancelled = true;
    };
  }, [groupsRetryKey, mode, open]);

  useEffect(() => {
    const requestVersion = tagsRequestVersionRef.current + 1;
    tagsRequestVersionRef.current = requestVersion;
    setTagsLoadingMore(false);

    if (!open || resolvedActiveGroupId == null) {
      setTags([]);
      setTagsPage(1);
      setTagsHasNext(false);
      setTagsLoading(false);
      return;
    }

    let cancelled = false;
    async function loadTags() {
      setTagsLoading(true);
      setTagsError(false);
      setTags([]);
      setTagsPage(1);
      setTagsHasNext(false);
      try {
        const response = await listWorkTags({
          groupId: resolvedActiveGroupId,
          keyword: debouncedTagQuery || undefined,
          page: 1,
          pageSize: TAG_PAGE_SIZE,
          type: WECOM_CUSTOMER_TAG_TYPE,
        });
        if (cancelled || tagsRequestVersionRef.current !== requestVersion) {
          return;
        }
        setTags(response.tags);
        setTagsPage(response.pagination.page);
        setTagsHasNext(response.pagination.hasNext);
      } catch {
        if (!cancelled && tagsRequestVersionRef.current === requestVersion) {
          setTags([]);
          setTagsHasNext(false);
          setTagsError(true);
        }
      } finally {
        if (!cancelled && tagsRequestVersionRef.current === requestVersion) {
          setTagsLoading(false);
        }
      }
    }

    void loadTags();
    return () => {
      cancelled = true;
    };
  }, [debouncedTagQuery, open, resolvedActiveGroupId, tagsRetryKey]);

  async function loadMoreTags() {
    if (
      resolvedActiveGroupId == null ||
      tagsLoading ||
      tagsLoadingMore ||
      !tagsHasNext
    ) {
      return;
    }

    const requestVersion = tagsRequestVersionRef.current;
    const nextPage = tagsPage + 1;
    setTagsLoadingMore(true);
    try {
      const response = await listWorkTags({
        groupId: resolvedActiveGroupId,
        keyword: debouncedTagQuery || undefined,
        page: nextPage,
        pageSize: TAG_PAGE_SIZE,
        type: WECOM_CUSTOMER_TAG_TYPE,
      });
      if (tagsRequestVersionRef.current !== requestVersion) {
        return;
      }
      setTags((current) => {
        const currentIds = new Set(current.map((tag) => tag.id));
        return [...current, ...response.tags.filter((tag) => !currentIds.has(tag.id))];
      });
      setTagsPage(response.pagination.page);
      setTagsHasNext(response.pagination.hasNext);
    } catch {
      if (tagsRequestVersionRef.current === requestVersion) {
        setTagsError(true);
      }
    } finally {
      if (tagsRequestVersionRef.current === requestVersion) {
        setTagsLoadingMore(false);
      }
    }
  }

  function selectionBelongsToGroup(groupId: number) {
    return draftSelectedIds.length > 0 && draftSelectedIds.every(
      (id) => selectedTagGroupById[id] === groupId,
    );
  }

  function toggleTag(tag: WorkTagItem) {
    if (draftSelectedIds.includes(tag.id)) {
      const nextGroupsByTag = { ...selectedTagGroupById };
      delete nextGroupsByTag[tag.id];
      setSelectedTagGroupById(nextGroupsByTag);
      setDraftSelectedIds(draftSelectedIds.filter((id) => id !== tag.id));
      return;
    }

    if (!multiple || (!allowCrossGroup && !selectionBelongsToGroup(tag.groupId))) {
      setSelectedTagGroupById({ [tag.id]: tag.groupId });
      setSelectedTagById(current => ({
        ...current,
        [tag.id]: { groupName: tag.groupName, id: tag.id, name: tag.name },
      }));
      setDraftSelectedIds([tag.id]);
      return;
    }

    if (maxSelected != null && draftSelectedIds.length >= maxSelected) {
      return;
    }

    setSelectedTagGroupById({
      ...selectedTagGroupById,
      [tag.id]: tag.groupId,
    });
    setSelectedTagById(current => ({
      ...current,
      [tag.id]: { groupName: tag.groupName, id: tag.id, name: tag.name },
    }));
    setDraftSelectedIds([...draftSelectedIds, tag.id]);
  }

  function removeSelectedTag(tagId: number) {
    const nextGroupsByTag = { ...selectedTagGroupById };
    delete nextGroupsByTag[tagId];
    setSelectedTagGroupById(nextGroupsByTag);
    setDraftSelectedIds(draftSelectedIds.filter((id) => id !== tagId));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraftSelectedIds([...value]);
      setSelectedTagGroupById({});
    }
    setOpen(nextOpen);
  }

  return (
    <>
      <Button
        aria-haspopup="dialog"
        className="h-9 w-full justify-between px-3 text-[13px] font-normal"
        onClick={() => handleOpenChange(true)}
        type="button"
        variant="outline"
      >
        <span className={cn(value.length === 0 && "text-muted-foreground")}>
          {value.length > 0
            ? `已选择 ${value.length} 个标签`
            : "请选择标签"}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">选择</span>
      </Button>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="flex h-[639px] max-h-[calc(100vh-2rem)] w-[min(920px,calc(100vw-2rem))] max-w-[920px] flex-col gap-0 overflow-hidden p-0">
          <div className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle className="text-base">选择企微标签</DialogTitle>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
            <div className="mb-3">
              <Tabs
                onValueChange={(nextMode) => {
                  setMode(nextMode as WecomTagMode);
                  setGroupQuery("");
                  setTagQuery("");
                  setGroups([]);
                  setTags([]);
                  setActiveGroupId(null);
                }}
                value={mode}
              >
                <TabsList aria-label="企微标签分类" variant="underline">
                  <TabsTrigger value="normal" variant="underline">普通标签</TabsTrigger>
                  <TabsTrigger value="exclusive" variant="underline">互斥标签</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,3fr)_minmax(0,6fr)_minmax(0,4fr)] rounded-[10px] border border-border">
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
                      variant="soft"
                    />
                  </div>
                </div>
                <ul aria-label="标签组" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
                  {groupsLoading ? (
                    <li className="flex h-full items-center justify-center" role="status">
                      <Spinner size={14} />
                    </li>
                  ) : groupsError ? (
                    <li className="flex h-full flex-col items-center justify-center gap-1 text-sm text-destructive" role="alert">
                      <span>加载失败</span>
                      {getErrorAction(() => setGroupsRetryKey((key) => key + 1))}
                    </li>
                  ) : filteredGroups.length === 0 ? (
                    <li className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      暂无数据
                    </li>
                  ) : (
                    filteredGroups.map((group) => (
                      <li key={group.id}>
                        <button
                          className={cn(
                            "w-full rounded-[8px] px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                            group.id === resolvedActiveGroupId && "bg-accent",
                          )}
                          onClick={() => {
                            setActiveGroupId(group.id);
                            setTagQuery("");
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
                      aria-label="搜索标签"
                      className="h-9 pl-9"
                      onChange={(event) => setTagQuery(event.target.value)}
                      placeholder="搜索"
                      value={tagQuery}
                      variant="soft"
                    />
                  </div>
                </div>
                <ul aria-label="标签列表" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
                  {tagsLoading ? (
                    <li className="flex h-full items-center justify-center" role="status">
                      <Spinner size={14} />
                    </li>
                  ) : tagsError ? (
                    <li className="flex h-full flex-col items-center justify-center gap-1 text-sm text-destructive" role="alert">
                      <span>加载失败</span>
                      {getErrorAction(() => setTagsRetryKey((key) => key + 1))}
                    </li>
                  ) : tags.length === 0 ? (
                    <li className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      暂无数据
                    </li>
                  ) : (
                    tags.map((tag) => {
                      const checked = draftSelectedIds.includes(tag.id);
                      const atLimit =
                        maxSelected != null &&
                        draftSelectedIds.length >= maxSelected &&
                        !checked &&
                        (allowCrossGroup || selectionBelongsToGroup(tag.groupId));
                      return (
                        <li key={tag.id}>
                          <label className={cn(
                            "flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm",
                            atLimit ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/60",
                          )}>
                            <Checkbox
                              checked={checked}
                              disabled={atLimit}
                              onCheckedChange={() => toggleTag(tag)}
                            />
                            <span className="min-w-0 truncate">{tag.name}</span>
                          </label>
                        </li>
                      );
                    })
                  )}
                  {tagsHasNext ? (
                    <li className="px-2 pt-1">
                      <Button
                        className="w-full"
                        disabled={tagsLoadingMore}
                        onClick={() => void loadMoreTags()}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {tagsLoadingMore ? <Spinner size={14} /> : "加载更多"}
                      </Button>
                    </li>
                  ) : null}
                </ul>
              </div>

              <div className="flex min-h-0 flex-col">
                <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5">
                  <span className="min-w-0 text-sm text-muted-foreground">
                    已选：{draftSelectedIds.length}
                    {maxSelected != null ? ` / ${maxSelected}` : ""}
                  </span>
                  <Button
                    aria-label="清空已选标签"
                    disabled={draftSelectedIds.length === 0}
                    onClick={() => {
                      setDraftSelectedIds([]);
                      setSelectedTagGroupById({});
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    清空
                  </Button>
                </div>
                <ul aria-label="已选标签" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
                  {draftSelectedIds.length === 0 ? (
                    <li className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      暂无数据
                    </li>
                  ) : (
                    draftSelectedIds.map((tagId) => {
                      const selectedTag = selectedTagById[tagId];
                      return (
                        <li
                          className="flex items-center justify-between gap-2 rounded-[8px] bg-secondary/60 px-3 py-1.5"
                          key={tagId}
                        >
                          {selectedTag ? (
                            <span className="flex min-w-0 flex-1 items-center text-[13px]">
                              {selectedTag.groupName ? (
                                <>
                                  <span
                                    className="min-w-[3em] max-w-[45%] truncate text-muted-foreground"
                                    title={selectedTag.groupName}
                                  >
                                    {selectedTag.groupName}
                                  </span>
                                  <span className="shrink-0 text-muted-foreground">：</span>
                                </>
                              ) : null}
                              <span
                                className="min-w-0 flex-1 truncate text-foreground"
                                title={selectedTag.name}
                              >
                                {selectedTag.name}
                              </span>
                            </span>
                          ) : (
                            <span className="min-w-0 truncate text-sm text-foreground">
                              ID: {tagId}
                            </span>
                          )}
                          <Button
                            aria-label={`移除标签 ${tagId}`}
                            className="size-7 shrink-0"
                            onClick={() => removeSelectedTag(tagId)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
                          </Button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-3 px-6 py-4">
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              取消
            </Button>
            <Button
              onClick={() => {
                onChange(draftSelectedIds);
                setOpen(false);
              }}
              type="button"
            >
              确认
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
