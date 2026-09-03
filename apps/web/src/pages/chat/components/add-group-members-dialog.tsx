import { useEffect, useMemo, useState } from "react";
import type { WorkbenchCustomerSummaryDto } from "@chatai/contracts";
import {
  Cancel01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";

const CANDIDATE_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;

const nameSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

export type AddGroupMemberCandidate = {
  avatarUrl: string;
  displayName: string;
  id: string;
};

export function AddGroupMembersDialog({
  excludeMemberIds,
  onOpenChange,
  open,
  seatId,
}: {
  excludeMemberIds: readonly string[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  seatId?: string;
}) {
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<AddGroupMemberCandidate[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "error">(
    "idle",
  );
  const [selectedById, setSelectedById] = useState<Map<string, AddGroupMemberCandidate>>(
    () => new Map(),
  );
  const normalizedKeyword = keyword.trim();
  const excludedIds = useMemo(() => new Set(excludeMemberIds), [excludeMemberIds]);
  const selectedMembers = useMemo(() => [...selectedById.values()], [selectedById]);
  const visibleCandidates = useMemo(
    () => candidates.filter((candidate) => !excludedIds.has(candidate.id)),
    [candidates, excludedIds],
  );

  useEffect(() => {
    if (!open) {
      setKeyword("");
      setCandidates([]);
      setLoadState("idle");
      setSelectedById(new Map());
      return;
    }

    if (!seatId) {
      setCandidates([]);
      setLoadState("loaded");
      return;
    }

    let cancelled = false;
    setLoadState("loading");

    const timer = window.setTimeout(() => {
      void getWorkbenchService()
        .getCustomers({
          ...(normalizedKeyword ? { keyword: normalizedKeyword } : {}),
          limit: CANDIDATE_PAGE_SIZE,
          scope: "mine",
          seatIds: [seatId],
        })
        .then((response) => {
          if (cancelled) return;
          setCandidates(response.items.map(toCandidate));
          setLoadState("loaded");
        })
        .catch(() => {
          if (cancelled) return;
          setCandidates([]);
          setLoadState("error");
        });
    }, normalizedKeyword ? SEARCH_DEBOUNCE_MS : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedKeyword, open, seatId]);

  function toggleCandidate(candidate: AddGroupMemberCandidate) {
    setSelectedById((current) => {
      const next = new Map(current);
      if (next.has(candidate.id)) {
        next.delete(candidate.id);
      } else {
        next.set(candidate.id, candidate);
      }
      return next;
    });
  }

  function removeCandidate(candidateId: string) {
    setSelectedById((current) => {
      const next = new Map(current);
      next.delete(candidateId);
      return next;
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[min(36rem,calc(100vh-3rem))] w-full max-w-[min(40rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="border-b border-divider px-5 py-4 text-base font-semibold">
          添加群成员
        </DialogTitle>
        <DialogDescription className="sr-only">
          选择要加入当前群聊的客户
        </DialogDescription>

        <div className="grid min-h-0 flex-1 grid-cols-2">
          <section className="flex min-h-0 flex-col border-r border-divider">
            <div className="border-b border-divider px-3 py-3">
              <div className="relative">
                <HugeiconsIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  icon={Search01Icon}
                  size={16}
                  strokeWidth={2}
                />
                <Input
                  aria-label="搜索"
                  className="h-9 pl-9"
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索"
                  value={keyword}
                />
              </div>
            </div>

            <CandidateList
              candidates={visibleCandidates}
              loadState={loadState}
              onRetry={() => {
                setLoadState("loading");
                if (!seatId) {
                  setLoadState("loaded");
                  return;
                }
                void getWorkbenchService()
                  .getCustomers({
                    ...(normalizedKeyword ? { keyword: normalizedKeyword } : {}),
                    limit: CANDIDATE_PAGE_SIZE,
                    scope: "mine",
                    seatIds: [seatId],
                  })
                  .then((response) => {
                    setCandidates(response.items.map(toCandidate));
                    setLoadState("loaded");
                  })
                  .catch(() => {
                    setCandidates([]);
                    setLoadState("error");
                  });
              }}
              onToggle={toggleCandidate}
              selectedIds={selectedById}
            />
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="shrink-0 px-4 py-3">
              <p className="text-sm font-medium text-foreground">已选成员</p>
            </div>
            <ScrollArea aria-label="已选成员" className="min-h-0 flex-1" role="region">
              {selectedMembers.length === 0 ? (
                <div className="px-4 pb-4 text-sm text-muted-foreground">暂无数据</div>
              ) : (
                <ul className="space-y-0.5 px-2 pb-2">
                  {selectedMembers.map((member) => (
                    <li
                      className="flex min-w-0 items-center gap-2 rounded-[6px] px-2 py-1.5"
                      key={member.id}
                    >
                      <CandidateAvatar member={member} />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {member.displayName}
                      </span>
                      <Button
                        aria-label={`移除 ${member.displayName}`}
                        className="size-7 shrink-0 p-0 text-muted-foreground"
                        onClick={() => removeCandidate(member.id)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </section>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-divider px-5 py-3">
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button
            disabled={selectedMembers.length === 0}
            onClick={() => onOpenChange(false)}
            type="button"
          >
            确认
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidateList({
  candidates,
  loadState,
  onRetry,
  onToggle,
  selectedIds,
}: {
  candidates: AddGroupMemberCandidate[];
  loadState: "idle" | "loading" | "loaded" | "error";
  onRetry: () => void;
  onToggle: (candidate: AddGroupMemberCandidate) => void;
  selectedIds: Map<string, AddGroupMemberCandidate>;
}) {
  if (loadState === "loading" || loadState === "idle") {
    return (
      <div
        className="flex min-h-[12rem] flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <Spinner className="text-current" size={16} variant="classic" />
        <span>正在加载</span>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <span>加载失败</span>
        <Button onClick={onRetry} size="sm" variant="outline">
          重试
        </Button>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="flex min-h-[12rem] flex-1 items-center justify-center text-sm text-muted-foreground">
        暂无数据
      </div>
    );
  }

  return (
    <ScrollArea aria-label="可选客户" className="min-h-0 flex-1" role="region">
      <ul className="space-y-0.5 px-2 py-2">
        {candidates.map((candidate) => {
          const checked = selectedIds.has(candidate.id);
          return (
            <li key={candidate.id}>
              <label
                className={cn(
                  "flex min-w-0 cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 hover:bg-accent",
                  checked && "bg-accent",
                )}
              >
                <Checkbox
                  aria-label={`选择 ${candidate.displayName}`}
                  checked={checked}
                  onCheckedChange={() => onToggle(candidate)}
                />
                <CandidateAvatar member={candidate} />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {candidate.displayName}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}

function CandidateAvatar({ member }: { member: AddGroupMemberCandidate }) {
  return (
    <Avatar className="size-7 shrink-0">
      <AvatarImage alt={member.displayName} src={member.avatarUrl} />
      <AvatarFallback className="text-[11px]">
        {getFirstNameGrapheme(member.displayName)}
      </AvatarFallback>
    </Avatar>
  );
}

function toCandidate(item: WorkbenchCustomerSummaryDto): AddGroupMemberCandidate {
  return {
    avatarUrl: item.avatar,
    displayName: item.name.trim() || item.realName.trim() || item.thirdExternalUserId,
    id: item.thirdExternalUserId,
  };
}

function getFirstNameGrapheme(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "";
  return (
    nameSegmenter?.segment(trimmedValue)[Symbol.iterator]().next().value?.segment
    ?? [...trimmedValue][0]
    ?? ""
  );
}
