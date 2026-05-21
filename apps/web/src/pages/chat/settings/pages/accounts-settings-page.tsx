import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  SettingsManagedAccount,
  SettingsManagedAccountSubAccount,
  SettingsManagedAccountsResponse,
} from "@chatai/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listManagedAccounts,
  updateManagedAccountSubAccounts,
} from "@/pages/chat/settings/settings-service";
import { PageHeader, StatusText } from "@/pages/chat/settings/shared";
import { useSettingsPermissions } from "@/pages/chat/settings/use-settings-permissions";
import { cn } from "@/lib/utils";

type DialogState = {
  managedAccount: SettingsManagedAccount;
};

const emptyData: SettingsManagedAccountsResponse = {
  managedAccounts: [],
  subAccounts: [],
};

export function AccountsSettingsPage() {
  const { canManageManagedAccounts } = useSettingsPermissions();
  const [data, setData] = useState<SettingsManagedAccountsResponse>(emptyData);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await listManagedAccounts();

        if (!ignore) {
          setData(response);
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
  }, []);

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return data.managedAccounts;
    }

    return data.managedAccounts.filter((account) =>
      account.name.toLowerCase().includes(normalizedQuery),
    );
  }, [data.managedAccounts, query]);

  async function handleSubmit(managedAccount: SettingsManagedAccount, subAccountIds: string[]) {
    setPendingAccountId(managedAccount.id);

    try {
      const nextManagedAccount = await updateManagedAccountSubAccounts(managedAccount.id, {
        subAccountIds,
      });

      setData((current) => ({
        ...current,
        managedAccounts: current.managedAccounts.map((account) =>
          account.id === nextManagedAccount.id ? nextManagedAccount : account,
        ),
      }));
      setDialogState(null);
      toast.success("关联子账号已更新");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingAccountId(null);
    }
  }

  return (
    <>
      <PageHeader
        description="查看托管账号在线状态，并配置可接管该账号的子账号"
        eyebrow="SETTINGS / MANAGED ACCOUNTS"
        title="托管账号"
      />

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-[280px]">
          <HugeiconsIcon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            color="currentColor"
            icon={Search01Icon}
            size={17}
            strokeWidth={1.8}
          />
          <Input
            aria-label="搜索托管账号"
            className="h-10 rounded-[8px] pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索托管账号"
            value={query}
          />
        </div>
      </section>

      {errorMessage ? (
        <section className="mt-6 rounded-[10px] border border-destructive/30 bg-destructive-muted p-5 text-sm text-destructive">
          {errorMessage}
        </section>
      ) : (
        <section className="mt-6 overflow-hidden rounded-[10px] border border-border">
          <Table aria-label="托管账号列表">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[32%] px-5 py-4">托管账号</TableHead>
                <TableHead className="w-[16%] px-5 py-4">在线状态</TableHead>
                <TableHead className="w-[34%] px-5 py-4">关联子账号</TableHead>
                <TableHead className="px-5 py-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell className="px-5 py-10" colSpan={4}>
                    <div
                      aria-label="正在加载托管账号"
                      className="flex items-center justify-center gap-3 text-sm text-muted-foreground"
                      role="status"
                    >
                      <DotMatrixLoader
                        ariaLabel="正在加载"
                        className="text-foreground"
                        dotSize={3}
                        size={22}
                      />
                      <span>正在加载托管账号</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredAccounts.length > 0 ? (
                filteredAccounts.map((account) => (
                  <ManagedAccountRow
                    account={account}
                    canManage={canManageManagedAccounts}
                    isSubmitting={pendingAccountId === account.id}
                    key={account.id}
                    onAssign={() => setDialogState({ managedAccount: account })}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell className="px-5 py-8 text-sm text-muted-foreground" colSpan={4}>
                    暂无托管账号
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      )}

      <SubAccountRelationDialog
        isSubmitting={pendingAccountId === dialogState?.managedAccount.id}
        onOpenChange={(open) => {
          if (!open) {
            setDialogState(null);
          }
        }}
        onSubmit={handleSubmit}
        open={!!dialogState}
        state={dialogState}
        subAccounts={data.subAccounts}
      />
    </>
  );
}

function ManagedAccountRow({
  account,
  canManage,
  isSubmitting,
  onAssign,
}: {
  account: SettingsManagedAccount;
  canManage: boolean;
  isSubmitting: boolean;
  onAssign: () => void;
}) {
  const isOnline = account.onlineStatus === "online";

  return (
    <TableRow>
      <TableCell className="px-5 py-5">
        <div className="flex min-w-0 items-center gap-2">
          <ManagedAccountAvatar account={account} />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{account.name}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-5 py-5">
        <StatusText tone={isOnline ? "success" : "muted"}>
          {isOnline ? "在线" : "离线"}
        </StatusText>
      </TableCell>
      <TableCell className="px-5 py-5">
        <RelatedSubAccountsPreview
          managedAccountName={account.name}
          subAccounts={account.subAccounts}
        />
      </TableCell>
      <TableCell className="px-5 py-5">
        <Button
          className="h-8 px-3 text-primary"
          disabled={!canManage || isSubmitting}
          onClick={onAssign}
          type="button"
          variant="ghost"
        >
          关联子账号
        </Button>
      </TableCell>
    </TableRow>
  );
}

function RelatedSubAccountsPreview({
  managedAccountName,
  subAccounts,
}: {
  managedAccountName: string;
  subAccounts: SettingsManagedAccountSubAccount[];
}) {
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  if (subAccounts.length === 0) {
    return <span className="text-sm text-muted-foreground">未关联</span>;
  }

  const displaySubAccounts = sortSubAccountsForDisplay(subAccounts);
  const visibleSubAccounts = displaySubAccounts.slice(0, 3);
  const summary = visibleSubAccounts
    .map(formatSubAccountName)
    .join("，")
    .concat(subAccounts.length > 3 ? `等${subAccounts.length}人` : "");

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
        <Button
          aria-label={`查看 ${managedAccountName} 的全部关联子账号`}
          className="h-8 max-w-full justify-start p-0 text-left text-sm font-normal hover:bg-transparent"
          onBlur={scheduleClosePopover}
          onFocus={openPopover}
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClosePopover}
          type="button"
          variant="ghost"
        >
          <span className="block max-w-full truncate text-foreground">{summary}</span>
        </Button>
      </PopoverTrigger>
      <RelatedSubAccountsPopoverContent
        onCloseRequest={scheduleClosePopover}
        onOpenRequest={openPopover}
        subAccounts={displaySubAccounts}
      />
    </Popover>
  );
}

