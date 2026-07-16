import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  AiHostingGroupChatReplyMode,
  AiHostingSettingsAccount,
  AiHostingSettingsAgentOption,
} from "@chatai/contracts";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  AgentAssociationField,
  FULL_AUTO_AUTH_UNAVAILABLE_MESSAGE,
  PermissionSettingRow,
  getErrorMessage,
  getInitial,
} from "./hosting-settings-shared";

export type GroupChatSettingsDraft = {
  agentId: string;
  fullAutoAuth: boolean;
  replyMode: AiHostingGroupChatReplyMode;
  semiAutoAuth: boolean;
};

type HostingAccount = AiHostingSettingsAccount;
type HostingAgent = AiHostingSettingsAgentOption;

const SELECTED_ACCOUNT_PREVIEW_LIMIT = 5;
export function GroupChatSettingsDialog({
  accounts,
  agents,
  fullAutoAuthAvailable,
  onGoToAddAgent,
  onOpenChange,
  onSave,
  open,
  targetAccountIds,
}: {
  accounts: HostingAccount[];
  agents: HostingAgent[];
  fullAutoAuthAvailable: boolean;
  onGoToAddAgent: () => void;
  onOpenChange: (open: boolean) => void;
  onSave: (accountIds: string[], draft: GroupChatSettingsDraft) => void | Promise<void>;
  open: boolean;
  targetAccountIds: string[];
}) {
  const navigate = useNavigate();
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const [fullAutoAuth, setFullAutoAuth] = useState(false);
  const [replyMode, setReplyMode] = useState<AiHostingGroupChatReplyMode>(1);
  const [semiAutoAuth, setSemiAutoAuth] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  const targetAccounts = useMemo(
    () => accounts.filter((account) => targetAccountIds.includes(account.id)),
    [accounts, targetAccountIds],
  );
  const isBatchMode = targetAccounts.length > 1;
  const singleAccount = targetAccounts.length === 1 ? targetAccounts[0] : null;
  const fullAutoAuthDisabled = !fullAutoAuthAvailable && !fullAutoAuth;

  useEffect(() => {
    if (!open || targetAccounts.length === 0) {
      return;
    }

    if (targetAccounts.length === 1) {
      const account = targetAccounts[0];
      const matchedAgentId =
        account.groupChat.agentId &&
        agents.some((agent) => agent.id === account.groupChat.agentId && agent.isPublished)
          ? account.groupChat.agentId
          : undefined;

      setAgentId(matchedAgentId);
      setFullAutoAuth(account.groupChat.fullAutoAuth);
      setReplyMode(account.groupChat.replyMode ?? 1);
      setSemiAutoAuth(account.groupChat.semiAutoAuth);
      setSaving(false);
      setValidationMessage("");
      return;
    }

    setAgentId(undefined);
    setFullAutoAuth(false);
    setReplyMode(1);
    setSemiAutoAuth(false);
    setSaving(false);
    setValidationMessage("");
  }, [agents, open, targetAccounts]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (targetAccountIds.length === 0 || saving) {
      return;
    }

    const selectedAgent = agents.find((agent) => agent.id === agentId);

    if (!selectedAgent?.isPublished) {
      setValidationMessage("请选择已发布 Agent");
      return;
    }

    setSaving(true);
    setValidationMessage("");

    try {
      await onSave(targetAccountIds, {
        agentId: selectedAgent.id,
        fullAutoAuth,
        replyMode,
        semiAutoAuth,
      });
    } catch (error) {
      setValidationMessage(getErrorMessage(error, "群聊设置保存失败"));
    } finally {
      setSaving(false);
    }
  }

  function handleGoToAddAgent() {
    onGoToAddAgent();
    navigate("/chat/ai-hosting/agents/new");
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 p-0 sm:max-w-[34rem]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{isBatchMode ? "群聊批量设置" : "群聊设置"}</DialogTitle>
        </DialogHeader>

        <form className="space-y-5 px-6 py-5" onSubmit={handleSubmit}>
          {singleAccount ? (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar className="size-8 rounded-full">
                {singleAccount.avatarUrl ? (
                  <AvatarImage alt={`${singleAccount.name}头像`} src={singleAccount.avatarUrl} />
                ) : null}
                <AvatarFallback className="rounded-full bg-emerald-500 text-xs font-medium text-white">
                  {getInitial(singleAccount.name)}
                </AvatarFallback>
              </Avatar>
              <p className="truncate text-sm font-medium text-foreground">{singleAccount.name}</p>
            </div>
          ) : isBatchMode ? (
            <SelectedAccountsPreview accounts={targetAccounts} />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="group-chat-settings-agent">关联Agent</Label>
            <AgentAssociationField
              agentId={agentId}
              agents={agents}
              id="group-chat-settings-agent"
              onAgentIdChange={(value) => {
                setAgentId(value);
                setValidationMessage("");
              }}
              onGoToAddAgent={handleGoToAddAgent}
              placeholder="请选择使用哪个Agent在群内进行回复"
            />
            {validationMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {validationMessage}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">托管设置</h3>
            <div className="overflow-hidden rounded-[8px] border border-border">
              <PermissionSettingRow
                checked={fullAutoAuth}
                className={fullAutoAuth ? "border-b-0" : undefined}
                description="开启后群聊自动进入托管模式，Agent将自动回复群内被@的消息"
                disabled={fullAutoAuthDisabled}
                id="group-chat-settings-auto-hosting"
                onCheckedChange={setFullAutoAuth}
                title="允许开启 AI回复"
                tooltip={fullAutoAuthDisabled ? FULL_AUTO_AUTH_UNAVAILABLE_MESSAGE : undefined}
              />
              {fullAutoAuth ? (
                <div className="px-4 pb-3 pt-1">
                  <div className="space-y-2 rounded-[8px] bg-surface-muted px-3 py-3">
                    <p className="text-sm font-medium text-foreground">回复规则</p>
                    <ReplyRuleSelector onValueChange={setReplyMode} value={replyMode} />
                  </div>
                </div>
              ) : null}
              <PermissionSettingRow
                checked={semiAutoAuth}
                className={fullAutoAuth ? "border-t border-border" : undefined}
                description="Agent 会自动生成回复建议，提升客服服务效率"
                id="group-chat-settings-script-recommendation"
                onCheckedChange={setSemiAutoAuth}
                title="允许话术推荐"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button disabled={saving} type="submit">
              {saving ? (
                <>
                  <Spinner aria-hidden="true" size={14} />
                  <span>保存中</span>
                </>
              ) : (
                "保存设置"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReplyRuleSelector({
  onValueChange,
  value,
}: {
  onValueChange: (value: AiHostingGroupChatReplyMode) => void;
  value: AiHostingGroupChatReplyMode;
}) {
  return (
    <SegmentedControl
      aria-label="回复规则"
      className="h-auto w-full flex-wrap gap-2 rounded-none border-0 bg-transparent p-0"
      onValueChange={(nextValue) => {
        if (nextValue === "1") {
          onValueChange(1);
        }

        if (nextValue === "2") {
          onValueChange(2);
        }
      }}
      type="single"
      value={String(value)}
    >
      <SegmentedControlItem
        className="h-10 min-w-0 flex-1 rounded-[8px] border border-border bg-background px-4 text-sm font-medium text-foreground data-[state=on]:border-primary/70 data-[state=on]:bg-primary/[0.06] data-[state=on]:text-primary data-[state=on]:shadow-none"
        value="1"
      >
        回复时引用消息
      </SegmentedControlItem>
      <SegmentedControlItem
        className="h-10 min-w-0 flex-1 rounded-[8px] border border-border bg-background px-4 text-sm font-medium text-foreground data-[state=on]:border-primary/70 data-[state=on]:bg-primary/[0.06] data-[state=on]:text-primary data-[state=on]:shadow-none"
        value="2"
      >
        回复时@客户
      </SegmentedControlItem>
    </SegmentedControl>
  );
}

function SelectedAccountsPreview({ accounts }: { accounts: HostingAccount[] }) {
  const previewAccounts = accounts.slice(0, SELECTED_ACCOUNT_PREVIEW_LIMIT);
  const remainingCount = accounts.length - previewAccounts.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="sr-only">{accounts.map((account) => account.name).join("、")}</span>
      <div className="flex items-center">
        {previewAccounts.map((account, index) => (
          <Avatar
            className={cn(
              "size-10 rounded-full border-2 border-background",
              index > 0 && "-ml-2",
            )}
            key={account.id}
            title={account.name}
          >
            {account.avatarUrl ? (
              <AvatarImage alt={`${account.name}头像`} src={account.avatarUrl} />
            ) : null}
            <AvatarFallback className="rounded-full bg-emerald-500 text-xs font-medium text-white">
              {getInitial(account.name)}
            </AvatarFallback>
          </Avatar>
        ))}
        {remainingCount > 0 ? (
          <span
            aria-hidden="true"
            className="-ml-2 inline-flex size-10 items-center justify-center rounded-full border-2 border-background bg-muted text-muted-foreground"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.8} />
          </span>
        ) : null}
      </div>
      {remainingCount > 0 ? (
        <span className="text-sm text-muted-foreground">等{remainingCount}个账号</span>
      ) : null}
    </div>
  );
}
