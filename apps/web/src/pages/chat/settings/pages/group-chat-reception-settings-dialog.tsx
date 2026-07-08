import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SettingsGroupChat } from "@chatai/contracts";
import type { FormEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";

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
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
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
};

export function GroupChatReceptionSettingsDialog({
  onOpenChange,
  open,
  state,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  state: GroupChatReceptionDialogState | null;
}) {
  const pickerInputId = useId();
  const [selectedManagedAccountIds, setSelectedManagedAccountIds] = useState<string[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);

  const groupChats = state?.groupChats ?? [];
  const availableManagedAccounts = state?.availableManagedAccounts ?? [];
  const isBatchMode = groupChats.length > 1;
  const singleGroupChat = groupChats.length === 1 ? groupChats[0] : null;
  const selectedManagedAccountIdSet = useMemo(
    () => new Set(selectedManagedAccountIds),
    [selectedManagedAccountIds],
  );
  const selectedManagedAccounts = availableManagedAccounts.filter((account) =>
    selectedManagedAccountIdSet.has(account.id),
  );
  const selectionSummary =
    selectedManagedAccounts.length > 0
      ? selectedManagedAccounts.map((account) => account.name).join("，")
      : "";
  const isSelectionLimitReached =
    selectedManagedAccountIds.length >= maxReceptionManagedAccountsPerGroup;

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedManagedAccountIds([]);
    setIsPickerOpen(false);
  }, [open, state]);

  function toggleManagedAccount(managedAccountId: string) {
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[34rem]"
        onOpenAutoFocus={(event) => event.preventDefault()}
        ref={setContentElement}
      >
        <DialogHeader>
          <DialogTitle>{isBatchMode ? "群聊接待批量设置" : "群聊接待设置"}</DialogTitle>
          <DialogDescription className="space-y-2 pt-1">
            <span className="block">可接待的企微号即可在对应群聊收发消息</span>
            {isBatchMode ? (
              <span className="block text-muted-foreground">
                注意事项：请确保选择的企微号都在所选的群聊中，否则将会忽略
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {singleGroupChat ? (
          <div className="flex min-w-0 items-center gap-2 rounded-[10px] border border-border px-3 py-3">
            <GroupChatAvatar groupChat={singleGroupChat} />
            <p className="truncate text-sm font-medium text-foreground">{singleGroupChat.name}</p>
          </div>
        ) : null}

        <form
          aria-label={isBatchMode ? "群聊接待批量设置表单" : "群聊接待设置表单"}
          className="space-y-5"
          onSubmit={handleSubmit}
        >
          <div className="space-y-2">
            <Label htmlFor={pickerInputId}>可接待的企微号</Label>
            <p className="text-sm text-muted-foreground">每个群聊最多选择 5 个</p>
            <Popover modal={false} onOpenChange={setIsPickerOpen} open={isPickerOpen}>
              <PopoverAnchor asChild>
                <PopoverTrigger asChild>
                  <Button
                    aria-label="选择可接待企微号"
                    className="h-10 w-full justify-between rounded-[8px] px-3 font-normal"
                    id={pickerInputId}
                    type="button"
                    variant="outline"
                  >
                    <span
                      className={cn(
                        "truncate",
                        selectionSummary ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {selectionSummary || "请选择企微号"}
                    </span>
                    <HugeiconsIcon
                      aria-hidden="true"
                      color="currentColor"
                      icon={ArrowDown01Icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                  </Button>
                </PopoverTrigger>
              </PopoverAnchor>
              <PopoverContent
                align="start"
                className="w-[var(--radix-popper-anchor-width)] rounded-[10px] p-2"
                onCloseAutoFocus={(event) => event.preventDefault()}
                onOpenAutoFocus={(event) => event.preventDefault()}
                portalContainer={contentElement}
                sideOffset={8}
              >
                {availableManagedAccounts.length > 0 ? (
                  <ScrollArea className="h-[15rem]">
                    <div className="space-y-1 pr-2">
                      {availableManagedAccounts.map((account) => {
                        const isSelected = selectedManagedAccountIdSet.has(account.id);
                        const isDisabled = !isSelected && isSelectionLimitReached;

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
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="px-2.5 py-8 text-center text-sm text-muted-foreground">
                    暂无可选企微号
                  </p>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button type="submit">确认提交</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