function RelatedSubAccountsPopoverContent({
  onCloseRequest,
  onOpenRequest,
  subAccounts,
}: {
  onCloseRequest: () => void;
  onOpenRequest: () => void;
  subAccounts: SettingsManagedAccountSubAccount[];
}) {
  return (
    <PopoverContent
      align="start"
      className="w-[20rem] p-3"
      onBlur={onCloseRequest}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onFocus={onOpenRequest}
      onMouseEnter={onOpenRequest}
      onMouseLeave={onCloseRequest}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-2.5">
          <p className="text-sm font-medium text-foreground">
            关联子账号 · {subAccounts.length}
          </p>
        </div>
        <ScrollArea className="h-[16rem]">
          <div className="space-y-1 pr-2">
            {subAccounts.map((subAccount) => (
              <div
                className="flex h-10 items-center gap-2 rounded-[8px] px-2.5 text-sm text-foreground"
                key={subAccount.id}
              >
                <SubAccountIdentity
                  name={formatSubAccountName(subAccount)}
                  subAccount={subAccount}
                />
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </PopoverContent>
  );
}

function SubAccountRelationDialog({
  isSubmitting,
  onOpenChange,
  onSubmit,
  open,
  state,
  subAccounts,
}: {
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (managedAccount: SettingsManagedAccount, subAccountIds: string[]) => Promise<void>;
  open: boolean;
  state: DialogState | null;
  subAccounts: SettingsManagedAccountSubAccount[];
}) {
  const [query, setQuery] = useState("");
  const [selectedSubAccountIds, setSelectedSubAccountIds] = useState<string[]>([]);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const managedAccount = state?.managedAccount;

  useEffect(() => {
    if (!state) {
      return;
    }

    setQuery("");
    setSelectedSubAccountIds(
      state.managedAccount.subAccounts.map((subAccount) => subAccount.id),
    );
  }, [state]);

  function toggleSubAccount(subAccountId: string) {
    setSelectedSubAccountIds((current) =>
      current.includes(subAccountId)
        ? current.filter((item) => item !== subAccountId)
        : [...current, subAccountId],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[34rem]"
        onOpenAutoFocus={(event) => event.preventDefault()}
        ref={setContentElement}
      >
        <DialogHeader>
          <DialogTitle>关联子账号</DialogTitle>
          <DialogDescription>
            {managedAccount ? `配置 ${managedAccount.name} 可被哪些子账号接管` : ""}
          </DialogDescription>
        </DialogHeader>

        {managedAccount ? (
          <form
            aria-label="关联子账号表单"
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit(managedAccount, selectedSubAccountIds);
            }}
          >
            <SubAccountSelectionList
              onQueryChange={setQuery}
              pickerPortalContainer={contentElement}
              onToggleSubAccount={toggleSubAccount}
              query={query}
              selectedSubAccountIds={selectedSubAccountIds}
              subAccounts={subAccounts}
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={isSubmitting} type="button" variant="outline">
                  取消
                </Button>
              </DialogClose>
              <Button disabled={isSubmitting} type="submit">
                确认提交
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SubAccountSelectionList({
  onQueryChange,
  onToggleSubAccount,
  pickerPortalContainer,
  query,
  selectedSubAccountIds,
  subAccounts,
}: {
  onQueryChange: (query: string) => void;
  onToggleSubAccount: (subAccountId: string) => void;
  pickerPortalContainer?: HTMLElement | null;
  query: string;
  selectedSubAccountIds: string[];
  subAccounts: SettingsManagedAccountSubAccount[];
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerAnchorRef = useRef<HTMLDivElement | null>(null);
  const selectedSubAccountIdSet = new Set(selectedSubAccountIds);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSubAccounts = normalizedQuery
    ? subAccounts.filter((subAccount) =>
        [subAccount.name, subAccount.account].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ),
      )
    : subAccounts;
  const selectedSubAccounts = subAccounts.filter((subAccount) =>
    selectedSubAccountIdSet.has(subAccount.id),
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">分配子账号</h2>
        <span className="text-xs text-muted-foreground">
          已选择 {selectedSubAccountIds.length} 个
        </span>
      </div>

      <Popover modal={false} onOpenChange={setIsPickerOpen} open={isPickerOpen}>
        <PopoverAnchor asChild>
          <div ref={pickerAnchorRef}>
            <Input
              aria-label="搜索并选择子账号"
              className="h-9 rounded-[8px]"
              onChange={(event) => {
                onQueryChange(event.target.value);
                setIsPickerOpen(true);
              }}
              onFocus={() => setIsPickerOpen(true)}
              placeholder="搜索并选择子账号"
              value={query}
            />
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          className="w-[var(--radix-popper-anchor-width)] rounded-[10px] p-2"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            const target = event.target;

            if (target instanceof Node && pickerAnchorRef.current?.contains(target)) {
              event.preventDefault();
            }
          }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          portalContainer={pickerPortalContainer}
          sideOffset={8}
        >
          {subAccounts.length > 0 ? (
            <ScrollArea className="h-[15rem]">
              <div className="space-y-1 pr-2">
                {filteredSubAccounts.length > 0 ? (
                  filteredSubAccounts.map((subAccount) => (
                    <label
                      className="flex h-10 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 text-sm text-foreground hover:bg-surface-hover"
                      key={subAccount.id}
                    >
                      <Checkbox
                        aria-label={subAccount.name}
                        checked={selectedSubAccountIdSet.has(subAccount.id)}
                        onCheckedChange={() => onToggleSubAccount(subAccount.id)}
                      />
                      <SubAccountIdentity subAccount={subAccount} />
                    </label>
                  ))
                ) : (
                  <p className="px-2.5 py-8 text-center text-sm text-muted-foreground">
                    未找到匹配子账号
                  </p>
                )}
              </div>
            </ScrollArea>
          ) : (
            <p className="px-2.5 py-8 text-center text-sm text-muted-foreground">
              暂无可分配子账号
            </p>
          )}
        </PopoverContent>
      </Popover>

      {selectedSubAccounts.length > 0 ? (
        <ScrollArea className="h-[9rem] rounded-[10px] border border-border">
          <div className="space-y-1 p-2">
            {selectedSubAccounts.map((subAccount) => (
              <div
                className="flex h-10 items-center gap-2 rounded-[8px] px-2.5 text-sm text-foreground"
                key={subAccount.id}
              >
                <SubAccountIdentity subAccount={subAccount} />
                <Button
                  className="h-7 rounded-[8px] px-2 text-xs text-muted-foreground"
                  onClick={() => onToggleSubAccount(subAccount.id)}
                  type="button"
                  variant="ghost"
                >
                  移除
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="rounded-[10px] border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          暂无已分配子账号
        </div>
      )}
    </section>
  );
}

function SubAccountIdentity({
  name,
  subAccount,
}: {
  name?: string;
  subAccount: SettingsManagedAccountSubAccount;
}) {
  const isActive = subAccount.status === "active";

  return (
    <div className="flex min-w-0 flex-1 items-center justify-start gap-2">
      <Badge
        aria-label={subAccount.type === 1 ? "账号类型：主账号" : "账号类型：子账号"}
        className={
          subAccount.type === 1
            ? "shrink-0 bg-primary/12 text-primary"
            : "shrink-0 bg-success-muted text-success"
        }
        variant={subAccount.type === 1 ? "default" : "secondary"}
      >
        {subAccount.type === 1 ? "主账号" : "子账号"}
      </Badge>
      <span className="min-w-0 max-w-[9rem] truncate">{name ?? subAccount.name}</span>
      {isActive ? null : (
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          已停用
        </span>
      )}
    </div>
  );
}

function ManagedAccountAvatar({
  account,
  className,
}: {
  account: SettingsManagedAccount;
  className?: string;
}) {
  return (
    <Avatar
      aria-label={`托管账号 ${account.name}`}
      className={cn("size-8 rounded-full border-2 border-surface", className)}
      title={account.name}
    >
      {account.avatarUrl ? (
        <img
          alt={account.name}
          className="absolute inset-0 size-full rounded-[inherit] object-cover"
          src={account.avatarUrl}
        />
      ) : null}
      <AvatarFallback className="rounded-full bg-primary/15 text-xs text-primary">
        {getInitial(account.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function sortSubAccountsForDisplay(
  subAccounts: SettingsManagedAccountSubAccount[],
) {
  return [...subAccounts].sort((left, right) =>
    Number(right.isTakingOver) - Number(left.isTakingOver),
  );
}

function formatSubAccountName(subAccount: SettingsManagedAccountSubAccount) {
  return subAccount.isTakingOver
    ? `${subAccount.name}（接管中）`
    : subAccount.name;
}

function getInitial(name: string) {
  return name.trim().slice(0, 1) || "?";
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
