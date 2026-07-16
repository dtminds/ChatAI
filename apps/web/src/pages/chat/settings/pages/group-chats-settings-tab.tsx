import { MoreHorizontalIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  SettingsGroupChat,
  SettingsGroupChatReceptionManagedAccount,
  SettingsGroupChatsResponse,
} from "@chatai/contracts";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listGroupChatReceptionOptions,
  listGroupChats,
  updateGroupChatReception,
} from "@/pages/chat/settings/settings-service";
import {
  GroupChatReceptionSettingsDialog,
  type GroupChatReceptionDialogState,
} from "@/pages/chat/settings/pages/group-chat-reception-settings-dialog";
import { useSettingsPermissions } from "@/pages/chat/settings/use-settings-permissions";
import { cn } from "@/lib/utils";

const emptyData: SettingsGroupChatsResponse = {
  filterManagedAccounts: [],
  groupChats: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
};

const allManagedAccountsFilterValue = "all";
const groupChatPageSizeOptions = [10, 20, 50] as const;

export function GroupChatsSettingsTab({ toolbarStart }: { toolbarStart?: ReactNode }) {
  const { canManageManagedAccounts } = useSettingsPermissions();
  const [data, setData] = useState<SettingsGroupChatsResponse>(emptyData);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [managedAccountFilter, setManagedAccountFilter] = useState(allManagedAccountsFilterValue);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(groupChatPageSizeOptions[0]);
  const [selectedGroupChats, setSelectedGroupChats] = useState<SettingsGroupChat[]>([]);
  const [dialogState, setDialogState] = useState<GroupChatReceptionDialogState | null>(null);
  const receptionOptionsRequestIdRef = useRef(0);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await listGroupChats({
          keyword: keyword.trim() || undefined,
          managedAccountId:
            managedAccountFilter === allManagedAccountsFilterValue
              ? undefined
              : managedAccountFilter,
          page,
          pageSize,
        });

        if (!ignore) {
          setData(response);
          if (response.page !== page) {
            setPage(response.page);
          }
          setSelectedGroupChats((current) => {
            const selectedIds = new Set(current.map((groupChat) => groupChat.id));

            return response.groupChats.filter((groupChat) => selectedIds.has(groupChat.id));
          });
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, [keyword, managedAccountFilter, page, pageSize]);

  const selectedGroupChatIdSet = useMemo(
    () => new Set(selectedGroupChats.map((groupChat) => groupChat.id)),
    [selectedGroupChats],
  );
  const visibleGroupChatIds = data.groupChats.map((groupChat) => groupChat.id);
  const allVisibleSelected =
    visibleGroupChatIds.length > 0 &&
    visibleGroupChatIds.every((groupChatId) => selectedGroupChatIdSet.has(groupChatId));
  const someVisibleSelected =
    visibleGroupChatIds.some((groupChatId) => selectedGroupChatIdSet.has(groupChatId)) &&
    !allVisibleSelected;

  function toggleGroupChatSelection(groupChatId: string) {
    const groupChat = data.groupChats.find((item) => item.id === groupChatId);

    if (!groupChat) {
      return;
    }

    setSelectedGroupChats((current) =>
      current.some((item) => item.id === groupChatId)
        ? current.filter((item) => item.id !== groupChatId)
        : [...current, groupChat],
    );
  }

  function toggleVisibleSelection(checked: boolean) {
    setSelectedGroupChats(checked ? data.groupChats : []);
  }

  async function openReceptionDialog(groupChats: SettingsGroupChat[]) {
    if (groupChats.length === 0) {
      return;
    }

    const requestId = receptionOptionsRequestIdRef.current + 1;
    receptionOptionsRequestIdRef.current = requestId;
    setDialogState({
      availableManagedAccounts: [],
      groupChats,
      isLoadingOptions: true,
      optionsError: "",
    });

    try {
      const response = await listGroupChatReceptionOptions({
        groupChatIds: groupChats.map((groupChat) => groupChat.id),
      });

      if (receptionOptionsRequestIdRef.current === requestId) {
        setDialogState({
          availableManagedAccounts: response.availableManagedAccounts,
          groupChats,
          isLoadingOptions: false,
          optionsError: "",
        });
      }
    } catch (error) {
      if (receptionOptionsRequestIdRef.current === requestId) {
        setDialogState({
          availableManagedAccounts: [],
          groupChats,
          isLoadingOptions: false,
          optionsError: getErrorMessage(error),
        });
      }
    }
  }

  async function handleSaveReception(
    groupChatIds: string[],
    hostUserSeatIds: string[],
    onProgress: (progress: { completed: number; total: number }) => void,
  ) {
    let completed = 0;

    for (const groupChatId of groupChatIds) {
      try {
        await updateGroupChatReception({
          groupChatId,
          hostUserSeatIds,
        });
      } catch (error) {
        throw new Error(
          completed > 0
            ? `已完成 ${completed}/${groupChatIds.length} 个群聊，${getErrorMessage(error)}，可重试`
            : getErrorMessage(error),
        );
      }

      completed += 1;
      onProgress({ completed, total: groupChatIds.length });
    }

    try {
      const response = await listGroupChats({
        keyword: keyword.trim() || undefined,
        managedAccountId:
          managedAccountFilter === allManagedAccountsFilterValue
            ? undefined
            : managedAccountFilter,
        page,
        pageSize,
      });
      setData(response);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
    setSelectedGroupChats([]);
  }

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {toolbarStart}
          <div className="relative w-[280px]">
            <HugeiconsIcon
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              color="currentColor"
              icon={Search01Icon}
              size={17}
              strokeWidth={1.8}
            />
            <Input
              aria-label="搜索群聊"
              className="h-10 rounded-[8px] pl-9"
              onChange={(event) => {
                setKeyword(event.target.value);
                setPage(1);
                setSelectedGroupChats([]);
              }}
              placeholder="搜索群聊"
              value={keyword}
            />
          </div>

          <Select
            onValueChange={(value) => {
              setManagedAccountFilter(value);
              setPage(1);
              setSelectedGroupChats([]);
            }}
            value={managedAccountFilter}
          >
            <SelectTrigger aria-label="筛选开通企微号" className="h-10 w-[220px] rounded-[8px]">
              <SelectValue placeholder="筛选开通企微号" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allManagedAccountsFilterValue}>全部企微号</SelectItem>
              {data.filterManagedAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          className="h-10 rounded-[8px] px-4"
          disabled={!canManageManagedAccounts || selectedGroupChats.length === 0}
          onClick={() => void openReceptionDialog(selectedGroupChats)}
          type="button"
          variant="outline"
        >
          批量设置
        </Button>
      </section>

      {errorMessage ? (
        <section className="mt-6 rounded-[10px] border border-destructive/30 bg-destructive-muted p-5 text-sm text-destructive">
          {errorMessage}
        </section>
      ) : (
        <section className="mt-6 overflow-hidden rounded-[10px] border border-border">
          <Table aria-label="开通群聊列表">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[4%] px-5 py-4">
                  <Checkbox
                    aria-label="全选当前页群聊"
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    disabled={isLoading || data.groupChats.length === 0}
                    onCheckedChange={(checked) => toggleVisibleSelection(checked === true)}
                  />
                </TableHead>
                <TableHead className="w-[36%] px-5 py-4">群聊</TableHead>
                <TableHead className="w-[30%] px-5 py-4">开通企微号</TableHead>
                <TableHead className="w-[22%] px-5 py-4">可接待企微号</TableHead>
                <TableHead className="px-5 py-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell className="px-5 py-10" colSpan={5}>
                    <div
                      aria-label="正在加载"
                      className="flex items-center justify-center gap-3 text-sm text-muted-foreground"
                      role="status"
                    >
                      <Spinner aria-hidden="true" size={16} />
                      <span>正在加载</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : data.groupChats.length > 0 ? (
                data.groupChats.map((groupChat) => (
                  <GroupChatRow
                    canManage={canManageManagedAccounts}
                    groupChat={groupChat}
                    isSelected={selectedGroupChatIdSet.has(groupChat.id)}
                    key={groupChat.id}
                    onConfigure={() => void openReceptionDialog([groupChat])}
                    onToggleSelection={() => toggleGroupChatSelection(groupChat.id)}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell className="px-5 py-8 text-sm text-muted-foreground" colSpan={5}>
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      )}

      {!isLoading ? (
        <TablePagination
          className="mt-4 border-t-0 py-0"
          onPageChange={(nextPage) => {
            setSelectedGroupChats([]);
            setPage(nextPage);
          }}
          onPageSizeChange={(nextPageSize) => {
            setPage(1);
            setPageSize(nextPageSize);
            setSelectedGroupChats([]);
          }}
          page={data.page}
          pageSize={data.pageSize}
          pageSizeOptions={groupChatPageSizeOptions}
          total={data.total}
          totalPages={data.totalPages}
        />
      ) : null}

      <GroupChatReceptionSettingsDialog
        onOpenChange={(open) => {
          if (!open) {
            receptionOptionsRequestIdRef.current += 1;
            setDialogState(null);
          }
        }}
        onSave={handleSaveReception}
        open={!!dialogState}
        state={dialogState}
      />
    </>
  );
}

function GroupChatRow({
  canManage,
  groupChat,
  isSelected,
  onConfigure,
  onToggleSelection,
}: {
  canManage: boolean;
  groupChat: SettingsGroupChat;
  isSelected: boolean;
  onConfigure: () => void;
  onToggleSelection: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="px-5 py-5">
        <Checkbox
          aria-label={`选择 ${groupChat.name}`}
          checked={isSelected}
          onCheckedChange={() => onToggleSelection()}
        />
      </TableCell>
      <TableCell className="px-5 py-5">
        <div className="flex min-w-0 items-center gap-2">
          <GroupChatAvatar groupChat={groupChat} />
          <p className="truncate font-medium text-foreground">{groupChat.name}</p>
        </div>
      </TableCell>
      <TableCell className="px-5 py-5">
        <div className="flex min-w-0 items-center gap-2">
          <ManagedAccountAvatar
            avatarUrl={groupChat.openingManagedAccount.avatarUrl}
            name={groupChat.openingManagedAccount.name}
          />
          <p className="truncate text-sm text-foreground">
            {groupChat.openingManagedAccount.name}
          </p>
        </div>
      </TableCell>
      <TableCell className="px-5 py-5">
        <ReceptionManagedAccountsCell accounts={groupChat.receptionManagedAccounts} />
      </TableCell>
      <TableCell className="px-5 py-5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`打开 ${groupChat.name} 操作菜单`}
              className="size-8 rounded-[8px]"
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={MoreHorizontalIcon}
                size={16}
                strokeWidth={1.8}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[116px]">
            <DropdownMenuItem disabled={!canManage} onSelect={onConfigure}>
              接待账号设置
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                void copyGroupChatId(groupChat.thirdGroupId);
              }}
            >
              复制群聊ID
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function ReceptionManagedAccountsCell({
  accounts,
}: {
  accounts: SettingsGroupChatReceptionManagedAccount[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  if (accounts.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  function openPopover() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setIsOpen(true);
  }

  function scheduleClosePopover() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 120);
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`查看可接待企微号 ${accounts.length} 个`}
          className="inline-flex max-w-full rounded-[8px] p-0.5 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
          onBlur={scheduleClosePopover}
          onFocus={openPopover}
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClosePopover}
          type="button"
        >
          <span aria-hidden="true" className="flex items-center">
            {accounts.map((account, index) => (
              <ManagedAccountAvatar
                avatarUrl={account.avatarUrl}
                className={index === 0 ? undefined : "-ml-2"}
                key={account.id}
                name={account.name}
              />
            ))}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[16rem] p-3"
        onBlur={scheduleClosePopover}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onFocus={openPopover}
        onMouseEnter={openPopover}
        onMouseLeave={scheduleClosePopover}
      >
        <div className="space-y-2">
          <p className="px-1 text-sm font-medium text-foreground">
            可接待企微号 · {accounts.length}
          </p>
          <div className="space-y-1">
            {accounts.map((account) => (
              <div
                className="flex h-9 items-center gap-2 rounded-[8px] px-1 text-sm text-foreground"
                key={account.id}
              >
                <ManagedAccountAvatar avatarUrl={account.avatarUrl} name={account.name} />
                <span className="truncate">{account.name}</span>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GroupChatAvatar({ groupChat }: { groupChat: SettingsGroupChat }) {
  return (
    <Avatar
      aria-label={`群聊 ${groupChat.name}`}
      className="size-8 rounded-[8px] border border-border"
      title={groupChat.name}
    >
      {groupChat.avatarUrl ? (
        <AvatarImage alt={groupChat.name} className="rounded-[8px]" src={groupChat.avatarUrl} />
      ) : null}
      <AvatarFallback className="rounded-[8px] bg-muted text-xs text-muted-foreground">
        {getInitial(groupChat.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function ManagedAccountAvatar({
  avatarUrl,
  className,
  name,
}: {
  avatarUrl: string;
  className?: string;
  name: string;
}) {
  return (
    <Avatar
      aria-label={`企微账号 ${name}`}
      className={cn("size-8 rounded-full border-2 border-surface", className)}
      title={name}
    >
      {avatarUrl ? <AvatarImage alt={name} src={avatarUrl} /> : null}
      <AvatarFallback className="rounded-full bg-primary/15 text-xs text-primary">
        {getInitial(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function getInitial(name: string) {
  return name.trim().slice(0, 1) || "?";
}

async function copyGroupChatId(groupChatId: string) {
  if (!groupChatId || !navigator.clipboard) {
    toast.warning("复制失败，请稍后重试");
    return;
  }

  try {
    await navigator.clipboard.writeText(groupChatId);
    toast.success("已复制群聊ID");
  } catch {
    toast.warning("复制失败，请稍后重试");
  }
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "操作失败，请稍后重试";
}
