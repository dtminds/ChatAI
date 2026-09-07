import { useEffect, useMemo, useRef, useState } from "react";
import {
  WORKBENCH_PULL_GROUP_MEMBERS_MAX_ITEMS,
  type WorkbenchCustomerSummaryDto,
  type WorkbenchEnterpriseMemberDto,
} from "@chatai/contracts";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { resolveErrorMessage } from "@/pages/chat/lib/error-message";

const CANDIDATE_GROUPS = [
  { kind: "employee", defaultOpen: false, label: "成员" },
  { kind: "member", defaultOpen: true, label: "客户" },
] as const;
/** 与客户页相同的一页条数；继续加载由用户点击触发。 */
const CUSTOMER_PAGE_SIZE = 50;
const CUSTOMER_SEARCH_DEBOUNCE_MS = 300;

const nameSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

export type AddGroupMemberCandidate = {
  avatarUrl: string;
  displayName: string;
  id: string;
  kind: "employee" | "member";
};

type CandidateLoadState = "idle" | "loading" | "loaded" | "error";

export function AddGroupMembersDialog({
  conversationId,
  currentSeatThirdUserId,
  excludeMemberIds,
  onAdded,
  onOpenChange,
  open,
  seatId,
}: {
  conversationId?: string;
  currentSeatThirdUserId?: string;
  excludeMemberIds: readonly string[];
  onAdded?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  seatId?: string;
}) {
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [employees, setEmployees] = useState<AddGroupMemberCandidate[]>([]);
  const [customers, setCustomers] = useState<AddGroupMemberCandidate[]>([]);
  const [employeeLoadState, setEmployeeLoadState] = useState<CandidateLoadState>("idle");
  const [customerLoadState, setCustomerLoadState] = useState<CandidateLoadState>("idle");
  const [customerHasMore, setCustomerHasMore] = useState(false);
  const [customerNextCursor, setCustomerNextCursor] = useState<string | undefined>();
  const [isLoadingMoreCustomers, setIsLoadingMoreCustomers] = useState(false);
  const [selectedById, setSelectedById] = useState<Map<string, AddGroupMemberCandidate>>(
    () => new Map(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const customerRequestIdRef = useRef(0);
  const normalizedKeyword = keyword.trim();
  const excludedIds = useMemo(() => new Set(excludeMemberIds), [excludeMemberIds]);
  const selectedMembers = useMemo(() => [...selectedById.values()], [selectedById]);
  const employeeCandidates = useMemo(
    () =>
      employees.filter((candidate) => {
        if (excludedIds.has(candidate.id) || candidate.id === currentSeatThirdUserId) {
          return false;
        }
        if (
          normalizedKeyword &&
          !candidate.displayName.toLocaleLowerCase().includes(
            normalizedKeyword.toLocaleLowerCase(),
          )
        ) {
          return false;
        }
        return true;
      }),
    [currentSeatThirdUserId, employees, excludedIds, normalizedKeyword],
  );
  const customerCandidates = useMemo(
    () => customers.filter((candidate) => !excludedIds.has(candidate.id)),
    [customers, excludedIds],
  );
  const visibleCandidates = useMemo(
    () => [...employeeCandidates, ...customerCandidates],
    [customerCandidates, employeeCandidates],
  );

  useEffect(() => {
    if (!open) {
      setDebouncedKeyword("");
      return;
    }

    if (!normalizedKeyword) {
      setDebouncedKeyword("");
      return;
    }

    const timer = window.setTimeout(() => {
      setDebouncedKeyword(normalizedKeyword);
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [normalizedKeyword, open]);

  useEffect(() => {
    if (!open) {
      setKeyword("");
      setEmployees([]);
      setCustomers([]);
      setEmployeeLoadState("idle");
      setCustomerLoadState("idle");
      setCustomerHasMore(false);
      setCustomerNextCursor(undefined);
      setIsLoadingMoreCustomers(false);
      setSelectedById(new Map());
      setIsSubmitting(false);
      customerRequestIdRef.current += 1;
      return;
    }

    let cancelled = false;
    setEmployeeLoadState("loading");

    void getWorkbenchService()
      .getEnterpriseMembers()
      .then((response) => {
        if (cancelled) return;
        setEmployees(response.items.map(toEmployeeCandidate));
        setEmployeeLoadState("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setEmployees([]);
        setEmployeeLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!seatId) {
      customerRequestIdRef.current += 1;
      setCustomers([]);
      setCustomerHasMore(false);
      setCustomerNextCursor(undefined);
      setIsLoadingMoreCustomers(false);
      setCustomerLoadState("loaded");
      return;
    }

    const requestId = customerRequestIdRef.current + 1;
    customerRequestIdRef.current = requestId;
    setCustomers([]);
    setCustomerHasMore(false);
    setCustomerNextCursor(undefined);
    setIsLoadingMoreCustomers(false);
    setCustomerLoadState("loading");

    void fetchCustomerPage({
      keyword: debouncedKeyword,
      seatId,
    }).then((page) => {
      if (customerRequestIdRef.current !== requestId) {
        return;
      }

      if (!page) {
        setCustomers([]);
        setCustomerHasMore(false);
        setCustomerNextCursor(undefined);
        setCustomerLoadState("error");
        return;
      }

      setCustomers(page.items);
      setCustomerHasMore(page.hasMore);
      setCustomerNextCursor(page.nextCursor);
      setCustomerLoadState("loaded");
    });
  }, [debouncedKeyword, open, seatId]);

  function toggleCandidate(candidate: AddGroupMemberCandidate) {
    if (
      !selectedById.has(candidate.id) &&
      selectedById.size >= WORKBENCH_PULL_GROUP_MEMBERS_MAX_ITEMS
    ) {
      toast.error(`最多选择 ${WORKBENCH_PULL_GROUP_MEMBERS_MAX_ITEMS} 人`);
      return;
    }

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

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isSubmitting) {
      return;
    }
    onOpenChange(nextOpen);
  }

  function handleRetryCustomers() {
    if (!seatId) {
      setCustomers([]);
      setCustomerHasMore(false);
      setCustomerNextCursor(undefined);
      setCustomerLoadState("loaded");
      return;
    }

    const requestId = customerRequestIdRef.current + 1;
    customerRequestIdRef.current = requestId;
    setCustomers([]);
    setCustomerHasMore(false);
    setCustomerNextCursor(undefined);
    setIsLoadingMoreCustomers(false);
    setCustomerLoadState("loading");

    void fetchCustomerPage({
      keyword: debouncedKeyword,
      seatId,
    }).then((page) => {
      if (customerRequestIdRef.current !== requestId) {
        return;
      }

      if (!page) {
        setCustomers([]);
        setCustomerHasMore(false);
        setCustomerNextCursor(undefined);
        setCustomerLoadState("error");
        return;
      }

      setCustomers(page.items);
      setCustomerHasMore(page.hasMore);
      setCustomerNextCursor(page.nextCursor);
      setCustomerLoadState("loaded");
    });
  }

  async function handleLoadMoreCustomers() {
    if (!seatId || !customerNextCursor || isLoadingMoreCustomers) {
      return;
    }

    const requestId = customerRequestIdRef.current;
    setIsLoadingMoreCustomers(true);

    const page = await fetchCustomerPage({
      cursor: customerNextCursor,
      keyword: debouncedKeyword,
      seatId,
    });

    if (customerRequestIdRef.current !== requestId) {
      return;
    }

    if (!page) {
      toast.error("操作失败，请稍后重试");
      setIsLoadingMoreCustomers(false);
      return;
    }

    setCustomers((current) => mergeCustomerCandidates(current, page.items));
    setCustomerHasMore(page.hasMore);
    setCustomerNextCursor(page.nextCursor);
    setIsLoadingMoreCustomers(false);
  }

  async function handleConfirm() {
    if (!conversationId || selectedMembers.length === 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await getWorkbenchService().pullGroupMembers(conversationId, {
        contactThirdUserIds: selectedMembers.map((member) => member.id),
      });
      toast.success("已添加");
      onAdded?.();
      setIsSubmitting(false);
      onOpenChange(false);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "操作失败，请稍后重试"));
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="flex h-[min(36rem,calc(100vh-3rem))] w-full max-w-[min(40rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="border-b border-divider px-5 py-4 text-base font-semibold">
          添加群成员
        </DialogTitle>
        <DialogDescription className="sr-only">
          选择要加入当前群聊的成员或客户
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
              customerHasMore={customerHasMore}
              customerLoadState={customerLoadState}
              employeeLoadState={employeeLoadState}
              isLoadingMoreCustomers={isLoadingMoreCustomers}
              keyword={normalizedKeyword}
              onLoadMoreCustomers={() => {
                void handleLoadMoreCustomers();
              }}
              onRetryCustomers={handleRetryCustomers}
              onRetryEmployees={() => {
                setEmployeeLoadState("loading");
                void getWorkbenchService()
                  .getEnterpriseMembers()
                  .then((response) => {
                    setEmployees(response.items.map(toEmployeeCandidate));
                    setEmployeeLoadState("loaded");
                  })
                  .catch(() => {
                    setEmployees([]);
                    setEmployeeLoadState("error");
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
          <Button
            disabled={isSubmitting}
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={selectedMembers.length === 0 || isSubmitting || !conversationId}
            onClick={() => {
              void handleConfirm();
            }}
            type="button"
          >
            {isSubmitting ? <Spinner aria-hidden="true" size={14} /> : null}
            确认
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidateList({
  candidates,
  customerHasMore,
  customerLoadState,
  employeeLoadState,
  isLoadingMoreCustomers,
  keyword,
  onLoadMoreCustomers,
  onRetryCustomers,
  onRetryEmployees,
  onToggle,
  selectedIds,
}: {
  candidates: AddGroupMemberCandidate[];
  customerHasMore: boolean;
  customerLoadState: CandidateLoadState;
  employeeLoadState: CandidateLoadState;
  isLoadingMoreCustomers: boolean;
  keyword: string;
  onLoadMoreCustomers: () => void;
  onRetryCustomers: () => void;
  onRetryEmployees: () => void;
  onToggle: (candidate: AddGroupMemberCandidate) => void;
  selectedIds: Map<string, AddGroupMemberCandidate>;
}) {
  const [openByKind, setOpenByKind] = useState<Partial<Record<"employee" | "member", boolean>>>(
    {},
  );
  const isInitialLoading =
    (employeeLoadState === "idle" || employeeLoadState === "loading") &&
    (customerLoadState === "idle" || customerLoadState === "loading");
  const isCombinedError =
    employeeLoadState === "error" && customerLoadState === "error";

  useEffect(() => {
    if (isInitialLoading) {
      setOpenByKind({});
      return;
    }

    if (keyword) {
      setOpenByKind({
        employee: candidates.some((candidate) => candidate.kind === "employee"),
        member: candidates.some((candidate) => candidate.kind === "member") || customerHasMore,
      });
    }
  }, [candidates, customerHasMore, isInitialLoading, keyword]);

  if (isInitialLoading) {
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

  if (isCombinedError) {
    return (
      <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <span>加载失败</span>
        <Button
          onClick={() => {
            onRetryEmployees();
            onRetryCustomers();
          }}
          size="sm"
          variant="outline"
        >
          重试
        </Button>
      </div>
    );
  }

  const groupedCandidates = CANDIDATE_GROUPS.map((group) => ({
    ...group,
    items: candidates.filter((candidate) => candidate.kind === group.kind),
    loadState: group.kind === "employee" ? employeeLoadState : customerLoadState,
    onRetry: group.kind === "employee" ? onRetryEmployees : onRetryCustomers,
  }));

  return (
    <ScrollArea aria-label="可选成员" className="min-h-0 flex-1" role="region">
      <div className="space-y-0.5 px-2 py-2">
        {groupedCandidates.map((group) => (
          <CandidateGroup
            group={group}
            key={group.kind}
            loadMore={
              group.kind === "member"
                ? {
                    hasMore: customerHasMore,
                    isLoading: isLoadingMoreCustomers,
                    onLoadMore: onLoadMoreCustomers,
                  }
                : undefined
            }
            onOpenChange={(open) => {
              setOpenByKind((current) => ({ ...current, [group.kind]: open }));
            }}
            onRetry={group.onRetry}
            onToggle={onToggle}
            open={openByKind[group.kind] ?? group.defaultOpen}
            selectedIds={selectedIds}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function CandidateGroup({
  group,
  loadMore,
  onOpenChange,
  onRetry,
  onToggle,
  open,
  selectedIds,
}: {
  group: {
    items: AddGroupMemberCandidate[];
    kind: "employee" | "member";
    label: string;
    loadState: CandidateLoadState;
  };
  loadMore?: {
    hasMore: boolean;
    isLoading: boolean;
    onLoadMore: () => void;
  };
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onToggle: (candidate: AddGroupMemberCandidate) => void;
  open: boolean;
  selectedIds: Map<string, AddGroupMemberCandidate>;
}) {
  const contentId = `add-group-member-${group.kind}`;
  const showEmpty = group.items.length === 0 && !loadMore?.hasMore;

  return (
    <Collapsible onOpenChange={onOpenChange} open={open}>
      <CollapsibleTrigger asChild>
        <Button
          aria-controls={contentId}
          aria-expanded={open}
          aria-label={`${open ? "收起" : "展开"}${group.label}`}
          className="h-8 w-full justify-start gap-1.5 px-2 font-normal"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            aria-hidden="true"
            className="shrink-0 text-muted-foreground"
            icon={open ? ArrowDown01Icon : ArrowRight01Icon}
            size={14}
            strokeWidth={1.8}
          />
          <span className="truncate text-sm text-foreground">{group.label}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent id={contentId}>
        {group.loadState === "loading" || group.loadState === "idle" ? (
          <div
            className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground"
            role="status"
          >
            <Spinner className="text-current" size={14} variant="classic" />
            <span>正在加载</span>
          </div>
        ) : group.loadState === "error" ? (
          <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
            <span>加载失败</span>
            <Button onClick={onRetry} size="sm" variant="outline">
              重试
            </Button>
          </div>
        ) : (
          <>
            {showEmpty ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">暂无数据</div>
            ) : group.items.length > 0 ? (
              <ul className="space-y-0.5">
                {group.items.map((candidate) => {
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
            ) : null}
            {loadMore?.hasMore ? (
              <div className="flex justify-center py-2">
                <Button
                  disabled={loadMore.isLoading}
                  onClick={loadMore.onLoadMore}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {loadMore.isLoading ? (
                    <Spinner className="text-current" size={14} variant="classic" />
                  ) : null}
                  加载更多
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
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

async function fetchCustomerPage(input: {
  cursor?: string;
  keyword: string;
  seatId: string;
}) {
  try {
    const response = await getWorkbenchService().getCustomers({
      ...(input.cursor ? { cursor: input.cursor } : {}),
      ...(input.keyword ? { keyword: input.keyword } : {}),
      limit: CUSTOMER_PAGE_SIZE,
      scope: "mine",
      seatIds: [input.seatId],
    });

    return {
      hasMore: response.hasMore,
      items: response.items.map(toCustomerCandidate),
      nextCursor: response.nextCursor,
    };
  } catch {
    return undefined;
  }
}

function mergeCustomerCandidates(
  current: AddGroupMemberCandidate[],
  incoming: AddGroupMemberCandidate[],
) {
  const merged = [...current];
  const seenIds = new Set(current.map((candidate) => candidate.id));

  for (const candidate of incoming) {
    if (seenIds.has(candidate.id)) {
      continue;
    }

    seenIds.add(candidate.id);
    merged.push(candidate);
  }

  return merged;
}

function toCustomerCandidate(item: WorkbenchCustomerSummaryDto): AddGroupMemberCandidate {
  return {
    avatarUrl: item.avatar,
    displayName: item.name.trim() || item.realName.trim() || item.thirdExternalUserId,
    id: item.thirdExternalUserId,
    kind: "member",
  };
}

function toEmployeeCandidate(item: WorkbenchEnterpriseMemberDto): AddGroupMemberCandidate {
  return {
    avatarUrl: item.avatarUrl,
    displayName: item.displayName.trim() || item.thirdUserId,
    id: item.thirdUserId,
    kind: "employee",
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
