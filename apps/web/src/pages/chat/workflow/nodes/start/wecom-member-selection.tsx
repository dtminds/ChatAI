import {
  ArrowRight01Icon,
  Cancel01Icon,
  Folder01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import type { WorkflowWeComMemberNode } from "@chatai/contracts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  collectWeComMemberWorkUserIds,
  filterWeComMemberTree,
  findWeComMemberByWorkUserId,
  isWeComMemberSelectable,
  type WorkflowWeComMemberResourceStatus,
} from "../../workflow-wecom-member-resource";

export function WecomMemberSelection({
  memberLimit,
  onChange,
  onRetry,
  roots,
  selectedIds,
  status,
}: {
  memberLimit: number;
  onChange(ids: number[]): void;
  onRetry?: () => void;
  roots: WorkflowWeComMemberNode[];
  selectedIds: number[];
  status: WorkflowWeComMemberResourceStatus;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draftSelectedIds, setDraftSelectedIds] = useState<number[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const draftSelectedIdSet = useMemo(() => new Set(draftSelectedIds), [draftSelectedIds]);
  const filteredRoots = useMemo(
    () => filterWeComMemberTree(roots, query),
    [query, roots],
  );
  const selectedMembers = resolveSelectedMembers(roots, selectedIds, status);
  const draftSelectedMembers = resolveSelectedMembers(roots, draftSelectedIds, status);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraftSelectedIds([...selectedIds]);
      setQuery("");
      setExpandedIds(new Set(
        roots.filter(node => node.kind === "department").map(node => node.id),
      ));
    }
    setOpen(nextOpen);
  }

  function toggleMember(workUserId: number, checked: boolean) {
    if (checked) {
      const member = findWeComMemberByWorkUserId(roots, workUserId);

      if (
        (member && !isWeComMemberSelectable(member))
        || draftSelectedIdSet.has(workUserId)
        || draftSelectedIds.length >= memberLimit
      ) {
        return;
      }

      setDraftSelectedIds([...draftSelectedIds, workUserId]);
      return;
    }

    setDraftSelectedIds(draftSelectedIds.filter(id => id !== workUserId));
  }

  function toggleDepartment(node: WorkflowWeComMemberNode, checked: boolean) {
    const descendantIds = collectWeComMemberWorkUserIds([node]);

    if (checked) {
      const next = [...draftSelectedIds];

      for (const id of descendantIds) {
        if (next.length >= memberLimit) {
          break;
        }

        if (!draftSelectedIdSet.has(id)) {
          next.push(id);
        }
      }

      setDraftSelectedIds(next);
      return;
    }

    const descendantIdSet = new Set(descendantIds);
    setDraftSelectedIds(draftSelectedIds.filter(id => !descendantIdSet.has(id)));
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  return (
    <div className="space-y-3 px-0">
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
          onClick={() => handleOpenChange(true)}
          type="button"
          variant="outline"
        >
          <span className={cn(selectedIds.length === 0 && "text-muted-foreground")}>
            {selectedIds.length > 0
              ? `已选择 ${selectedIds.length} 个企微成员`
              : "请选择成员"}
          </span>
        </Button>
      )}

      {selectedMembers.length > 0 ? (
        <ScrollArea className="h-[9rem] rounded-[8px] border border-dashed border-border">
          <ul aria-label="已选企微成员" className="space-y-1 p-2">
            {selectedMembers.map(member => (
              <li
                className="flex h-10 items-center gap-2 rounded-[8px] px-1.5 text-[13px] text-foreground"
                key={member.workUserId}
              >
                <MemberAvatar node={member} />
                <span className="min-w-0 flex-1 truncate">{member.title}</span>
                <Button
                  aria-label={`移除 ${member.title}`}
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => onChange(selectedIds.filter(id => id !== member.workUserId))}
                  type="button"
                  variant="ghost"
                >
                  移除
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      ) : null}

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="flex h-[520px] max-h-[calc(100vh-2rem)] w-[min(720px,calc(100vw-2rem))] max-w-[720px] flex-col gap-0 overflow-hidden p-0">
          <div className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle className="text-base">选择成员</DialogTitle>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-2">
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
                    aria-label="搜索成员"
                    className="h-9 pl-9"
                    onChange={event => setQuery(event.target.value)}
                    placeholder="请输入成员"
                    value={query}
                    variant="soft"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {roots.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
                    暂无数据
                  </p>
                ) : filteredRoots.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
                    未找到匹配成员
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {filteredRoots.map(node => (
                      <TreeNodeRow
                        expandedIds={query.trim() ? null : expandedIds}
                        key={node.id}
                        memberLimit={memberLimit}
                        node={node}
                        onToggleDepartment={toggleDepartment}
                        onToggleExpanded={toggleExpanded}
                        onToggleMember={toggleMember}
                        selectedIdSet={draftSelectedIdSet}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5">
                <span className="text-[13px] text-muted-foreground">
                  已选:{draftSelectedIds.length > 0 ? draftSelectedIds.length : ""}
                </span>
                <Button
                  disabled={draftSelectedIds.length === 0}
                  onClick={() => setDraftSelectedIds([])}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  清空
                </Button>
              </div>
              <ul aria-label="已选成员" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
                {draftSelectedMembers.map(member => (
                  <li
                    className="flex h-10 items-center gap-2 rounded-[8px] px-2 text-[13px] text-foreground"
                    key={member.workUserId}
                  >
                    <MemberAvatar node={member} />
                    <span className="min-w-0 flex-1 truncate">{member.title}</span>
                    <Button
                      aria-label={`移除 ${member.title}`}
                      className="size-7 shrink-0 text-muted-foreground"
                      onClick={() => toggleMember(member.workUserId ?? 0, false)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-3 border-t border-border px-6 py-4">
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
              确定
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function resolveSelectedMembers(
  roots: readonly WorkflowWeComMemberNode[],
  selectedIds: readonly number[],
  status: WorkflowWeComMemberResourceStatus,
) {
  return selectedIds.map(id => findWeComMemberByWorkUserId(roots, id) ?? {
    children: [],
    id: `missing-${id}`,
    kind: "member" as const,
    title: status === "ready" ? "已失效的企微成员" : "企微成员",
    workUserId: id,
  });
}

function TreeNodeRow({
  expandedIds,
  memberLimit,
  node,
  onToggleDepartment,
  onToggleExpanded,
  onToggleMember,
  selectedIdSet,
}: {
  expandedIds: Set<string> | null;
  memberLimit: number;
  node: WorkflowWeComMemberNode;
  onToggleDepartment(node: WorkflowWeComMemberNode, checked: boolean): void;
  onToggleExpanded(id: string): void;
  onToggleMember(workUserId: number, checked: boolean): void;
  selectedIdSet: Set<number>;
}) {
  if (node.kind === "member" && node.workUserId) {
    const checked = selectedIdSet.has(node.workUserId);
    const selectable = isWeComMemberSelectable(node);

    return (
      <label
        className={cn(
          "flex h-9 items-center gap-2 rounded-[8px] px-2 text-[13px]",
          selectable
            ? "cursor-pointer text-foreground hover:bg-surface-hover"
            : "cursor-not-allowed text-muted-foreground/60",
        )}
      >
        <Checkbox
          aria-label={node.title}
          checked={checked}
          className={selectable ? undefined : "border-muted-foreground/15 bg-muted disabled:opacity-100"}
          disabled={!selectable || (!checked && selectedIdSet.size >= memberLimit)}
          onCheckedChange={value => onToggleMember(node.workUserId ?? 0, value === true)}
        />
        <MemberAvatar dimmed={!selectable} node={node} />
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
      </label>
    );
  }

  const descendantIds = collectWeComMemberWorkUserIds([node]);
  const selectedCount = descendantIds.filter(id => selectedIdSet.has(id)).length;
  const checked = descendantIds.length > 0 && selectedCount === descendantIds.length;
  const indeterminate = selectedCount > 0 && selectedCount < descendantIds.length;
  const expanded = expandedIds == null || expandedIds.has(node.id);
  const departmentDisabled = descendantIds.length === 0;

  return (
    <div>
      <div className="flex h-9 items-center gap-1 rounded-[8px] px-1 text-[13px] text-foreground hover:bg-surface-hover">
        <Button
          aria-expanded={expanded}
          aria-label={expanded ? "收起部门" : "展开部门"}
          className="size-7 shrink-0 text-muted-foreground"
          onClick={() => onToggleExpanded(node.id)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            className={cn("transition-transform", expanded && "rotate-90")}
            icon={ArrowRight01Icon}
            size={14}
            strokeWidth={2}
          />
        </Button>
        <label
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 pr-1.5",
            departmentDisabled ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer",
          )}
        >
          <Checkbox
            aria-label={node.title}
            checked={indeterminate ? "indeterminate" : checked}
            disabled={departmentDisabled}
            onCheckedChange={value => onToggleDepartment(node, value === true)}
          />
          <HugeiconsIcon
            aria-hidden="true"
            className="shrink-0 text-muted-foreground"
            icon={Folder01Icon}
            size={16}
            strokeWidth={1.8}
          />
          <span className="min-w-0 flex-1 truncate">{node.title}</span>
        </label>
      </div>
      {expanded ? (
        <div className="ml-6 space-y-0.5">
          {node.children.map(child => (
            <TreeNodeRow
              expandedIds={expandedIds}
              key={child.id}
              memberLimit={memberLimit}
              node={child}
              onToggleDepartment={onToggleDepartment}
              onToggleExpanded={onToggleExpanded}
              onToggleMember={onToggleMember}
              selectedIdSet={selectedIdSet}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MemberAvatar({ dimmed = false, node }: { dimmed?: boolean; node: WorkflowWeComMemberNode }) {
  return (
    <Avatar
      aria-label={`${node.title}头像`}
      className={cn("size-6 shrink-0", dimmed && "opacity-40")}
      role="img"
    >
      <AvatarImage alt="" src={node.avatarUrl} />
      <AvatarFallback className="text-[11px]">
        {node.title.trim().slice(0, 1) || "?"}
      </AvatarFallback>
    </Avatar>
  );
}
