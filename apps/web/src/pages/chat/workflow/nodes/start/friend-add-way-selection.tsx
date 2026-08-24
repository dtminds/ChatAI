import { ArrowRight01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import {
  WORKFLOW_FRIEND_SOURCE_MAX_SELECTED,
  type WorkflowFriendAddWayGroup,
  type WorkflowFriendAddWayItem,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  getSelectableFriendAddWays,
  type WorkflowFriendAddWayResourceStatus,
} from "../../workflow-friend-add-way-resource";

export function FriendAddWaySelection({
  groups,
  onChange,
  onRetry,
  selectedKeys,
  status,
}: {
  groups: readonly WorkflowFriendAddWayGroup[];
  onChange(keys: string[]): void;
  onRetry?: () => void;
  selectedKeys: readonly string[];
  status: WorkflowFriendAddWayResourceStatus;
}) {
  const [open, setOpen] = useState(false);
  const [groupQuery, setGroupQuery] = useState("");
  const [childQuery, setChildQuery] = useState("");
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [draftSelectedKeys, setDraftSelectedKeys] = useState<string[]>([]);
  const catalogKeys = useMemo(
    () => new Set(getSelectableFriendAddWays(groups).map(option => option.key)),
    [groups],
  );
  const draftSelectedKeySet = new Set(draftSelectedKeys);
  const filteredGroups = useMemo(
    () => filterGroups(groups, groupQuery),
    [groupQuery, groups],
  );
  const activeGroup = filteredGroups.find(group =>
    group.key === activeGroupKey && group.children.length > 0,
  ) ?? null;
  const rightItems = useMemo(
    () => getRightItems(activeGroup, childQuery),
    [activeGroup, childQuery],
  );
  const showRightPane = activeGroup != null;
  const atLimit = draftSelectedKeys.length >= WORKFLOW_FRIEND_SOURCE_MAX_SELECTED;

  useEffect(() => {
    if (!open) {
      return;
    }

    setGroupQuery("");
    setChildQuery("");
    setActiveGroupKey(groups.find(group => group.children.length > 0)?.key ?? null);
    setDraftSelectedKeys(
      selectedKeys.filter(key => catalogKeys.has(key)).slice(0, WORKFLOW_FRIEND_SOURCE_MAX_SELECTED),
    );
  }, [catalogKeys, groups, open, selectedKeys]);

  function toggleDraftKey(key: string, checked: boolean) {
    setDraftSelectedKeys(current => {
      if (!checked) {
        return current.filter(item => item !== key);
      }

      if (current.includes(key) || current.length >= WORKFLOW_FRIEND_SOURCE_MAX_SELECTED) {
        return current;
      }

      return [...current, key];
    });
  }

  return (
    <div>
      {status === "error" ? (
        <div className="flex min-h-10 items-center justify-between gap-2 rounded-[10px] bg-secondary px-3.5 text-[13px] text-muted-foreground">
          <span>操作失败，请稍后重试</span>
          {onRetry ? (
            <Button onClick={onRetry} size="sm" type="button" variant="ghost">
              重试
            </Button>
          ) : null}
        </div>
      ) : status === "loading" || status === "idle" ? (
        <div
          className="flex min-h-10 items-center gap-2 rounded-[10px] bg-secondary px-3.5 text-[13px] text-muted-foreground"
          role="status"
        >
          <Spinner />
          <span>正在加载</span>
        </div>
      ) : (
        <Button
          aria-haspopup="dialog"
          className="h-9 w-full justify-between px-3 text-[13px] font-normal"
          onClick={() => setOpen(true)}
          type="button"
          variant="outline"
        >
          <span className={cn(selectedKeys.length === 0 && "text-muted-foreground")}>
            {selectedKeys.length > 0
              ? `已选择 ${selectedKeys.length} 个来源`
              : "不限来源"}
          </span>
          <span aria-hidden="true" className="text-muted-foreground">选择</span>
        </Button>
      )}

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="flex h-[420px] max-h-[calc(100vh-2rem)] w-[min(640px,calc(100vw-2rem))] max-w-[640px] flex-col gap-0 overflow-hidden p-0">
          <div className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle className="text-base">选择添加好友来源</DialogTitle>
          </div>

          {groups.length === 0 ? (
            <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              暂无数据
            </p>
          ) : (
            <div className={cn("grid min-h-0 flex-1 px-6 py-4", showRightPane && "grid-cols-2")}>
              <div className={cn(
                "flex min-h-0 flex-col border border-border",
                showRightPane ? "rounded-l-[10px]" : "rounded-[10px]",
              )}>
                <SearchField
                  ariaLabel="搜索添加方式"
                  onChange={setGroupQuery}
                  value={groupQuery}
                />
                <ul
                  aria-label="添加方式"
                  className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3"
                >
                  {filteredGroups.length === 0 ? (
                    <li className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      暂无数据
                    </li>
                  ) : filteredGroups.map(group => {
                    const hasChildren = group.children.length > 0;
                    if (!hasChildren) {
                      const checked = draftSelectedKeySet.has(group.key);
                      const disabled = atLimit && !checked;
                      return (
                        <li key={group.key}>
                          <label className={cn(
                            "flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm",
                            disabled
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer hover:bg-muted/60",
                          )}>
                            <Checkbox
                              aria-label={group.title}
                              checked={checked}
                              disabled={disabled}
                              onCheckedChange={(value) => {
                                setActiveGroupKey(null);
                                toggleDraftKey(group.key, value === true);
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate">{group.title}</span>
                          </label>
                        </li>
                      );
                    }

                    return (
                      <li key={group.key}>
                        <button
                          className={cn(
                            "flex w-full items-center rounded-[8px] px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                            group.key === activeGroup?.key && "bg-accent",
                          )}
                          onClick={() => {
                            setActiveGroupKey(group.key);
                            setChildQuery("");
                          }}
                          type="button"
                        >
                          <span className="min-w-0 flex-1 truncate">{group.title}</span>
                          <HugeiconsIcon
                            aria-hidden="true"
                            className="shrink-0 text-muted-foreground"
                            icon={ArrowRight01Icon}
                            size={14}
                            strokeWidth={1.8}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {showRightPane ? (
                <div className="-ml-px flex min-h-0 flex-col rounded-r-[10px] border border-border">
                  <SearchField
                    ariaLabel="搜索子类添加方式"
                    onChange={setChildQuery}
                    value={childQuery}
                  />
                  <ul
                    aria-label="子类添加方式"
                    className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3"
                  >
                    {rightItems.length === 0 ? (
                      <li className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        暂无数据
                      </li>
                    ) : rightItems.map(item => {
                      const checked = draftSelectedKeySet.has(item.key);
                      const disabled = atLimit && !checked;
                      return (
                        <li key={item.key}>
                          <label className={cn(
                            "flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm",
                            disabled
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer hover:bg-muted/60",
                          )}>
                            <Checkbox
                              aria-label={item.title}
                              checked={checked}
                              disabled={disabled}
                              onCheckedChange={value => toggleDraftKey(item.key, value === true)}
                            />
                            <span className="min-w-0 truncate">{item.title}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
            <span className="text-sm text-muted-foreground">
              已选 {draftSelectedKeys.length} / {WORKFLOW_FRIEND_SOURCE_MAX_SELECTED}
            </span>
            <div className="flex gap-3">
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              取消
            </Button>
            <Button
              onClick={() => {
                onChange(draftSelectedKeys);
                setOpen(false);
              }}
              type="button"
            >
              确定
            </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SearchField({
  ariaLabel,
  onChange,
  value,
}: {
  ariaLabel: string;
  onChange(value: string): void;
  value: string;
}) {
  return (
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
          aria-label={ariaLabel}
          className="h-9 pl-9"
          onChange={event => onChange(event.target.value)}
          placeholder="搜索"
          value={value}
          variant="soft"
        />
      </div>
    </div>
  );
}

function filterGroups(
  groups: readonly WorkflowFriendAddWayGroup[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return groups;
  }

  return groups.filter(group =>
    group.title.toLowerCase().includes(normalizedQuery)
    || group.children.some(child => child.title.toLowerCase().includes(normalizedQuery)),
  );
}

function getRightItems(
  group: WorkflowFriendAddWayGroup | null,
  query: string,
): WorkflowFriendAddWayItem[] {
  if (!group) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return group.children;
  }

  return group.children.filter(item => item.title.toLowerCase().includes(normalizedQuery));
}
