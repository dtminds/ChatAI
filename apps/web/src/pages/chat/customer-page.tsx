import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  Chat01Icon,
  Male02Icon,
  Refresh03Icon,
  Search01Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Spinner } from "@/components/ui/spinner";
import type {
  WorkbenchCustomerLastConversationDto,
  WorkbenchCustomerSeatRelationDto,
  WorkbenchCustomerSummaryDto,
} from "@chatai/contracts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import { adaptMessage } from "@/pages/chat/api/workbench-adapter";
import { formatMessageDividerLabel } from "@/pages/chat/components/message-feed";
import { HistoryCompactMessageList } from "@/pages/chat/components/message-history-side-panel";
import type { Account, Message } from "@/pages/chat/chat-types";

const ALL_VISIBLE_SEATS = "__all_visible_seats__";
const CUSTOMER_PAGE_SIZE = 50;
const RECENT_MESSAGE_PREVIEW_LIMIT = 10;

type CustomerScope = "mine" | "all";

type CustomerPageProps = {
  accounts: Account[];
  currentEmployeeId?: string;
  onStartChat?: (input: {
    seatId: string;
    thirdExternalUserId: string;
    customerName: string;
    customerAvatar: string;
    realName: string;
  }) => void | Promise<void>;
};

export function CustomerPage({
  accounts,
  currentEmployeeId,
  onStartChat,
}: CustomerPageProps) {
  const [scope, setScope] = useState<CustomerScope>("mine");
  const [selectedSeatId, setSelectedSeatId] = useState(ALL_VISIBLE_SEATS);
  const [keywordInput, setKeywordInput] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [customers, setCustomers] = useState<WorkbenchCustomerSummaryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [nextCursor, setNextCursor] = useState<string>();
  const [hasMore, setHasMore] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const trimmedKeyword = submittedKeyword.trim();
    const shouldSkipList =
      scope === "mine" &&
      selectedSeatId === ALL_VISIBLE_SEATS &&
      trimmedKeyword.length === 0;

    if (shouldSkipList) {
      setCustomers([]);
      setErrorMessage(undefined);
      setHasMore(false);
      setIsLoading(false);
      setNextCursor(undefined);

      return () => {
        isMounted = false;
      };
    }

    async function loadCustomers() {
      setIsLoading(true);
      setErrorMessage(undefined);

      try {
        const response = await getWorkbenchService().getCustomers({
          ...(trimmedKeyword ? { keyword: trimmedKeyword } : {}),
          limit: CUSTOMER_PAGE_SIZE,
          scope,
          seatIds:
            scope === "mine" && selectedSeatId !== ALL_VISIBLE_SEATS
              ? [selectedSeatId]
              : undefined,
        });

        if (!isMounted) {
          return;
        }

        setCustomers(response.items);
        setHasMore(response.hasMore);
        setNextCursor(response.nextCursor);
      } catch (error) {
        if (isMounted) {
          setCustomers([]);
          setErrorMessage(error instanceof Error ? error.message : "客户列表加载失败");
          setHasMore(false);
          setNextCursor(undefined);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCustomers();

    return () => {
      isMounted = false;
    };
  }, [scope, selectedSeatId, submittedKeyword]);

  function submitSearch() {
    setSubmittedKeyword(keywordInput.trim());
  }

  async function loadMoreCustomers() {
    if (!nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    setErrorMessage(undefined);

    try {
      const trimmedKeyword = submittedKeyword.trim();
      const response = await getWorkbenchService().getCustomers({
        cursor: nextCursor,
        ...(trimmedKeyword ? { keyword: trimmedKeyword } : {}),
        limit: CUSTOMER_PAGE_SIZE,
        scope,
        seatIds:
          scope === "mine" && selectedSeatId !== ALL_VISIBLE_SEATS
            ? [selectedSeatId]
            : undefined,
      });

      if (!isMountedRef.current) {
        return;
      }

      setCustomers((currentCustomers) => [...currentCustomers, ...response.items]);
      setHasMore(response.hasMore);
      setNextCursor(response.nextCursor);
    } catch (error) {
      if (isMountedRef.current) {
        toast.error(error instanceof Error ? error.message : "加载更多客户失败");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingMore(false);
      }
    }
  }

  return (
    <>
      <main className="h-full min-h-0 overflow-hidden bg-surface">
        <div className="h-full min-h-0">
          <section className="mx-auto flex h-full min-h-0 w-full max-w-[1180px] flex-col">
            <div className="shrink-0 px-8 py-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold leading-tight text-foreground">
                    客户
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {scope === "mine" ? "按可见席位查看负责客户" : "浏览租户客户库"}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Tabs
                  onValueChange={(value) => {
                    setScope(value as CustomerScope);
                    setSelectedSeatId(ALL_VISIBLE_SEATS);
                  }}
                  value={scope}
                >
                  <TabsList className="h-9 rounded-[10px]">
                    <TabsTrigger className="h-7 rounded-[8px]" value="mine">
                      我的客户
                    </TabsTrigger>
                    <TabsTrigger className="h-7 rounded-[8px]" value="all">
                      全部客户
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-3">
                {scope === "mine" ? (
                  <div className="flex items-center gap-2">
                    <Label className="sr-only" htmlFor="customer-seat-filter">
                      席位筛选
                    </Label>
                    <Select
                      onValueChange={setSelectedSeatId}
                      value={selectedSeatId}
                    >
                      <SelectTrigger
                        aria-label="席位筛选"
                        className="h-9 min-w-40"
                        id="customer-seat-filter"
                      >
                        <SelectValue placeholder="全部托管账号" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VISIBLE_SEATS}>
                          全部托管账号
                        </SelectItem>
                        {accounts.map((seat) => (
                          <SelectItem key={seat.id} value={seat.id}>
                            {seat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="relative w-full max-w-[320px]">
                  <HugeiconsIcon
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    color="currentColor"
                    icon={Search01Icon}
                    size={16}
                  />
                  <Input
                    aria-label="搜索客户"
                    className="h-9 pl-9"
                    onChange={(event) => setKeywordInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        submitSearch();
                      }
                    }}
                    placeholder="搜索客户名称、实名"
                    value={keywordInput}
                  />
                </div>
                <Button className="h-9" onClick={submitSearch} type="button">
                  查询
                </Button>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="px-8">
                {isLoading ? (
                  <LoadingState />
                ) : errorMessage ? (
                  <StatusRow icon={AlertCircleIcon} text={errorMessage} />
                ) : shouldShowAllManagedAccountPrompt(
                  scope,
                  selectedSeatId,
                  submittedKeyword,
                ) ? (
                  <StatusRow
                    icon={UserMultiple02Icon}
                    text="搜索 或 选择一个托管账号来查看客户"
                  />
                ) : customers.length === 0 ? (
                  <StatusRow icon={UserMultiple02Icon} text="暂无客户" />
                ) : (
                  <>
                    <Table aria-label="客户列表" className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[32%] px-6">客户</TableHead>
                          <TableHead className="w-[30%] px-4">
                            最近会话时间
                          </TableHead>
                          <TableHead className="w-[24%] px-4">好友关系</TableHead>
                          <TableHead className="w-[14%] px-4">状态</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customers.map((customer) => (
                          <CustomerTableRow
                            accounts={accounts}
                            customer={customer}
                            currentEmployeeId={currentEmployeeId}
                            key={customer.customerKey}
                            onStartChat={onStartChat}
                          />
                        ))}
                      </TableBody>
                    </Table>
                    {hasMore ? (
                      <div className="flex justify-center py-5">
                        <Button
                          disabled={isLoadingMore}
                          onClick={loadMoreCustomers}
                          size="sm"
                          variant="outline"
                        >
                          {isLoadingMore ? (
                            <Spinner variant="classic" size={14} className="text-current" />
                          ) : null}
                          加载更多客户
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </ScrollArea>
          </section>
        </div>
      </main>
    </>
  );
}

function shouldShowAllManagedAccountPrompt(
  scope: CustomerScope,
  selectedSeatId: string,
  keyword: string,
) {
  return (
    scope === "mine" &&
    selectedSeatId === ALL_VISIBLE_SEATS &&
    keyword.trim().length === 0
  );
}

function CustomerTableRow({
  accounts,
  customer,
  currentEmployeeId,
  onStartChat,
}: {
  accounts: Account[];
  customer: WorkbenchCustomerSummaryDto;
  currentEmployeeId?: string;
  onStartChat?: CustomerPageProps["onStartChat"];
}) {
  const displayName = getCustomerDisplayName(customer);

  return (
    <TableRow>
      <TableCell className="px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <CustomerAvatar customer={customer} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {displayName}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4 py-4">
        <CustomerLastConversationPopover
          accounts={accounts}
          customer={customer}
          currentEmployeeId={currentEmployeeId}
          onStartChat={onStartChat}
        />
      </TableCell>
      <TableCell className="px-4 py-4">
        <CustomerSeatRelationsPopover
          accounts={accounts}
          customer={customer}
          currentEmployeeId={currentEmployeeId}
          onStartChat={onStartChat}
        />
      </TableCell>
      <TableCell className="px-4 py-4">
        <Badge variant={customer.bizStatus === 1 ? "secondary" : "outline"}>
          {customer.bizStatus === 1 ? "正常" : "异常"}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function CustomerAvatar({
  customer,
  size = "md",
}: {
  customer: WorkbenchCustomerSummaryDto;
  size?: "lg" | "md";
}) {
  const displayName = getCustomerDisplayName(customer);

  return (
    <Avatar
      className={cn(
        "shrink-0 rounded-[8px] bg-surface-muted",
        size === "lg" ? "size-12" : "size-10",
      )}
    >
      {customer.avatar ? (
        <AvatarImage
          alt={`${displayName}头像`}
          className="rounded-[inherit] object-cover"
          src={customer.avatar}
        />
      ) : null}
      <AvatarFallback
        className="rounded-[inherit] bg-primary/12 text-primary"
        data-testid="customer-avatar-fallback"
      >
        <HugeiconsIcon
          aria-hidden="true"
          color="currentColor"
          icon={Male02Icon}
          size={18}
          strokeWidth={1.8}
        />
      </AvatarFallback>
    </Avatar>
  );
}

function CustomerLastConversationPopover({
  accounts,
  customer,
  currentEmployeeId,
  onStartChat,
}: {
  accounts: Account[];
  customer: WorkbenchCustomerSummaryDto;
  currentEmployeeId?: string;
  onStartChat?: CustomerPageProps["onStartChat"];
}) {
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const [isOpen, setIsOpen] = useState(false);
  const [lastConversation, setLastConversation] = useState<
    WorkbenchCustomerLastConversationDto | undefined
  >(customer.lastConversation);
  const [messages, setMessages] = useState<Message[]>([]);
  const [previewStatus, setPreviewStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [refreshStatus, setRefreshStatus] = useState<
    "idle" | "loading" | "empty" | "error"
  >("idle");
  const displayName = getCustomerDisplayName(customer);
  const account = lastConversation
    ? accounts.find((item) => item.id === lastConversation.seatId)
    : undefined;
  const canContinueChat = canStartSeatChat(account, currentEmployeeId);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setLastConversation(customer.lastConversation);
    setMessages([]);
    setPreviewStatus("idle");
    setRefreshStatus("idle");
  }, [customer.customerKey, customer.lastConversation]);

  if (!lastConversation && refreshStatus === "empty") {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  if (!lastConversation) {
    return (
      <Button
        aria-label={`刷新 ${displayName} 的最近会话时间`}
        className="h-8 gap-2 px-2 text-xs font-normal"
        disabled={refreshStatus === "loading"}
        onClick={() => {
          setRefreshStatus("loading");
          void getWorkbenchService()
            .getCustomerLastConversation(customer.thirdExternalUserId)
            .then((response) => {
              if (!isMountedRef.current) {
                return;
              }

              setLastConversation(response.lastConversation);
              setMessages([]);
              setPreviewStatus("idle");
              setRefreshStatus(response.lastConversation ? "idle" : "empty");
            })
            .catch(() => {
              if (isMountedRef.current) {
                setRefreshStatus("error");
              }
            });
        }}
        type="button"
        variant="ghost"
      >
        {refreshStatus === "loading" ? (
          <Spinner variant="classic" size={14} className="text-current" />
        ) : (
          <HugeiconsIcon
            color="currentColor"
            icon={Refresh03Icon}
            size={14}
          />
        )}
        {refreshStatus === "error" ? "重试" : "获取"}
      </Button>
    );
  }

  function openPopover() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsOpen(true);

    if ((previewStatus !== "idle" && previewStatus !== "error") || !lastConversation) {
      return;
    }

    setPreviewStatus("loading");
    void getWorkbenchService()
      .getMessages(lastConversation.conversationId, {
        limit: RECENT_MESSAGE_PREVIEW_LIMIT,
      })
      .then((page) => {
        if (!isMountedRef.current) {
          return;
        }

        const accountsById = Object.fromEntries(
          accounts.map((item) => [item.id, item]),
        );
        setMessages(
          page.messages.map((message) =>
            adaptMessage(
              message,
              {
                [customer.customerKey]: {
                  avatarUrl: customer.avatar,
                  city: "",
                  id: customer.customerKey,
                  intentScore: 0,
                  metrics: [],
                  name: displayName,
                  notes: [],
                  persona: "",
                  phone: "",
                  stage: "",
                  tags: [],
                  tasks: [],
                },
              },
              accountsById,
            ),
          ),
        );
        setPreviewStatus("loaded");
      })
      .catch(() => {
        if (isMountedRef.current) {
          setMessages([]);
          setPreviewStatus("error");
        }
      });
  }

  function scheduleClosePopover() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setIsOpen(false);
      }
    }, 120);
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={`查看 ${displayName} 的最近会话记录`}
          className="h-8 justify-start gap-2 px-0 text-sm font-normal hover:bg-transparent"
          onBlur={scheduleClosePopover}
          onClick={(event) => event.preventDefault()}
          onFocus={openPopover}
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClosePopover}
          type="button"
          variant="ghost"
        >
          <SeatConversationAvatar
            avatarUrl={lastConversation.seatAvatar || account?.avatarUrl || ""}
            name={lastConversation.seatName || account?.name || ""}
          />
          <span>{formatCustomerTimestamp(lastConversation.lastMessageTime)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[25rem] p-3"
        onBlur={scheduleClosePopover}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onFocus={openPopover}
        onMouseEnter={openPopover}
        onMouseLeave={scheduleClosePopover}
      >
        <div className="space-y-3">
          <p className="px-1 text-sm font-medium text-foreground">最近会话</p>

          <div className="max-h-[20rem] overflow-y-auto rounded-[8px] bg-muted/50 p-3">
            {previewStatus === "loading" ? (
              <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
                <DotMatrixLoader
                  ariaLabel="正在加载最近会话"
                  className="text-foreground"
                  dotSize={3}
                  size={20}
                />
                <span>正在加载最近会话</span>
              </div>
            ) : previewStatus === "error" ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                最近会话加载失败
              </p>
            ) : messages.length > 0 ? (
              <HistoryCompactMessageList messages={messages} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                暂无最近消息
              </p>
            )}
          </div>

          <Button
            className="w-full"
            disabled={!canContinueChat}
            onClick={() => {
              if (!canContinueChat) {
                return;
              }

              void onStartChat?.({
                customerAvatar: customer.avatar,
                customerName: customer.name,
                realName: customer.realName,
                seatId: lastConversation.seatId,
                thirdExternalUserId: customer.thirdExternalUserId,
              });
            }}
            type="button"
          >
            <HugeiconsIcon color="currentColor" icon={Chat01Icon} size={14} />
            继续聊天
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SeatConversationAvatar({
  avatarUrl,
  name,
}: {
  avatarUrl: string;
  name: string;
}) {
  const displayName = name || "托";

  return (
    <Avatar className="size-7 rounded-full border border-surface">
      {avatarUrl ? <AvatarImage alt={`${displayName}头像`} src={avatarUrl} /> : null}
      <AvatarFallback className="rounded-full bg-primary/15 text-xs text-primary">
        <HugeiconsIcon color="currentColor" icon={Male02Icon} size={14} />
      </AvatarFallback>
    </Avatar>
  );
}

function CustomerSeatRelationsPopover({
  accounts,
  customer,
  currentEmployeeId,
  onStartChat,
}: {
  accounts: Account[];
  customer: WorkbenchCustomerSummaryDto;
  currentEmployeeId?: string;
  onStartChat?: CustomerPageProps["onStartChat"];
}) {
  const isMountedRef = useRef(true);
  const [isOpen, setIsOpen] = useState(false);
  const [conversationTimes, setConversationTimes] = useState<Record<string, number>>({});
  const [conversationStatus, setConversationStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const relations = customer.seatRelations;
  const visibleRelations = relations.slice(0, 3);
  const hiddenCount = Math.max(relations.length - visibleRelations.length, 0);
  const customerName = getCustomerDisplayName(customer);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setConversationTimes({});
    setConversationStatus("idle");
  }, [customer.customerKey]);

  if (relations.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  function loadRelationConversations() {
    if (conversationStatus !== "idle" && conversationStatus !== "error") {
      return;
    }

    const thirdUserIds = uniqueStrings(relations.map((relation) => relation.thirdUserId));
    if (thirdUserIds.length === 0) {
      setConversationStatus("loaded");
      return;
    }

    setConversationStatus("loading");
    void getWorkbenchService()
      .getCustomerRelationConversations(customer.thirdExternalUserId, thirdUserIds)
      .then((response) => {
        if (!isMountedRef.current) {
          return;
        }

        setConversationTimes(
          Object.fromEntries(
            response.items.map((item) => [item.thirdUserId, item.lastMessageTime]),
          ),
        );
        setConversationStatus("loaded");
      })
      .catch(() => {
        if (isMountedRef.current) {
          setConversationTimes({});
          setConversationStatus("error");
        }
      });
  }

  return (
    <HoverCard
      closeDelay={120}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          loadRelationConversations();
        }
      }}
      open={isOpen}
      openDelay={300}
    >
      <HoverCardTrigger asChild>
        <Button
          aria-label={`查看 ${customerName} 的好友关系`}
          className="h-8 justify-start rounded-full p-0 hover:bg-transparent"
          type="button"
          variant="ghost"
        >
          <span className="flex items-center">
            {visibleRelations.map((relation, index) => (
              <SeatRelationAvatar
                account={accounts.find((account) => account.id === relation.seatId)}
                className={index === 0 ? undefined : "-ml-2"}
                key={relation.bindId}
                relation={relation}
              />
            ))}
            {hiddenCount > 0 ? (
              <span className="-ml-2 flex size-8 items-center justify-center rounded-full border-2 border-surface bg-muted text-xs font-semibold text-muted-foreground">
                +{hiddenCount}
              </span>
            ) : null}
          </span>
        </Button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-[22rem] rounded-[12px] border-border p-3 shadow-[0_12px_30px_var(--shadow-medium)]"
      >
        <div className="space-y-3">
          <p className="px-2.5 text-sm font-medium text-foreground">
            好友关系 · {relations.length}
          </p>
          <ScrollArea className="max-h-[16rem]">
            <div className="space-y-1 pr-2">
              {relations.map((relation) => {
                const account = accounts.find((item) => item.id === relation.seatId);
                const seatName = getSeatRelationName(relation);
                const canStartChat = canStartSeatChat(account, currentEmployeeId);
                const relationConversationTime =
                  conversationTimes[relation.thirdUserId] ?? relation.lastMessageTime;
                const hasRecentConversation = relationConversationTime != null;
                const actionText = hasRecentConversation ? "继续会话" : "发起会话";

                return (
                  <div
                    className="flex min-h-12 items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-sm text-foreground"
                    key={relation.bindId}
                  >
                    <SeatRelationAvatar account={account} relation={relation} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{seatName}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {conversationStatus === "loading"
                          ? "加载中"
                          : conversationStatus === "error"
                            ? "加载失败"
                            : hasRecentConversation
                              ? formatCustomerTimestamp(relationConversationTime)
                              : "暂无会话"}
                      </div>
                    </div>
                    <Button
                      aria-label={
                        canStartChat
                          ? `向 ${seatName} ${actionText}`
                          : `${seatName} 不可${actionText}`
                      }
                      disabled={!canStartChat}
                      onClick={() => {
                        void onStartChat?.({
                          customerAvatar: customer.avatar,
                          customerName: customer.name,
                          realName: customer.realName,
                          seatId: relation.seatId,
                          thirdExternalUserId: customer.thirdExternalUserId,
                        });
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <HugeiconsIcon color="currentColor" icon={Chat01Icon} size={14} />
                      {actionText}
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function SeatRelationAvatar({
  account,
  className,
  relation,
}: {
  account?: Account;
  className?: string;
  relation: WorkbenchCustomerSeatRelationDto;
}) {
  const seatName = getSeatRelationName(relation);
  const avatarUrl = relation.seatAvatar || account?.avatarUrl || "";

  return (
    <Avatar
      aria-label={`关联托管账号 ${seatName}`}
      className={cn("size-8 rounded-full border-2 border-surface", className)}
      title={seatName}
    >
      {avatarUrl ? <AvatarImage alt={`${seatName}头像`} src={avatarUrl} /> : null}
      <AvatarFallback className="rounded-full bg-primary/15 text-xs text-primary">
        <HugeiconsIcon color="currentColor" icon={Male02Icon} size={16} />
      </AvatarFallback>
    </Avatar>
  );
}

function getSeatRelationName(relation: WorkbenchCustomerSeatRelationDto) {
  return relation.seatName || relation.thirdUserId || relation.seatId;
}

function canStartSeatChat(account: Account | undefined, currentEmployeeId: string | undefined) {
  return (
    account?.loginStatus === "online" &&
    !!account?.takenOverEmployeeId &&
    account?.takenOverEmployeeId === currentEmployeeId
  );
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function LoadingState() {
  return (
    <div
      aria-label="正在加载客户"
      className="flex min-h-[220px] items-center justify-center gap-3 text-sm text-muted-foreground"
      role="status"
    >
      <DotMatrixLoader
        ariaLabel="正在加载"
        className="text-foreground"
        dotSize={3}
        size={22}
      />
      <span>正在加载客户</span>
    </div>
  );
}

function StatusRow({
  icon,
  text,
}: {
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
  text: string;
}) {
  return (
    <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
      <HugeiconsIcon color="currentColor" icon={icon} size={16} />
      <span>{text}</span>
    </div>
  );
}

function getCustomerDisplayName(customer: WorkbenchCustomerSummaryDto) {
  const rawName = customer.name ?? "";
  const name = rawName.trim() || "未知客户";
  const realName = (customer.realName ?? "").trim();

  if (name !== "未知客户" && realName && name !== realName) {
    return `${name}（${realName}）`;
  }

  return name;
}

function formatCustomerTimestamp(value?: number) {
  if (!value || !Number.isFinite(value)) {
    return "-";
  }

  try {
    return formatMessageDividerLabel(new Date(value).toISOString()) || "-";
  } catch {
    return "-";
  }
}
