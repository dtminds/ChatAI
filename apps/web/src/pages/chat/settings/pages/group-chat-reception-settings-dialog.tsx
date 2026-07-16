import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SettingsGroupChat } from "@chatai/contracts";
import type { FormEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const maxReceptionManagedAccountsPerGroup = 5;

export type GroupChatReceptionManagedAccountOption = {
  avatarUrl: string;
  id: string;
  name: string;
};

export type GroupChatReceptionDialogState = {
  availableManagedAccounts: GroupChatReceptionManagedAccountOption[];
  groupChats: SettingsGroupChat[];
  isLoadingOptions: boolean;
  optionsError: string;
};

type GroupChatReceptionSaveProgress = {
  completed: number;
  total: number;
};

export function GroupChatReceptionSettingsDialog({
  onOpenChange,
  onSave,
  open,
  state,
}: {
  onOpenChange: (open: boolean) => void;
  onSave: (
    groupChatIds: string[],
    hostUserSeatIds: string[],
    onProgress: (progress: GroupChatReceptionSaveProgress) => void,
  ) => void | Promise<void>;
  open: boolean;
  state: GroupChatReceptionDialogState | null;
}) {
  const pickerInputId = useId();
  const [selectedManagedAccountIds, setSelectedManagedAccountIds] = useState<string[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<GroupChatReceptionSaveProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const pickerAnchorRef = useRef<HTMLDivElement | null>(null);

  const groupChats = state?.groupChats ?? [];
  const availableManagedAccounts = state?.availableManagedAccounts ?? [];
  const isLoadingOptions = state?.isLoadingOptions ?? false;
  const optionsError = state?.optionsError ?? "";
  const isBatchMode = groupChats.length > 1;
  const singleGroupChat = groupChats.length === 1 ? groupChats[0] : null;
  const managedAccountOptions = useMemo(() => {
    const accountById = new Map(
      availableManagedAccounts.map((account) => [account.id, account] as const),
    );

    for (const account of singleGroupChat?.receptionManagedAccounts ?? []) {
      if (!accountById.has(account.id)) {
        accountById.set(account.id, account);
      }
    }

    return [...accountById.values()];
  }, [availableManagedAccounts, singleGroupChat]);
  const managedAccountById = useMemo(
    () => new Map(managedAccountOptions.map((account) => [account.id, account] as const)),
    [managedAccountOptions],
  );
  const selectedManagedAccountIdSet = useMemo(
    () => new Set(selectedManagedAccountIds),
    [selectedManagedAccountIds],
  );
  const selectedManagedAccounts = selectedManagedAccountIds
    .map((accountId) => managedAccountById.get(accountId))
    .filter((account): account is GroupChatReceptionManagedAccountOption => account != null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredManagedAccounts = normalizedQuery
    ? managedAccountOptions.filter((account) =>
        account.name.toLowerCase().includes(normalizedQuery),
      )
    : managedAccountOptions;
  const isSelectionLimitReached =
    selectedManagedAccountIds.length >= maxReceptionManagedAccountsPerGroup;

  useEffect(() => {
    if (!open || !state) {
      return;
    }

    const initialSelectedIds =
      state.groupChats.length === 1
        ? state.groupChats[0].receptionManagedAccounts
            .map((account) => account.id)
            .slice(0, maxReceptionManagedAccountsPerGroup)
        : [];

    setSelectedManagedAccountIds(initialSelectedIds);
    setIsPickerOpen(false);
    setQuery("");
    setSaving(false);
    setSaveProgress(null);
    setErrorMessage("");
  }, [open, state]);

  function toggleManagedAccount(managedAccountId: string) {
    if (isLoadingOptions || saving) {
      return;
    }

    setSelectedManagedAccountIds((current) => {
      if (current.includes(managedAccountId)) {
        return current.filter((id) => id !== managedAccountId);
      }

      if (current.length >= maxReceptionManagedAccountsPerGroup) {
        return current;
      }

      return [...current, managedAccountId];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (groupChats.length === 0 || saving) {
      return;
    }

    setSaving(true);
    setSaveProgress({ completed: 0, total: groupChats.length });
    setErrorMessage("");

    try {
      await onSave(
        groupChats.map((groupChat) => groupChat.id),
        selectedManagedAccountIds,
        setSaveProgress,
      );
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && saving) {
          return;
        }

        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="sm:max-w-[34rem]"
        closeButtonDisabled={saving}
        onOpenAutoFocus={(event) => event.preventDefault()}
        ref={setContentElement}
      >
        <DialogHeader className="pr-8">
          {singleGroupChat ? (
            <>
              <DialogTitle className="sr-only">群聊接待设置</DialogTitle>
              <div className="flex min-w-0 items-center gap-2">
                <GroupChatAvatar groupChat={singleGroupChat} />
                <p className="truncate text-sm font-medium text-foreground">
                  {singleGroupChat.name}
                </p>
              </div>
            </>
          ) : (
            <DialogTitle>已选中 {groupChats.length} 个群聊</DialogTitle>
          )}
        </DialogHeader>

        {isBatchMode ? <BatchReceptionNotice /> : null}

        <form
          aria-label={isBatchMode ? "群聊接待批量设置表单" : "群聊接待设置表单"}
          className="space-y-5"
          onSubmit={handleSubmit}
        >
          <section aria-label="可接待账号" className="space-y-2" role="group">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">群聊接待设置</h2>
              <div className="flex items-start justify-between gap-3">
                <DialogDescription>
                  选中的企微号可在对应群聊收发消息
                </DialogDescription>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {selectedManagedAccountIds.length}/{maxReceptionManagedAccountsPerGroup}
                </span>
              </div>
            </div>
            <Popover modal={false} onOpenChange={setIsPickerOpen} open={isPickerOpen}>
              <PopoverAnchor asChild>
                <div ref={pickerAnchorRef}>
                  <Input
                    aria-label="搜索并选择接待账号"
                    disabled={isLoadingOptions || saving || !!optionsError}
                    id={pickerInputId}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setIsPickerOpen(true);
                    }}
                    onFocus={() => setIsPickerOpen(true)}
                    placeholder={isLoadingOptions ? "正在加载" : "搜索并选择接待账号"}
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

                  if (
                    target instanceof Node &&
                    pickerAnchorRef.current?.contains(target)
                  ) {
                    event.preventDefault();
                  }
                }}
                onOpenAutoFocus={(event) => event.preventDefault()}
                portalContainer={contentElement}
                sideOffset={8}
              >
                {managedAccountOptions.length > 0 ? (
                  <ScrollArea className="h-[15rem]">
                    <div className="space-y-1 pr-2">
                      {filteredManagedAccounts.length > 0 ? (
                        filteredManagedAccounts.map((account) => {
                          const isSelected = selectedManagedAccountIdSet.has(account.id);
                          const isDisabled =
                            isLoadingOptions || saving || (!isSelected && isSelectionLimitReached);

                          return (
                            <label
                              className={cn(
                                "flex h-10 items-center gap-2 rounded-[8px] px-2.5 text-sm text-foreground",
                                isDisabled
                                  ? "cursor-not-allowed opacity-50"
                                  : "cursor-pointer hover:bg-surface-hover",
                              )}
                              key={account.id}
                            >
                              <Checkbox
                                aria-label={account.name}
                                checked={isSelected}
                                disabled={isDisabled}
                                onCheckedChange={() => toggleManagedAccount(account.id)}
                              />
                              <ManagedAccountIdentity account={account} />
                            </label>
                          );
                        })
                      ) : (
                        <p className="px-2.5 py-8 text-center text-sm text-muted-foreground">
                          未找到匹配账号
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="px-2.5 py-8 text-center text-sm text-muted-foreground">
                    暂无可选企微号
                  </p>
                )}
              </PopoverContent>
            </Popover>
            {selectedManagedAccounts.length > 0 ? (
              <ScrollArea className="h-[9rem] rounded-[10px] border border-border">
                <div className="space-y-1 p-2">
                  {selectedManagedAccounts.map((account) => (
                    <div
                      className="flex h-10 items-center gap-2 rounded-[8px] px-1.5 text-sm text-foreground"
                      key={account.id}
                    >
                      <ManagedAccountIdentity account={account} />
                      <Button
                        aria-label={`移除 ${account.name}`}
                        className="h-7 rounded-[8px] px-2 text-xs text-muted-foreground"
                        disabled={isLoadingOptions || saving}
                        onClick={() => toggleManagedAccount(account.id)}
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
                暂无已选择账号
              </div>
            )}
            {optionsError ? (
              <p className="text-sm text-destructive" role="alert">
                {optionsError}
              </p>
            ) : null}
            {errorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : null}
            {saveProgress ? (
              <SaveProgress progress={saveProgress} saving={saving} />
            ) : null}
          </section>

          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={saving} type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button disabled={saving || isLoadingOptions || !!optionsError} type="submit">
              {saving ? (
                <>
                  <Spinner
                    aria-hidden="true"
                    className="text-current"
                    size={14}
                    variant="classic"
                  />
                  <span>保存中</span>
                </>
              ) : (
                isBatchMode && errorMessage ? "重试" : "确认提交"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SaveProgress({
  progress,
  saving,
}: {
  progress: GroupChatReceptionSaveProgress;
  saving: boolean;
}) {
  const percentage = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <div className="space-y-2" role="status">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{saving ? "正在设置" : "设置进度"}</span>
        <span>{progress.completed}/{progress.total}</span>
      </div>
      <Progress aria-label="设置进度" value={percentage} />
    </div>
  );
}

function BatchReceptionNotice() {
  return (
    <Alert
      aria-label="注意事项：请确保设置的企微号已加入每一个所选的群聊中"
      className="border-info/30 bg-info/5 text-info"
    >
      <HugeiconsIcon
        aria-hidden="true"
        color="currentColor"
        icon={InformationCircleIcon}
        size={16}
        strokeWidth={1.8}
      />
      <AlertDescription className="text-info">
        注意事项：请确保设置的企微号已加入每一个所选的群聊中
      </AlertDescription>
    </Alert>
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

function ManagedAccountIdentity({
  account,
}: {
  account: GroupChatReceptionManagedAccountOption;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Avatar aria-hidden="true" className="size-7 rounded-full border border-surface">
        {account.avatarUrl ? <AvatarImage alt={account.name} src={account.avatarUrl} /> : null}
        <AvatarFallback className="rounded-full bg-primary/15 text-xs text-primary">
          {getInitial(account.name)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{account.name}</span>
    </div>
  );
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

  return "保存失败，请稍后重试";
}
