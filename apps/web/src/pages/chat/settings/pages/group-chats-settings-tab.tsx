import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  SettingsGroupChat,
  SettingsGroupChatReceptionManagedAccount,
  SettingsGroupChatsResponse,
} from "@chatai/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
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
import { listGroupChats } from "@/pages/chat/settings/settings-service";
import {
  GroupChatReceptionSettingsDialog,
  type GroupChatReceptionManagedAccountOption,
  type GroupChatReceptionDialogState,
} from "@/pages/chat/settings/pages/group-chat-reception-settings-dialog";
import {
  SettingsPagination,
  useSettingsLocalPagination,
} from "@/pages/chat/settings/shared";
import { useSettingsPermissions } from "@/pages/chat/settings/use-settings-permissions";
import { cn } from "@/lib/utils";

const emptyData: SettingsGroupChatsResponse = {
  filterManagedAccounts: [],
  groupChats: [],
};

const allManagedAccountsFilterValue = "all";

export function GroupChatsSettingsTab() {
  const { canManageManagedAccounts } = useSettingsPermissions();
  const [data, setData] = useState<SettingsGroupChatsResponse>(emptyData);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [managedAccountFilter, setManagedAccountFilter] = useState(allManagedAccountsFilterValue);
  const [selectedGroupChatIds, setSelectedGroupChatIds] = useState<string[]>([]);
  const [dialogState, setDialogState] = useState<GroupChatReceptionDialogState | null>(null);

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
        });

        if (!ignore) {
          setData(response);
          setSelectedGroupChatIds((current) =>
            current.filter((groupChatId) =>
              response.groupChats.some((groupChat) => groupChat.id === groupChatId),
            ),
          );
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
  }, [keyword, managedAccountFilter]);

  const availableManagedAccounts = useMemo(
    () => buildAvailableManagedAccounts(data.filterManagedAccounts, data.groupChats),
    [data.filterManagedAccounts, data.groupChats],
  );
  const {
    currentPage,
    pagedItems: pagedGroupChats,
    resetPage,
    setPage,
    totalPages,
  } = useSettingsLocalPagination(data.groupChats);
  const selectedGroupChatIdSet = useMemo(
    () => new Set(selectedGroupChatIds),
    [selectedGroupChatIds],
  );
  const visibleGroupChatIds = pagedGroupChats.map((groupChat) => groupChat.id);
  const allVisibleSelected =
    visibleGroupChatIds.length > 0 &&
    visibleGroupChatIds.every((groupChatId) => selectedGroupChatIdSet.has(groupChatId));
  const someVisibleSelected =
    visibleGroupChatIds.some((groupChatId) => selectedGroupChatIdSet.has(groupChatId)) &&
    !allVisibleSelected;

  function toggleGroupChatSelection(groupChatId: string) {
    setSelectedGroupChatIds((current) =>
      current.includes(groupChatId)
        ? current.filter((id) => id !== groupChatId)
        : [...current, groupChatId],
    );
  }

  function toggleVisibleSelection(checked: boolean) {
    setSelectedGroupChatIds((current) => {
      const next = new Set(current);

      for (const groupChatId of visibleGroupChatIds) {
        if (checked) {
          next.add(groupChatId);
        } else {
          next.delete(groupChatId);
        }
      }

      return [...next];
    });
  }

  function openReceptionDialog(groupChats: SettingsGroupChat[]) {
    if (groupChats.length === 0) {
      return;
    }

    setDialogState({
      availableManagedAccounts,
      groupChats,
    });
  }

  const selectedGroupChats = data.groupChats.filter((groupChat) =>
    selectedGroupChatIdSet.has(groupChat.id),
  );

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
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
                resetPage();
              }}
              placeholder="搜索群聊"
              value={keyword}
            />
          </div>

          <Select
            onValueChange={(value) => {
              setManagedAccountFilter(value);
              resetPage();
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
          onClick={() => openReceptionDialog(selectedGroupChats)}
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
                    disabled={isLoading || pagedGroupChats.length === 0}
                    onCheckedChange={(checked) => toggleVisibleSelection(checked === true)}
                  />
                </TableHead>
                <TableHead className="w-[28%] px-5 py-4">群聊</TableHead>
                <TableHead className="w-[24%] px-5 py-4">群ID</TableHead>
                <TableHead className="w-[24%] px-5 py-4">开通企微号</TableHead>
                <TableHead className="w-[12%] px-5 py-4">可接待企微号</TableHead>
                <TableHead className="px-5 py-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell className="px-5 py-10" colSpan={6}>
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
              ) : pagedGroupChats.length > 0 ? (
                pagedGroupChats.map((groupChat) => (
                  <GroupChatRow
                    canManage={canManageManagedAccounts}
                    groupChat={groupChat}
                    isSelected={selectedGroupChatIdSet.has(groupChat.id)}
                    key={groupChat.id}
                    onConfigure={() => openReceptionDialog([groupChat])}
                    onToggleSelection={() => toggleGroupChatSelection(groupChat.id)}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell className="px-5 py-8 text-sm text-muted-foreground" colSpan={6}>
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      )}

      {!isLoading && totalPages > 1 ? (
        <div className="mt-4 flex justify-end">
          <SettingsPagination
            onPageChange={setPage}
            page={currentPage}
            totalPages={totalPages}
          />
        </div>
      ) : null}

      <GroupChatReceptionSettingsDialog
        onOpenChange={(open) => {
          if (!open) {
            setDialogState(null);
          }
        }}
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
        <span className="block max-w-[16rem] truncate font-mono text-sm text-muted-foreground">
          {truncateGroupId(groupChat.thirdGroupId)}
        </span>
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
        <Button
          aria-label={`设置 ${groupChat.name}`}
          className="h-8 rounded-[8px] px-2 text-primary"
          disabled={!canManage}
          onClick={onConfigure}
          type="button"
          variant="link"
        >
          设置
        </Button>
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
    return <span className="text-sm text-muted-foreground">0</span>;
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
          <span aria-hidden="true" className="flex -space-x-2">
            {accounts.map((account) => (
              <ManagedAccountAvatar
                avatarUrl={account.avatarUrl}
                className="size-7 ring-2 ring-background"
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

function truncateGroupId(groupId: string) {
  if (groupId.length <= 22) {
    return groupId;
  }

  return `${groupId.slice(0, 18)}...`;
}

function getInitial(name: string) {
  return name.trim().slice(0, 1) || "?";
}

function buildAvailableManagedAccounts(
  filterManagedAccounts: SettingsGroupChatsResponse["filterManagedAccounts"],
  groupChats: SettingsGroupChat[],
): GroupChatReceptionManagedAccountOption[] {
  const avatarById = new Map<string, string>();

  for (const groupChat of groupChats) {
    avatarById.set(
      groupChat.openingManagedAccount.id,
      groupChat.openingManagedAccount.avatarUrl,
    );
  }

  return filterManagedAccounts.map((account) => ({
    avatarUrl: avatarById.get(account.id) ?? "",
    id: account.id,
    name: account.name,
  }));
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
